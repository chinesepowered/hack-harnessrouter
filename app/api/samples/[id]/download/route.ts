import { NextRequest, NextResponse } from 'next/server';
import { sampleDownload } from '@/lib/samples';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = sampleDownload(id, req.nextUrl.searchParams.get('path') || '');
  return new NextResponse(s.body as BodyInit, { status: s.status, headers: s.headers });
}
