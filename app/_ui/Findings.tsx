'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, FileCode2, Search, ShieldAlert, Target, Wrench } from 'lucide-react';
import { SEVERITIES } from '@/shared/findings';
import type { Finding, Severity, SeverityCounts } from '@/shared/types';
import { CodeBlock, InlineMd, Markdown } from './Markdown';
import { SevPill, sevClass } from './primitives';

function looksLikeCode(s: string) {
  return /\n/.test(s) && /[;{}()=]|^\s*(def|import|from|const|let|function|class|return|if)\b/m.test(s);
}

function prettyUrl(u: string) {
  try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/$/, '').slice(0, 60); } catch { return u.slice(0, 60); }
}

function FindingCard({ f, open, onToggle, delay }: { f: Finding; open: boolean; onToggle: () => void; delay: number }) {
  const fix = f.fix.trim();
  return (
    <div className={`fcard c-${sevClass(f.severity)}${open ? ' open' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <button className="fhead" onClick={onToggle} aria-expanded={open}>
        <SevPill s={f.severity} />
        <div className="t">
          <div className="title"><InlineMd text={f.title} /></div>
          {f.location && <div className="loc"><FileCode2 size={12} style={{ flex: 'none' }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}><InlineMd text={f.location} /></span></div>}
        </div>
        <div className="right">
          {f.cwe && <span className="tag">{f.cwe}</span>}
          {f.category && <span className="tag" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.category}</span>}
          <span className="fid">{f.id}</span>
          <ChevronDown size={16} className="chev" />
        </div>
      </button>
      {open && (
        <div className="fbody">
          <div className={f.impact ? 'fgrid' : ''}>
            {f.description && (
              <div className="fsec"><h4><ShieldAlert size={12} /> What’s wrong</h4><Markdown text={f.description} /></div>
            )}
            {f.impact && (
              <div className="fsec"><h4><Target size={12} /> Impact</h4><Markdown text={f.impact} /></div>
            )}
          </div>
          {f.recommendation && (
            <div className="fsec"><h4><Wrench size={12} /> How to fix</h4><Markdown text={f.recommendation} /></div>
          )}
          {fix && (
            <div className="fsec">
              <h4>Suggested fix</h4>
              {/^\s*(```|~~~)/.test(fix) ? <Markdown text={fix} /> : looksLikeCode(fix) ? <CodeBlock code={fix} /> : <Markdown text={fix} />}
            </div>
          )}
          {f.references.length > 0 && (
            <div className="fsec">
              <h4>References</h4>
              <ul className="refs">
                {f.references.map((r) => (
                  <li key={r}><a href={r} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink size={11} /> {prettyUrl(r)}</a></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Findings({
  findings, counts, filter, setFilter,
}: { findings: Finding[]; counts?: SeverityCounts; filter: Severity | null; setFilter: (s: Severity | null) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(findings[0] ? [findings[0].id] : []));
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return findings.filter((f) => (!filter || f.severity === filter) &&
      (!needle || `${f.id} ${f.title} ${f.location} ${f.cwe} ${f.category} ${f.description}`.toLowerCase().includes(needle)));
  }, [findings, filter, q]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!findings.length) {
    return <div className="empty">No findings. The agent didn’t report any vulnerabilities for this input.</div>;
  }
  return (
    <div>
      <div className="ftools">
        <div className="filters">
          <button className={`filter${!filter ? ' on' : ''}`} onClick={() => setFilter(null)} style={!filter ? { color: 'var(--text)' } : undefined}>
            All <span className="ct">{findings.length}</span>
          </button>
          {SEVERITIES.filter((s) => (counts?.[s] ?? 0) > 0).map((s) => (
            <button key={s} className={`filter c-${sevClass(s)}${filter === s ? ' on' : ''}`} onClick={() => setFilter(filter === s ? null : s)}>
              <span style={{ width: 6, height: 6, borderRadius: 9, background: 'currentColor' }} />
              <span style={{ color: filter === s ? 'var(--text)' : 'var(--text-2)' }}>{s}</span>
              <span className="ct">{counts?.[s]}</span>
            </button>
          ))}
        </div>
        <label className="fsearch">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings…" aria-label="Search findings" />
        </label>
      </div>
      <div className="flist">
        {shown.map((f, i) => <FindingCard key={f.id + i} f={f} open={open.has(f.id)} onToggle={() => toggle(f.id)} delay={Math.min(i, 10) * 45} />)}
        {shown.length === 0 && <div className="empty">No findings match.</div>}
      </div>
    </div>
  );
}
