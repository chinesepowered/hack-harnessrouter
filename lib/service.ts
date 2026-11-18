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
import { getStore, type TaskRecord, type StoredFile } from './task-store';
import { previewSecretBuf } from './secrets';
import { fetchRepoArchive, RepoFetchError, MAX_ARCHIVE_BYTES } from './github';
import { normalizeFindings, severityCounts } from '@/shared/findings';
import { buildProgress } from '@/shared/activity';
import { rendererKind } from '@/shared/renderer';
import { failedRunMessage } from '@/shared/errors';
import type { RepoRef } from '@/shared/github';
import type { ClientDetail, ClientFile, ClientSummary, Progress, TaskStatus } from '@/shared/types';
import handoff from '../harnessrouter.json';

/**
 * The server side of the feature. The browser talks only to our routes; this module is the only
 * thing that talks to HarnessRouter. It maps our single feature to its own harness_id, runs tasks
 * in background mode (serverless-friendly), polls to completion, and turns raw responses into
 * sanitized, owner-scoped product results.
 */

export const HARNESS_ID: string = handoff.harness_id;
export const HARNESS_NAME: string = handoff.name;
export const OUTPUT_DIR = 'report'; // the folder the harness instructions pin deliverables to

export { verifyPreview, previewFile, downloadFile };
export type { Served };

// Per-task budget ceilings (overridable by env). A thorough security report on this base/model can
// run ~15-20 min, so the time budget is generous; cost/step keep one action bounded. These are
// ceilings; a typical task costs ~$0.2-0.5.
const TIMEOUT_SECONDS = Number(process.env.HR_TASK_TIMEOUT_SECONDS || 3600);
const MAX_STEP = Number(process.env.HR_TASK_MAX_STEP || 200);
const MAX_COST_USD = Number(process.env.HR_TASK_MAX_COST_USD || 4);
const PREVIEW_TTL_SECONDS = 6 * 60 * 60;

let _hr: HarnessRouter | undefined;
/** Lazily built so `next build` never evaluates the key loader without a key present. */
export function getHR(): HarnessRouter {
  return (_hr ??= new HarnessRouter());
}

export const TERMINAL: ReadonlySet<TaskStatus> = new Set(['completed', 'incomplete', 'failed', 'cancelled']);

const budgets = () => ({ timeoutSeconds: TIMEOUT_SECONDS, maxStep: MAX_STEP, maxCostUsd: MAX_COST_USD });

// ── running tasks ───────────────────────────────────────────────────────────────────────────
/** Start a new scan. `repo` (already validated by parseRepoUrl) makes it a repository scan. */
export async function startTask(userId: string, input: string, repo?: RepoRef | null): Promise<TaskRecord> {
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
    ...(repo ? { source: { kind: 'github' as const, repo: `${repo.owner}/${repo.repo}`, ref: repo.ref, subpath: repo.subpath } } : {}),
  };
  await store.put(rec);

  let modelInput: unknown = input;
  try {
    if (repo) {
      // The server fetches the public repo and hands the archive to the agent's sandbox, which
      // extracts and reviews it offline (see the harness INPUTS rule).
      const archive = await fetchRepoArchive(repo);
      const up = await getHR().uploadFile(archive, 'repo.tar.gz', 'application/gzip');
      const where = `github.com/${repo.owner}/${repo.repo}${repo.ref ? ` @ ${repo.ref}` : ' (default branch)'}`;
      const text = `${input}\n\nRepository: ${where}, attached as repo.tar.gz.${repo.subpath ? ` Focus on ${repo.subpath}.` : ''}`;
      modelInput = [{ role: 'user', content: [{ type: 'input_text', text }, { type: 'input_file', file_id: up.id }] }];
    }
    const r = await getHR().startBackground({
      harnessId: HARNESS_ID,
      input: modelInput,
      user: userId, // the signed-in person's id, from the server session, never from the browser
      idempotencyKey: rec.idempotencyKey,
      ...budgets(),
    });
    rec = {
      ...rec,
      responseId: r.id,
      sessionId: r.metadata?.session_id,
      status: (r.status as TaskStatus) || 'in_progress',
      updatedAt: Date.now(),
    };
  } catch (e) {
    rec = { ...rec, status: 'failed', answer: safeErrorMessage(e), updatedAt: Date.now() };
    await store.put(rec);
    throw e;
  }
  await store.put(rec);
  return rec;
}

