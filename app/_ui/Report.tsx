'use client';

import { useState } from 'react';
import {
  BookOpen, Calendar, ChevronDown, Clock, Download, ExternalLink, FileCode2, FileJson, FileText, FlaskConical,
  GitPullRequest, Lock, ScanSearch, Wrench,
} from 'lucide-react';
import { SEVERITIES } from '@/shared/findings';
import type { ClientDetail, Severity } from '@/shared/types';
import { Findings } from './Findings';
import { GithubMark, SentinelMark } from './icons';
import { Markdown } from './Markdown';
import { NEXT_STEPS } from './draft';
import { GradeRing, SeverityBar, SeverityTiles, fmtBytes, fmtDuration } from './primitives';

type Tab = 'findings' | 'report' | 'files';
const STEP_ICON = { fix: <Wrench size={16} />, tests: <FlaskConical size={16} />, pr: <GitPullRequest size={16} />, explain: <BookOpen size={16} /> };

/** One-line summary of the scanned input for the collapsed row. */
function scannedLabel(d: ClientDetail): string {
  if (d.source) return `github.com/${d.source.repo}${d.source.subpath ? `/${d.source.subpath}` : ''}${d.source.ref ? ` @ ${d.source.ref}` : ''}`;
  const files = [...d.input.matchAll(/^File: (.+)$/gm)].map((m) => m[1]);
  const lines = d.input.split('\n').length;
  if (files.length) return `${files.join(', ')} · ${lines} lines`;
  return d.input.replace(/\s+/g, ' ').slice(0, 110);
}

/** Sandboxed report iframe that stays hidden (no white flash) until its document has loaded. */
function ReportFrame({ src }: { src: string }) {
  const [ready, setReady] = useState(false);
  return (
    <div className="frame-wrap">
      {!ready && <div className="frame-loading" aria-hidden><span className="ring" /> Loading the report…</div>}
      <iframe className={`frame${ready ? ' ready' : ''}`} src={src} onLoad={() => setReady(true)} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" title="Security report" />
    </div>
  );
}

function fileIcon(kind: string) {
  return kind === 'json' ? <FileJson size={15} /> : kind === 'html' || kind === 'markdown' || kind === 'text' ? <FileText size={15} /> : <FileCode2 size={15} />;
}

