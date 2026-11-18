import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { getHR, downloadFile } from '@/lib/service';
import { getStore } from '@/lib/task-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

/** Download one of a task's deliverables. Ownership-checked; bytes fetched server-side with the key. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const userId = await currentUserId();
  if (!userId) return notFound();
  const rec = await getStore().get(taskId);
  if (!rec || rec.userId !== userId || !rec.sessionId) return notFound();

  const path = req.nextUrl.searchParams.get('path') || '';
  // Only files this task actually produced — never an arbitrary container path.
  if (!(rec.files || []).some((f) => f.path === path)) return notFound();

  try {
    const served = await downloadFile(getHR(), rec.sessionId, path);
    return new NextResponse(served.body as BodyInit, { status: served.status, headers: served.headers });
  } catch {
    return notFound();
  }
}
