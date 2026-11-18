import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { continueTask, toClientDetail, safeErrorMessage } from '@/lib/service';
import { getStore } from '@/lib/task-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INPUT = 100_000;
const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

/** Continue a finished analysis in the same session (a follow-up turn). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const userId = await currentUserId();
  if (!userId) return notFound();

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
  if (!input) return NextResponse.json({ error: 'Please enter a follow-up.' }, { status: 400 });
  if (input.length > MAX_INPUT) {
    return NextResponse.json({ error: 'That request is too long (100k character limit).' }, { status: 413 });
  }

  const store = getStore();
  const parent = await store.get(taskId);
  if (!parent || parent.userId !== userId) return notFound();
  if (
    !(parent.status === 'completed' || parent.status === 'incomplete') ||
    !parent.responseId ||
    !parent.sessionId
  ) {
    return NextResponse.json(
      { error: 'You can only continue a finished analysis.' },
      { status: 409 },
    );
  }

  try {
    const rec = await continueTask(userId, parent, input);
    return NextResponse.json(toClientDetail(rec), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: safeErrorMessage(e) }, { status: 502 });
  }
}
