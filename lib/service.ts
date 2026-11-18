import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  HarnessRouter,
  HRError,
  answerText,
  signPreview,
  verifyPreview,
  previewFile,
  downloadFile,
  TERMINAL_STATUSES,
  type SessionFile,
  type HRResponse,
  type Served,
} from './harnessrouter';
import { getStore, type TaskRecord, type TaskStatus, type StoredFile } from './task-store';
import { previewSecretBuf } from './secrets';
import handoff from '../harnessrouter.json';

/**
 * The server side of the feature. The browser talks only to our routes; this module is the only
 * thing that talks to HarnessRouter. It maps our single feature to its own harness_id, runs tasks
 * in background mode (serverless-friendly: no held-open stream), polls to completion, and turns
 * raw responses into sanitized, owner-scoped product results.
 */

export const HARNESS_ID: string = handoff.harness_id;
export const HARNESS_NAME: string = handoff.name;
export const OUTPUT_DIR = 'report'; // the folder the harness instructions pin deliverables to

export { verifyPreview, previewFile, downloadFile };
export type { Served };

// Per-task budget ceilings (overridable by env). A thorough security report on this base/model can
// run ~15-20 min, so the time budget is generous; cost/step keep one action bounded. These are
// ceilings — a typical task costs ~$0.2-0.5.
const TIMEOUT_SECONDS = Number(process.env.HR_TASK_TIMEOUT_SECONDS || 3600);
const MAX_STEP = Number(process.env.HR_TASK_MAX_STEP || 200);
const MAX_COST_USD = Number(process.env.HR_TASK_MAX_COST_USD || 4);
const PREVIEW_TTL_SECONDS = 6 * 60 * 60;

let _hr: HarnessRouter | undefined;
/** Lazily built so `next build` never evaluates the key loader without a key present. */
export function getHR(): HarnessRouter {
  return (_hr ??= new HarnessRouter());
}

export const TERMINAL: ReadonlySet<TaskStatus> = new Set([
  'completed',
  'incomplete',
  'failed',
  'cancelled',
]);

// ── running tasks ───────────────────────────────────────────────────────────────────────────
export async function startTask(userId: string, input: string): Promise<TaskRecord> {
  const store = getStore();
  const now = Date.now();
  let rec: TaskRecord = {
    taskId: randomUUID(),
    userId,
    harnessId: HARNESS_ID,
    idempotencyKey: randomUUID(),
    status: 'starting',
    input,
    createdAt: now,
    updatedAt: now,
  };
  await store.put(rec);
  const r = await getHR().startBackground({
    harnessId: HARNESS_ID,
    input,
    user: userId, // the signed-in person's id, from the server session — never from the browser
    idempotencyKey: rec.idempotencyKey,
    timeoutSeconds: TIMEOUT_SECONDS,
    maxStep: MAX_STEP,
    maxCostUsd: MAX_COST_USD,
  });
  rec = {
    ...rec,
    responseId: r.id,
    sessionId: r.metadata?.session_id,
    status: (r.status as TaskStatus) || 'in_progress',
    updatedAt: Date.now(),
  };
  await store.put(rec);
  return rec;
}

export async function continueTask(
  userId: string,
  parent: TaskRecord,
  input: string,
): Promise<TaskRecord> {
  const store = getStore();
  const now = Date.now();
  let rec: TaskRecord = {
    taskId: randomUUID(),
    userId,
    harnessId: HARNESS_ID,
    idempotencyKey: randomUUID(),
    status: 'starting',
    input,
    parentTaskId: parent.taskId,
    createdAt: now,
    updatedAt: now,
  };
  await store.put(rec);
  const r = await getHR().startBackground({
    harnessId: HARNESS_ID, // must be the harness the session started on
    input,
    user: userId,
    idempotencyKey: rec.idempotencyKey,
    previousResponseId: parent.responseId,
    sessionId: parent.sessionId,
    timeoutSeconds: TIMEOUT_SECONDS,
    maxStep: MAX_STEP,
    maxCostUsd: MAX_COST_USD,
  });
  rec = {
    ...rec,
    responseId: r.id,
    sessionId: r.metadata?.session_id || parent.sessionId,
    status: (r.status as TaskStatus) || 'in_progress',
    updatedAt: Date.now(),
  };
  await store.put(rec);
  return rec;
}

/** Poll one step. On a terminal upstream status, settle (fetch files + manifest) and persist. */
export async function advance(rec: TaskRecord): Promise<TaskRecord> {
  if (TERMINAL.has(rec.status)) return rec;
  if (!rec.responseId) return rec; // still starting; nothing to poll yet
  let r: HRResponse;
  try {
    r = await getHR().getResponse(rec.responseId);
  } catch (e) {
    if (e instanceof HRError && e.retryable) return rec; // transient; let the client poll again
    throw e;
  }
  if (!TERMINAL_STATUSES.has(r.status)) {
    if (rec.status !== 'in_progress') {
      rec = { ...rec, status: 'in_progress', updatedAt: Date.now() };
      await getStore().put(rec);
    }
    return rec;
  }
  return settle(rec, r);
}

