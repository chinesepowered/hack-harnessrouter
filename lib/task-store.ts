import 'server-only';
import type { Finding, SeverityCounts, TaskSource } from '../shared/types';

/**
 * Per-user task records. The browser never sees upstream ids (response_id, session_id) or
 * download_urls: only the product's own taskId and sanitized status/result. Each record is
 * owned by exactly one product user id and every route checks ownership.
 *
 * Two backends:
 *  - MemoryStore (default): a process-global map. Fine for `next dev` and a single warm serverless
 *    instance (enough for the live verification), but NOT durable across serverless invocations.
 *  - KvStore: Vercel KV / Upstash Redis over REST, selected automatically when the env vars are
 *    present. Use this in production on Vercel so tasks survive and can be listed/continued.
 */

export type TaskStatus =
  | 'starting'
  | 'in_progress'
  | 'completed'
  | 'incomplete'
  | 'failed'
  | 'cancelled';

export interface StoredFile {
  path: string; // session-relative path, e.g. "report/index.html"
  filename: string; // last path segment
  bytes: number;
  mediaType: string;
}

export interface TaskRecord {
  taskId: string;
  userId: string;
  harnessId: string;
  idempotencyKey: string;
  status: TaskStatus;
  input: string; // the end user's own typed request (their data; never exposed to other users)
  responseId?: string; // upstream, server-only, never sent to the browser
  sessionId?: string; // upstream, server-only, never sent to the browser
  answer?: string;
  files?: StoredFile[];
  title?: string; // from the agent's manifest.json
  summary?: string; // from the agent's manifest.json
  entry?: string; // report entry point, relative to the output folder (e.g. "index.html")
  incompleteReason?: string;
  roleMismatch?: boolean;
  parentTaskId?: string; // set on a follow-up turn
  findings?: Finding[]; // normalized from report/findings.json (snapshot at settle time)
  counts?: SeverityCounts;
  findingsChecked?: boolean; // true once we've looked for findings.json (avoids refetching)
  source?: TaskSource; // e.g. the GitHub repo this scan was run on
  createdAt: number;
  updatedAt: number;
}

export interface TaskStore {
  get(taskId: string): Promise<TaskRecord | undefined>;
  put(rec: TaskRecord): Promise<void>;
  listByUser(userId: string): Promise<TaskRecord[]>;
}

// ── in-memory (dev / single instance) ─────────────────────────────────────────────────────────
interface Bag {
  tasks: Map<string, TaskRecord>;
  byUser: Map<string, Set<string>>;
}
const g = globalThis as unknown as { __sentinelStore?: Bag };
function bag(): Bag {
  return (g.__sentinelStore ??= { tasks: new Map(), byUser: new Map() });
}

export class MemoryStore implements TaskStore {
  async get(taskId: string): Promise<TaskRecord | undefined> {
    const r = bag().tasks.get(taskId);
    return r ? { ...r } : undefined;
  }
  async put(rec: TaskRecord): Promise<void> {
    const b = bag();
    b.tasks.set(rec.taskId, { ...rec });
    let set = b.byUser.get(rec.userId);
    if (!set) b.byUser.set(rec.userId, (set = new Set()));
    set.add(rec.taskId);
  }
  async listByUser(userId: string): Promise<TaskRecord[]> {
    const b = bag();
    const ids = b.byUser.get(userId) ?? new Set<string>();
    return [...ids]
      .map((id) => b.tasks.get(id))
      .filter((r): r is TaskRecord => Boolean(r))
      .map((r) => ({ ...r }))
      .sort((a, b2) => b2.createdAt - a.createdAt);
  }
}

// ── Vercel KV / Upstash Redis over REST (production) ────────────────────────────────────────────
function kvEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

