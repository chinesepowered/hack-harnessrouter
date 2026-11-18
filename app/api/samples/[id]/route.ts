import { NextRequest, NextResponse } from 'next/server';
import { sampleDetail } from '@/lib/samples';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = sampleDetail(id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
}