async function settle(rec: TaskRecord, r: HRResponse): Promise<TaskRecord> {
  const hr = getHR();
  const sessionId = rec.sessionId || r.metadata?.session_id || '';
  let files: SessionFile[] = [];
  if (sessionId && r.status !== 'cancelled' && r.status !== 'failed') {
    try {
      files = await hr.listFiles(sessionId);
    } catch {
      files = [];
    }
  }
  const manifest = await readManifest(hr, sessionId, files);
  const answer = answerText(r);
  const roleMismatch = answer.trimStart().toLowerCase().startsWith('role_mismatch');
  // Only expose the agent's own deliverables (report/*), and hide the internal manifest.
  const visible = files.filter(
    (f) => f.path.startsWith(OUTPUT_DIR + '/') && f.filename !== 'manifest.json',
  );
  const updated: TaskRecord = {
    ...rec,
    responseId: rec.responseId || r.id,
    sessionId,
    status: r.status as TaskStatus,
    answer,
    roleMismatch,
    files: visible.map(
      (f): StoredFile => ({
        path: f.path,
        filename: f.filename,
        bytes: f.bytes,
        mediaType: f.media_type,
      }),
    ),
    title: manifest.title,
    summary: manifest.summary,
    entry: manifest.entry,
    incompleteReason: r.incomplete_details?.reason,
    updatedAt: Date.now(),
  };
  await getStore().put(updated);
  return updated;
}

async function readManifest(
  hr: HarnessRouter,
  sessionId: string,
  files: SessionFile[],
): Promise<{ title?: string; summary?: string; entry?: string }> {
  const m = files.find((f) => f.path === `${OUTPUT_DIR}/manifest.json`);
  if (!m || !sessionId) return {};
  try {
    const { bytes } = await hr.fetchFile(sessionId, m.id);
    const j = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    return {
      title: typeof j.title === 'string' ? j.title : undefined,
      summary: typeof j.summary === 'string' ? j.summary : undefined,
      entry: typeof j.entry === 'string' ? j.entry : undefined,
    };
  } catch {
    return {};
  }
}

// ── sanitized shapes the browser may see (never upstream ids or download_urls) ─────────────────
export type Renderer = 'html' | 'markdown' | 'json' | 'code' | 'image' | 'pdf' | 'csv' | 'text' | 'file';

export interface ClientFile {
  path: string;
  filename: string;
  bytes: number;
  kind: Renderer;
  downloadPath: string;
}

export interface ClientDetail {
  taskId: string;
  status: TaskStatus;
  input: string;
  createdAt: number;
  answer?: string;
  roleMismatch?: boolean;
  title?: string;
  summary?: string;
  incompleteReason?: string;
  canContinue: boolean;
  parentTaskId?: string;
  files: ClientFile[];
  previewUrl?: string;
  previewFilename?: string;
}

export interface ClientSummary {
  taskId: string;
  status: TaskStatus;
  createdAt: number;
  inputPreview: string;
  title?: string;
  parentTaskId?: string;
}

function rendererKind(filename: string): Renderer {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'json') return 'json';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'csv') return 'csv';
  if (['js', 'mjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'sh', 'yaml', 'yml', 'toml', 'xml', 'sql', 'diff', 'patch', 'conf', 'ini', 'env'].includes(ext))
    return 'code';
  if (ext === 'txt' || ext === 'log') return 'text';
  return 'file';
}

function pickHtmlEntry(rec: TaskRecord): string | undefined {
  const rel = (p: string) => (p.startsWith(OUTPUT_DIR + '/') ? p.slice(OUTPUT_DIR.length + 1) : p);
  if (rec.entry && /\.html?$/i.test(rec.entry)) return rec.entry;
  const paths = (rec.files || []).map((f) => f.path);
  if (paths.includes(`${OUTPUT_DIR}/index.html`)) return 'index.html';
  const anyHtml = paths.find((p) => /\.html?$/i.test(p));
  return anyHtml ? rel(anyHtml) : undefined;
}

export function toClientDetail(rec: TaskRecord): ClientDetail {
  const files: ClientFile[] = (rec.files || []).map((f) => ({
    path: f.path,
    filename: f.filename,
    bytes: f.bytes,
    kind: rendererKind(f.filename),
    downloadPath: `/api/tasks/${rec.taskId}/download?path=${encodeURIComponent(f.path)}`,
  }));
  let previewUrl: string | undefined;
  let previewFilename: string | undefined;
  if (rec.status === 'completed' || rec.status === 'incomplete') {
    const rel = pickHtmlEntry(rec);
    if (rel) {
      const token = signPreview(rec.taskId, previewSecretBuf(), PREVIEW_TTL_SECONDS);
      previewUrl = `/preview/${token}/${rel}`;
      previewFilename = rel;
    }
  }
  return {
    taskId: rec.taskId,
    status: rec.status,
    input: rec.input,
    createdAt: rec.createdAt,
    answer: rec.answer,
    roleMismatch: rec.roleMismatch,
    title: rec.title,
    summary: rec.summary,
    incompleteReason: rec.incompleteReason,
    canContinue: rec.status === 'completed' || rec.status === 'incomplete',
    parentTaskId: rec.parentTaskId,
    files,
    previewUrl,
    previewFilename,
  };
}

export function toClientSummary(rec: TaskRecord): ClientSummary {
  return {
    taskId: rec.taskId,
    status: rec.status,
    createdAt: rec.createdAt,
    inputPreview: rec.input.replace(/\s+/g, ' ').slice(0, 120),
    title: rec.title,
    parentTaskId: rec.parentTaskId,
  };
}

// ── plain, safe error sentences (never raw upstream text/ids) ──────────────────────────────────
export function safeErrorMessage(e: unknown): string {
  if (e instanceof HRError) {
    switch (e.code) {
      case 'session_busy':
        return 'This analysis is still running. Please wait for it to finish before continuing.';
      case 'invalid_credential':
        return 'The security service is not configured correctly. Please contact the administrator.';
      case 'response_not_found':
      case 'session_not_found':
      case 'harness_not_found':
        return 'That analysis could not be found.';
      case 'conflict':
        return 'That request conflicts with one already in progress.';
      default:
        if (e.status >= 500) return 'The security service is temporarily unavailable. Please try again.';
        return 'The request could not be completed. Please adjust it and try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
