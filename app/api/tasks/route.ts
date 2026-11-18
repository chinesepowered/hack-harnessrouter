import { NextRequest, NextResponse } from 'next/server';
import { ensureUserId, currentUserId } from '@/lib/session';
import { startTask, toClientDetail, toClientSummary, safeErrorMessage } from '@/lib/service';
import { getStore } from '@/lib/task-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INPUT = 100_000;

/** Start a new analysis task. Returns the product task (status "in_progress"). */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const input =
    body && typeof (body as { input?: unknown }).input === 'string'
      ? (body as { input: string }).input.trim()
      : '';
  if (!input) {
    return NextResponse.json({ error: 'Please describe what you want analyzed.' }, { status: 400 });
  }
  if (input.length > MAX_INPUT) {
    return NextResponse.json({ error: 'That request is too long (100k character limit).' }, { status: 413 });
  }
  const userId = await ensureUserId();
  try {
    const rec = await startTask(userId, input);
    return NextResponse.json(toClientDetail(rec), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: safeErrorMessage(e) }, { status: 502 });
  }
}

/** List the current user's tasks (most recent first). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ tasks: [] });
  const recs = await getStore().listByUser(userId);
  return NextResponse.json({ tasks: recs.map(toClientSummary) });
}
