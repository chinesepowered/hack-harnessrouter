'use client';

import { ArrowRight, Box, Brain, FileCode2, Lock, ScanSearch, ShieldCheck, Workflow } from 'lucide-react';
import type { RepoRef } from '@/shared/github';
import type { ClientSummary } from '@/shared/types';
import { SEVERITIES } from '@/shared/findings';
import { CommandBar } from './CommandBar';
import { EXAMPLES, type Attachment, type Example } from './draft';
import { GithubMark } from './icons';
import { GradePill, SeverityBar } from './primitives';

const EX_ICON = { repo: <GithubMark size={15} />, api: <FileCode2 size={15} />, box: <Box size={15} />, model: <Workflow size={15} /> };

export function Home(props: {
  value: string;
  onChange: (v: string) => void;
  attachments: Attachment[];
  onAttach: (f: FileList | File[]) => void;
  onRemove: (i: number) => void;
  repo: RepoRef | null;
  onDismissRepo: () => void;
  onSubmit: () => void;
  busy: boolean;
  samples: ClientSummary[];
  onExample: (ex: Example) => void;
  onOpenSample: (id: string) => void;
}) {
  const { samples, onExample, onOpenSample, ...bar } = props;
  return (
    <div className="home">
      <div className="hero">
        <span className="eyebrow rise"><span className="dot" /> Agentic security review · HarnessRouter × Qwen 3.8 Max</span>
        <h1 className="display rise" style={{ animationDelay: '60ms' }}>
          Find the vulnerabilities<br /><span className="grad">before attackers do.</span>
        </h1>
        <p className="lede rise" style={{ animationDelay: '120ms' }}>
          Paste code, drop files, or point Sentinel at a GitHub repo. An AI agent reviews it in an isolated
          sandbox and hands back a severity‑graded report with exact fixes — without the false refusals.
        </p>
      </div>

      <div className="rise" style={{ animationDelay: '180ms' }}>
        <CommandBar {...bar} autoFocus />
      </div>

      <div className="examples rise" style={{ animationDelay: '240ms' }}>
        {EXAMPLES.map((ex) => (
          <button key={ex.key} className="ex" onClick={() => onExample(ex)}>
            <span className="ico">{EX_ICON[ex.icon]}</span>
            <b>{ex.title}</b>
            <span>{ex.blurb}</span>
          </button>
        ))}
      </div>

      {samples.length > 0 && (
        <>
          <div className="section-h">
            <div>
              <h2>See a finished report</h2>
              <p>Real Sentinel analyses — open one instantly, no waiting.</p>
            </div>
          </div>
          <div className="samples">
            {samples.map((s, i) => {
              const total = s.counts ? SEVERITIES.reduce((n, k) => n + s.counts![k], 0) : 0;
              return (
                <button key={s.taskId} className="sample rise" style={{ animationDelay: `${300 + i * 60}ms` }} onClick={() => onOpenSample(s.taskId)}>
                  <div className="sample-top">
                    <div style={{ minWidth: 0 }}>
                      <div className="src">{s.source ? <GithubMark size={12} /> : <FileCode2 size={12} />}{s.source ? s.source.repo : 'pasted code'}</div>
                      <h3 style={{ marginTop: 8 }}>{s.title}</h3>
                    </div>
                    <GradePill counts={s.counts} />
                  </div>
                  <SeverityBar counts={s.counts} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 12 }}>{total} findings{s.counts?.Critical ? ` · ${s.counts.Critical} critical` : ''}</span>
                    <span className="open">Open report <ArrowRight size={13} /></span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="section-h"><div><h2>Why Sentinel</h2><p>A security reviewer that actually reviews.</p></div></div>
      <div className="features">
        <div className="feature"><div className="ico"><Brain size={18} /></div><b>Does the work</b><span>Routes to a model that reasons through real exploit paths on code you own — where others hedge or refuse.</span></div>
        <div className="feature"><div className="ico"><ScanSearch size={18} /></div><b>Severity‑graded findings</b><span>CWE‑mapped issues ranked Critical→Info, each with location, impact and a concrete fix.</span></div>
        <div className="feature"><div className="ico"><ShieldCheck size={18} /></div><b>Isolated & accountable</b><span>Runs in a HarnessRouter sandbox. Reports open in a locked‑down preview; your scans stay yours.</span></div>
      </div>
      <div className="trust"><Lock size={13} /> For authorized, defensive and educational security work. Sentinel refuses malware, unauthorized intrusion and mass targeting.</div>
    </div>
  );
}
