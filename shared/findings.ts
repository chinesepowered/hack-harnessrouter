// Normalize the agent's report/findings.json (untrusted, schema may drift) into a safe,
// bounded, sorted list. Pure + isomorphic: used by the server at settle time and in tests.
import type { Finding, Severity, SeverityCounts } from './types';

export const SEVERITIES: readonly Severity[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];
const RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
const MAX_FINDINGS = 100;

export function toSeverity(v: unknown): Severity {
  const s = String(v ?? '').trim().toLowerCase();
  if (s.startsWith('crit')) return 'Critical';
  if (s.startsWith('high') || s === 'severe') return 'High';
  if (s.startsWith('med') || s === 'moderate') return 'Medium';
  if (s.startsWith('low')) return 'Low';
  return 'Info';
}

function text(v: unknown, max: number): string {
  if (v == null) return '';
  let s: string;
  if (typeof v === 'string') s = v;
  else if (Array.isArray(v)) s = v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  s = s.replace(/\u0000/g, '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return undefined;
}

function cweOf(o: Record<string, unknown>, refs: string[]): string {
  const m = /CWE[-\s]?(\d{1,5})/i.exec(text(pick(o, 'cwe', 'cwe_id', 'cweId'), 60));
  if (m) return 'CWE-' + m[1];
  for (const r of refs) {
    const mm = /cwe\.mitre\.org\/data\/definitions\/(\d{1,5})/i.exec(r);
    if (mm) return 'CWE-' + mm[1];
  }
  return '';
}

export function normalizeFindings(raw: unknown): Finding[] {
  let arr: unknown = raw;
  if (arr && typeof arr === 'object' && !Array.isArray(arr)) {
    const o = arr as Record<string, unknown>;
    arr = o.findings ?? o.issues ?? o.vulnerabilities ?? [];
  }
  if (!Array.isArray(arr)) return [];
  const out: Finding[] = [];
  arr.slice(0, MAX_FINDINGS).forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const title = text(pick(o, 'title', 'name', 'summary'), 200);
    if (!title) return;
    const refsRaw = pick(o, 'references', 'refs', 'links');
    const refs = (Array.isArray(refsRaw) ? refsRaw : refsRaw ? [refsRaw] : [])
      .map((r) => String(r).trim())
      .filter((r) => /^https?:\/\/[^\s"'<>]+$/i.test(r))
      .slice(0, 6);
    out.push({
      id: text(pick(o, 'id', 'finding_id'), 24) || `F-${String(i + 1).padStart(2, '0')}`,
      title,
      severity: toSeverity(pick(o, 'severity', 'risk', 'level')),
      category: text(pick(o, 'category', 'type', 'class'), 80),
      cwe: cweOf(o, refs),
      location: text(pick(o, 'location', 'file', 'where'), 300),
      description: text(pick(o, 'description', 'details', 'detail'), 2500),
      impact: text(pick(o, 'impact'), 1500),
      recommendation: text(pick(o, 'recommendation', 'remediation', 'mitigation'), 2500),
      fix: text(pick(o, 'fix', 'fix_code', 'patch'), 4000),
      references: refs,
    });
  });
  return out.sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}

export function severityCounts(f: Finding[]): SeverityCounts {
  const c: SeverityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
  for (const x of f) c[x.severity]++;
  return c;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * 0-100 security score from a severity-weighted penalty with diminishing returns (so a very bad
 * codebase still gets an informative number, not a flat 0). Any Critical caps the grade at D.
 */
export function securityScore(c?: SeverityCounts | null): number {
  if (!c) return 100;
  const penalty = 40 * c.Critical + 12 * c.High + 4 * c.Medium + 1 * c.Low;
  let s = Math.round(100 * Math.exp(-penalty / 80));
  if (c.Critical > 0) s = Math.min(s, 59);
  return s;
}

export function gradeOf(score: number): Grade {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
}

/** The worst severity present, or null when there are no findings. */
export function riskLevel(c?: SeverityCounts | null): Severity | null {
  if (!c) return null;
  for (const s of SEVERITIES) if (c[s] > 0) return s;
  return null;
}
