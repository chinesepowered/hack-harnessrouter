import { NextRequest, NextResponse } from 'next/server';
import { samplePreview } from '@/lib/samples';

export const runtime = 'nodejs';

/** Sandboxed preview of a bundled sample report (public; same strict CSP as task previews). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path } = await params;
  const s = samplePreview(id, path && path.length ? path.join('/') : '');
  return new NextResponse(s.body as BodyInit, { status: s.status, headers: s.headers });
}
