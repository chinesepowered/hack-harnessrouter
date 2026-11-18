import { NextRequest, NextResponse } from 'next/server';
import { getHR, verifyPreview, previewFile, OUTPUT_DIR } from '@/lib/service';
import { previewSecretBuf } from '@/lib/secrets';
import { getStore } from '@/lib/task-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () =>
  new NextResponse('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/**
 * Signed, sandboxed preview of a task's generated HTML report.
 *
 * There is intentionally NO cookie check here: the sandbox iframe has an opaque origin and sends
 * no cookies, so every asset request after the first would fail. Authorization instead comes from
 * the signature in the URL: minted only by the owner-checked task-detail route, scoped to one
 * taskId, and short-lived. The file is served with a strict sandbox CSP.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  const { token, path } = await params;
  const taskId = verifyPreview(token, previewSecretBuf());
  if (!taskId) return notFound();
  const rec = await getStore().get(taskId);
  if (!rec || !rec.sessionId) return notFound();
  const rel = path && path.length ? path.join('/') : 'index.html';
  try {
    const served = await previewFile(getHR(), rec.sessionId, OUTPUT_DIR, rel);
    return new NextResponse(served.body as BodyInit, { status: served.status, headers: served.headers });
  } catch {
    return notFound();
  }
}