export async function continueTask(userId: string, parent: TaskRecord, input: string): Promise<TaskRecord> {
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
    source: parent.source,
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
    ...budgets(),
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

/** Poll one step. On a terminal upstream status, settle (fetch files + manifest + findings). */
export async function advance(rec: TaskRecord): Promise<TaskRecord> {
  if (TERMINAL.has(rec.status)) return rec;
  if (!rec.responseId) return rec; // still starting; nothing to poll yet
  let r: HRResponse;
  try {
    r = await getHR().getResponse(rec.responseId);
  } catch (e) {
    if (e instanceof HRError && e.retryable) return rec; // transient; the client polls again
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

async function readJson(hr: HarnessRouter, sessionId: string, files: SessionFile[], path: string): Promise<unknown> {
  const f = files.find((x) => x.path === path);
  if (!f || !sessionId) return undefined;
  try {
    const { bytes } = await hr.fetchFile(sessionId, f.id);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null; // present but unreadable
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 600) : undefined);

/** When the upstream turn actually finished (so "completed in" stays right if we settle late). */
async function upstreamFinishedAt(hr: HarnessRouter, sessionId: string, responseId: string | undefined): Promise<number | undefined> {
  if (!sessionId || !responseId) return undefined;
  try {
    const t = await hr.request<{ turns?: Array<{ id?: string; completed_at?: number }> }>(
      'GET', `/v1/sessions/${encodeURIComponent(sessionId)}/turns`);
    const c = t.turns?.find((x) => x.id === responseId)?.completed_at;
    return typeof c === 'number' && c > 0 ? c * 1000 : undefined;
  } catch {
    return undefined;
  }
}

async function settle(rec: TaskRecord, r: HRResponse): Promise<TaskRecord> {
  const hr = getHR();
  const sessionId = rec.sessionId || r.metadata?.session_id || '';
  const followUp = Boolean(rec.parentTaskId);
  let all: SessionFile[] = [];
  let changed: SessionFile[] = [];
  if (sessionId && r.status !== 'cancelled' && r.status !== 'failed') {
    try { all = await hr.listFiles(sessionId); } catch { all = []; }
    if (followUp) { try { changed = await hr.listFiles(sessionId, { changed: true }); } catch { changed = []; } }
  }
  const manifest = (await readJson(hr, sessionId, all, `${OUTPUT_DIR}/manifest.json`)) as Record<string, unknown> | null | undefined;
  // A follow-up keeps the original analysis intact, so its findings live on the parent turn.
  const rawFindings = followUp ? undefined : await readJson(hr, sessionId, all, `${OUTPUT_DIR}/findings.json`);
  const findings = rawFindings === undefined ? undefined : normalizeFindings(rawFindings);
  // A failed run's text is a half-finished thought, not an explanation; show a plain sentence instead.
  const answer = r.status === 'failed' ? failedRunMessage(r.error) : answerText(r);
  const finishedAt = (await upstreamFinishedAt(hr, sessionId, rec.responseId || r.id)) ?? Date.now();
  const pool = followUp ? changed : all;
  const visible = pool.filter((f) => f.path.startsWith(OUTPUT_DIR + '/') && f.filename !== 'manifest.json');
  const updated: TaskRecord = {
    ...rec,
    responseId: rec.responseId || r.id,
    sessionId,
    status: r.status as TaskStatus,
    answer,
    roleMismatch: answer.trimStart().toLowerCase().startsWith('role_mismatch'),
    files: visible.map((f): StoredFile => ({ path: f.path, filename: f.filename, bytes: f.bytes, mediaType: f.media_type })),
    title: str(manifest?.title),
    summary: str(manifest?.summary),
    entry: followUp ? undefined : str(manifest?.entry),
    findings,
    counts: findings ? severityCounts(findings) : undefined,
    findingsChecked: true,
    incompleteReason: r.incomplete_details?.reason,
    updatedAt: Math.max(rec.createdAt, finishedAt),
  };
  await getStore().put(updated);
  return updated;
}

/** One-time backfill for records settled before findings were parsed. */
export async function ensureFindings(rec: TaskRecord): Promise<TaskRecord> {
  if (rec.findingsChecked || rec.parentTaskId || !rec.sessionId) return rec;
  if (rec.status !== 'completed' && rec.status !== 'incomplete') return rec;
  const hr = getHR();
  let files: SessionFile[] = [];
  try { files = await hr.listFiles(rec.sessionId); } catch { return rec; }
  const raw = await readJson(hr, rec.sessionId, files, `${OUTPUT_DIR}/findings.json`);
  const findings = raw === undefined ? undefined : normalizeFindings(raw);
  const updated: TaskRecord = { ...rec, findings, counts: findings ? severityCounts(findings) : undefined, findingsChecked: true };
  await getStore().put(updated);
  return updated;
}

/** Live, sanitized progress from the current turn's tool calls (names only, never arguments). */
export async function liveProgress(rec: TaskRecord): Promise<Progress> {
  if (!rec.sessionId || !rec.responseId) return buildProgress('starting', []);
  const hr = getHR();
  try {
    const t = await hr.request<{ turns?: Array<{ id?: string; status?: string; tools?: Array<{ name?: string }> }> }>(
      'GET', `/v1/sessions/${encodeURIComponent(rec.sessionId)}/turns`);
    const turn = (t.turns || []).find((x) => x.id === rec.responseId);
    if (!turn) return buildProgress('starting', []);
    const names = (turn.tools || []).map((x) => String(x.name || '')).filter(Boolean);
    let status = turn.status;
    if (!names.length) {
      try {
        const s = await hr.request<{ turn_status?: string }>('GET', `/v1/sessions/${encodeURIComponent(rec.sessionId)}`);
        if (s.turn_status === 'starting') status = 'starting';
      } catch { /* keep running */ }
    }
    return buildProgress(status, names);
  } catch {
    return buildProgress('running', []);
  }
}

// ── sanitized shapes the browser may see (never upstream ids or download_urls) ─────────────────
function pickHtmlEntry(rec: TaskRecord): string | undefined {
  const rel = (p: string) => (p.startsWith(OUTPUT_DIR + '/') ? p.slice(OUTPUT_DIR.length + 1) : p);
  if (rec.entry && /\.html?$/i.test(rec.entry)) return rec.entry;
  const paths = (rec.files || []).map((f) => f.path);
  if (paths.includes(`${OUTPUT_DIR}/index.html`)) return 'index.html';
  const anyHtml = paths.find((p) => /\.html?$/i.test(p));
  return anyHtml ? rel(anyHtml) : undefined;
}

export function toClientDetail(rec: TaskRecord, progress?: Progress): ClientDetail {
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
      previewUrl = `/preview/${signPreview(rec.taskId, previewSecretBuf(), PREVIEW_TTL_SECONDS)}/${rel}`;
      previewFilename = rel;
    }
  }
  return {
    taskId: rec.taskId,
    status: rec.status,
    input: rec.input,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
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
    findings: rec.findings,
    counts: rec.counts,
    progress,
    source: rec.source,
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
    counts: rec.counts,
    source: rec.source,
  };
}

// ── plain, safe error sentences (never raw upstream text/ids) ──────────────────────────────────
export function safeErrorMessage(e: unknown): string {
  if (e instanceof RepoFetchError) {
    if (e.code === 'not_found') return "Couldn't find that repository. Sentinel can scan public GitHub repositories, so check the URL and that the repo is public.";
    if (e.code === 'too_large') return `That repository is too large to scan (archive limit ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)} MB). Try a specific folder or paste the files you care about.`;
    return "Couldn't download that repository right now. Please try again in a moment.";
  }
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
