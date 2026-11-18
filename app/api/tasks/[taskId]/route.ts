import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { advance, toClientDetail, safeErrorMessage } from '@/lib/service';
import { getStore } from '@/lib/task-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

/** Poll / detail. Advances a running task one step (this is also how we recover a task). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const userId = await currentUserId();
  if (!userId) return notFound();
  const store = getStore();
  let rec = await store.get(taskId);
  if (!rec || rec.userId !== userId) return notFound(); // ownership: a session id is never auth
  try {
    rec = await advance(rec);
  } catch (e) {
    return NextResponse.json({ error: safeErrorMessage(e) }, { status: 502 });
  }
  return NextResponse.json(toClientDetail(rec));
}
