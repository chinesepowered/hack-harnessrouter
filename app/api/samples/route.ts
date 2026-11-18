import { NextResponse } from 'next/server';
import { sampleSummaries } from '@/lib/samples';

export const runtime = 'nodejs';

/** Public sample analyses (bundled, read-only). */
export async function GET() {
  return NextResponse.json({ samples: sampleSummaries() });
}