export function Report({
  detail, onFollowUp, followUpRunning, onNewScan,
}: {
  detail: ClientDetail;
  onFollowUp: (prompt: string) => void;
  followUpRunning: boolean;
  onNewScan: () => void;
}) {
  const findings = detail.findings || [];
  const hasFindings = detail.findings !== undefined;
  const [tab, setTab] = useState<Tab>(hasFindings ? 'findings' : detail.previewUrl ? 'report' : 'files');
  const [filter, setFilter] = useState<Severity | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const total = detail.counts ? SEVERITIES.reduce((n, s) => n + detail.counts![s], 0) : findings.length;
  const date = new Date(detail.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const answer = (detail.answer || '').trim();

  return (
    <div>
      {detail.sample && (
        <div className="sample-banner rise">
          <ScanSearch size={16} style={{ color: 'var(--blue)', flex: 'none' }} />
          <span style={{ flex: 1 }}><b>Sample report.</b> A real Sentinel analysis, bundled so you can explore a finished report instantly.</span>
          <button className="btn btn-ghost btn-sm" onClick={onNewScan}>Run your own scan</button>
        </div>
      )}

      <div className="card rhead">
        <div className="rhead-top">
          <div style={{ minWidth: 0 }}>
            <span className="rsrc">
              {detail.source ? <><GithubMark size={12} /> github.com/{detail.source.repo}{detail.source.ref ? ` @ ${detail.source.ref}` : ''}</> : <><FileCode2 size={12} /> pasted code</>}
            </span>
            <h1>{detail.title || 'Security review'}</h1>
            <div className="rmeta">
              <span><ScanSearch size={13} /> {total} finding{total === 1 ? '' : 's'}</span>
              {detail.updatedAt > detail.createdAt && <span><Clock size={13} /> Completed in {fmtDuration(detail.updatedAt - detail.createdAt)}</span>}
              <span><Calendar size={13} /> {date}</span>
              {detail.status === 'incomplete' && <span style={{ color: 'var(--med)' }}>Stopped early ({detail.incompleteReason || 'budget'}) — partial results</span>}
            </div>
          </div>
          {hasFindings && <GradeRing counts={detail.counts} />}
        </div>
        {hasFindings && (
          <>
            <SeverityTiles counts={detail.counts} active={filter} onPick={(s) => { setFilter(s); setTab('findings'); }} />
            <SeverityBar counts={detail.counts} />
          </>
        )}
        {detail.summary && <p className="rsummary">{detail.summary}</p>}
      </div>

      {answer && (
        <div className={`card agent-take${!showAll && answer.length > 700 ? ' clamp' : ''}`}>
          <div className="agent-take-h"><span className="av"><SentinelMark size={13} /></span> Sentinel’s take</div>
          <Markdown text={answer} />
          {answer.length > 700 && (
            <button className="more-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : 'Read the full summary'} <ChevronDown size={13} style={{ transform: showAll ? 'rotate(180deg)' : 'none' }} />
            </button>
          )}
        </div>
      )}

      <div className={`card request${showInput ? ' open' : ''}`}>
        <button className="request-h" onClick={() => setShowInput((v) => !v)} aria-expanded={showInput}>
          <span>What was scanned</span>
          {!showInput && <span className="request-line">{scannedLabel(detail)}</span>}
          <ChevronDown size={14} style={{ transform: showInput ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flex: 'none' }} />
        </button>
        {showInput && <pre className="mono">{detail.input}</pre>}
      </div>

      <div className="tabs" role="tablist">
        {hasFindings && (
          <button className={`tab${tab === 'findings' ? ' on' : ''}`} onClick={() => setTab('findings')} role="tab" aria-selected={tab === 'findings'}>
            Findings <span className="count">{findings.length}</span>
          </button>
        )}
        {detail.previewUrl && (
          <button className={`tab${tab === 'report' ? ' on' : ''}`} onClick={() => setTab('report')} role="tab" aria-selected={tab === 'report'}>Full report</button>
        )}
        {detail.files.length > 0 && (
          <button className={`tab${tab === 'files' ? ' on' : ''}`} onClick={() => setTab('files')} role="tab" aria-selected={tab === 'files'}>
            Files <span className="count">{detail.files.length}</span>
          </button>
        )}
      </div>

      {tab === 'findings' && hasFindings && <Findings findings={findings} counts={detail.counts} filter={filter} setFilter={setFilter} />}

      {tab === 'report' && detail.previewUrl && (
        <div className="card frame-card">
          <div className="frame-bar">
            <span className="lock"><Lock size={13} /> Sandboxed preview · scripts isolated from this app</span>
            <a className="btn btn-ghost btn-sm" href={detail.previewUrl} target="_blank" rel="noreferrer noopener"><ExternalLink size={13} /> Open in new tab</a>
          </div>
          <ReportFrame key={detail.previewUrl} src={detail.previewUrl} />
        </div>
      )}

      {tab === 'files' && (
        <div className="files">
          {detail.files.map((f) => (
            <div className="file" key={f.path}>
              <span className="fi">{fileIcon(f.kind)}</span>
              <span className="fn" title={f.path}>{f.path.replace(/^report\//, '')}</span>
              <span className="fz">{fmtBytes(f.bytes)}</span>
              <a className="btn btn-ghost btn-sm" href={f.downloadPath}><Download size={13} /> Download</a>
            </div>
          ))}
        </div>
      )}

      {!detail.sample && detail.canContinue && (
        <div className="next">
          <div className="next-h">Next steps · continue this analysis</div>
          <div className="next-grid">
            {NEXT_STEPS.map((s) => (
              <button key={s.key} className="act" onClick={() => onFollowUp(s.prompt)} disabled={followUpRunning}>
                <span className="ico">{STEP_ICON[s.key]}</span>
                <b>{s.title}</b>
                <span>{s.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A follow-up turn's result: the agent's markdown answer + any new files it produced. */
export function FollowUpReply({ detail }: { detail: ClientDetail }) {
  return (
    <div className="card reply rise">
      <div className="reply-h">
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span className="av" style={{ width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', color: 'var(--accent-ink)', background: 'linear-gradient(150deg,#6dffcf,var(--accent))' }}><SentinelMark size={13} /></span> Sentinel</span>
        {detail.updatedAt > detail.createdAt && <span>{fmtDuration(detail.updatedAt - detail.createdAt)}</span>}
      </div>
      <Markdown text={(detail.answer || '').trim() || '_No answer text._'} />
      {(detail.files.length > 0 || detail.previewUrl) && (
        <div className="reply-files">
          {detail.previewUrl && <a className="chip" href={detail.previewUrl} target="_blank" rel="noreferrer noopener"><ExternalLink size={13} /> Open preview</a>}
          {detail.files.map((f) => (
            <a key={f.path} className="chip" href={f.downloadPath}><Download size={13} /> {f.path.replace(/^report\//, '')} <span className="muted">{fmtBytes(f.bytes)}</span></a>
          ))}
        </div>
      )}
    </div>
  );
}