class KvStore implements TaskStore {
  private readonly url: string;
  private readonly token: string;
  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }
  private async cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`KV error ${res.status}`);
    const j = (await res.json()) as { result: T };
    return j.result;
  }
  async get(taskId: string): Promise<TaskRecord | undefined> {
    const s = await this.cmd<string | null>('GET', `sentinel:task:${taskId}`);
    return s ? (JSON.parse(s) as TaskRecord) : undefined;
  }
  async put(rec: TaskRecord): Promise<void> {
    await this.cmd('SET', `sentinel:task:${rec.taskId}`, JSON.stringify(rec));
    await this.cmd('SADD', `sentinel:user:${rec.userId}`, rec.taskId);
  }
  async listByUser(userId: string): Promise<TaskRecord[]> {
    const ids = (await this.cmd<string[]>('SMEMBERS', `sentinel:user:${userId}`)) || [];
    const recs = await Promise.all(ids.map((id) => this.get(id)));
    return recs
      .filter((r): r is TaskRecord => Boolean(r))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}

// ── TiDB Serverless (MySQL-compatible) via the HTTP serverless driver ───────────────────────────
// Connectionless over HTTPS: no TCP pool to exhaust, ideal for Vercel serverless functions.
type Exec = (sql: string, params?: unknown[]) => Promise<unknown>;

function tidbUrl(): string | null {
  return (process.env.DATABASE_URL || process.env.TIDB_DATABASE_URL || '').trim() || null;
}

/** Build an executor from a TiDB Cloud serverless connection string. Driver loaded lazily. */
function tidbExec(url: string): () => Promise<Exec> {
  return async () => {
    const { connect } = await import('@tidbcloud/serverless');
    const conn = connect({ url });
    return (sql: string, params: unknown[] = []) => conn.execute(sql, params);
  };
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS sentinel_tasks (
  task_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  created_at BIGINT NOT NULL,
  data JSON NOT NULL,
  INDEX idx_user_created (user_id, created_at)
)`;

export class TiDBStore implements TaskStore {
  private readonly makeExec: () => Promise<Exec>;
  private execP: Promise<Exec> | null = null;
  constructor(makeExec: () => Promise<Exec>) {
    this.makeExec = makeExec;
  }
  /** One-time: build the executor and ensure the table exists (shared across concurrent callers). */
  private exec(): Promise<Exec> {
    return (this.execP ??= (async () => {
      const e = await this.makeExec();
      await e(CREATE_TABLE);
      return e;
    })());
  }
  // The driver decodes JSON columns to objects; a string value is tolerated too.
  private static decode(row: { data: unknown }): TaskRecord {
    return (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as TaskRecord;
  }
  async get(taskId: string): Promise<TaskRecord | undefined> {
    const e = await this.exec();
    const rows = (await e('SELECT data FROM sentinel_tasks WHERE task_id = ?', [taskId])) as Array<{ data: unknown }>;
    return rows && rows.length ? TiDBStore.decode(rows[0]) : undefined;
  }
  async put(rec: TaskRecord): Promise<void> {
    const e = await this.exec();
    await e(
      `INSERT INTO sentinel_tasks (task_id, user_id, created_at, data) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), created_at = VALUES(created_at), data = VALUES(data)`,
      [rec.taskId, rec.userId, rec.createdAt, JSON.stringify(rec)],
    );
  }
  async listByUser(userId: string): Promise<TaskRecord[]> {
    const e = await this.exec();
    const rows = (await e(
      'SELECT data FROM sentinel_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
      [userId],
    )) as Array<{ data: unknown }>;
    return (rows || []).map((r) => TiDBStore.decode(r));
  }
}

let _store: TaskStore | undefined;
let _warned = false;
export function getStore(): TaskStore {
  if (_store) return _store;
  const url = tidbUrl();
  const kv = kvEnv();
  if (url) {
    _store = new TiDBStore(tidbExec(url)); // preferred durable store
  } else if (kv) {
    _store = new KvStore(kv.url, kv.token);
  } else {
    if (!_warned) {
      _warned = true;
      console.warn(
        '[sentinel] No durable store configured; using in-memory task store (not durable across serverless invocations). Set DATABASE_URL (TiDB Serverless) or KV_REST_API_URL + KV_REST_API_TOKEN for production.',
      );
    }
    _store = new MemoryStore();
  }
  return _store;
}
