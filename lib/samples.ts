import 'server-only';
import { SAMPLES } from './samples-data';
import type { SampleRecord } from './sample-types';
import { PREVIEW_HEADERS, PREVIEW_TYPES, safeRelPath, type Served } from './harnessrouter';
import { normalizeFindings, severityCounts } from '@/shared/findings';
import { rendererKind } from '@/shared/renderer';
import type { ClientDetail, ClientSummary, Finding } from '@/shared/types';

// Public, read-only sample reports. Served from bundled data: no HarnessRouter call, no key.

const cache = new Map<string, Finding[]>();
function findingsOf(s: SampleRecord): Finding[] {
  let f = cache.get(s.id);
  if (!f) cache.set(s.id, (f = normalizeFindings(s.findingsRaw)));
  return f;
}
const byId = (id: string) => SAMPLES.find((s) => s.id === id);

export function sampleSummaries(): ClientSummary[] {
  return SAMPLES.map((s) => ({
    taskId: s.id,
    status: 'completed',
    createdAt: s.createdAt,
    inputPreview: s.input.replace(/\s+/g, ' ').slice(0, 120),
    title: s.title,
    counts: severityCounts(findingsOf(s)),
    source: s.source,
    sample: true,
  }));
}

export function sampleDetail(id: string): ClientDetail | undefined {
  const s = byId(id);
  if (!s) return undefined;
  const findings = findingsOf(s);
  return {
    taskId: s.id,
    status: 'completed',
    input: s.input,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    answer: s.answer,
    title: s.title,
    summary: s.summary,
    canContinue: false,
    files: s.files
      .filter((f) => f.filename !== 'manifest.json')
      .map((f) => ({
        path: f.path,
        filename: f.filename,
        bytes: f.bytes,
        kind: rendererKind(f.filename),
        downloadPath: `/api/samples/${s.id}/download?path=${encodeURIComponent(f.path)}`,
      })),
    previewUrl: `/sample-preview/${s.id}/${s.entry}`,
    previewFilename: s.entry,
    findings,
    counts: severityCounts(findings),
    source: s.source,
    sample: true,
  };
}

const notFound: Served = { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: 'Not found' };

export function sampleDownload(id: string, path: string): Served {
  const f = byId(id)?.files.find((x) => x.path === path);
  if (!f) return notFound;
  return {
    status: 200,
    body: Buffer.from(f.b64, 'base64'),
    headers: {
      'Content-Type': f.mediaType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${f.filename.replace(/["\r\n\\]/g, '_')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300',
    },
  };
}

/** Sandboxed preview of a sample's HTML report (same CSP as live task previews). */
export function samplePreview(id: string, relPath: string): Served {
  const s = byId(id);
  if (!s) return notFound;
  const rel = safeRelPath(relPath || s.entry);
  if (!rel) return notFound;
  const type = PREVIEW_TYPES[(rel.split('.').pop() || '').toLowerCase()];
  if (!type) return notFound;
  const f = s.files.find((x) => x.path === `report/${rel}`);
  if (!f) return notFound;
  return { status: 200, headers: { ...PREVIEW_HEADERS, 'Content-Type': type }, body: Buffer.from(f.b64, 'base64') };
}
