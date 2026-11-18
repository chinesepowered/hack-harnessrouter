import { NextRequest, NextResponse } from 'next/server';
import { ensureUserId, currentUserId } from '@/lib/session';
import { advance, startTask, toClientDetail, toClientSummary, safeErrorMessage, TERMINAL } from '@/lib/service';
import { getStore } from '@/lib/task-store';
import { parseRepoUrl } from '@/shared/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // a repo scan downloads + uploads an archive before starting

const MAX_INPUT = 100_000;

/** Start a new scan: pasted code/text, attached files (inlined by the client), or a GitHub repo. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  const repoUrl = typeof body.repo === 'string' ? body.repo.trim() : '';
  const repo = repoUrl ? parseRepoUrl(repoUrl) : null; // re-validated here; never trust the client
  if (repoUrl && !repo) {
    return NextResponse.json({ error: "That doesn't look like a GitHub repository URL." }, { status: 400 });
  }
  if (!input && !repo) {
    return NextResponse.json({ error: 'Paste some code, attach files, or paste a GitHub repo URL.' }, { status: 400 });
  }
  if (input.length > MAX_INPUT) {
    return NextResponse.json({ error: 'That request is too long (100k character limit).' }, { status: 413 });
  }
  const text =
    input ||
    `Audit this repository for security vulnerabilities — rank findings by severity and give concrete fixes: https://github.com/${repo!.owner}/${repo!.repo}`;
  const userId = await ensureUserId();
  try {
    const rec = await startTask(userId, text, repo);
    return NextResponse.json(toClientDetail(rec), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: safeErrorMessage(e) }, { status: 502 });
  }
}

/** List the current user's scans (most recent first). In-flight scans are refreshed (bounded) so a
 *  returning user sees accurate status without opening each one. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ tasks: [] });
  let recs = await getStore().listByUser(userId);
  const inflight = recs.filter((r) => !TERMINAL.has(r.status) && r.responseId).slice(0, 6);
  if (inflight.length) {
    const fresh = await Promise.all(inflight.map((r) => advance(r).catch(() => r)));
    const byId = new Map(fresh.map((r) => [r.taskId, r]));
    recs = recs.map((r) => byId.get(r.taskId) ?? r);
  }
  return NextResponse.json({ tasks: recs.map(toClientSummary) });
}
