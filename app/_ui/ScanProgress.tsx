'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, Check, Globe, Info, LoaderCircle, PenLine, Search, Sparkles, Terminal } from 'lucide-react';
import type { ActivityKind, ClientDetail } from '@/shared/types';
import { GithubMark } from './icons';
import { fmtClock } from './primitives';

const KIND_ICON: Record<ActivityKind, ReactNode> = {
  read: <Search size={12} />, run: <Terminal size={12} />, write: <PenLine size={12} />,
  search: <Globe size={12} />, plan: <Sparkles size={12} />, other: <BookOpen size={12} />,
};

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

/** Full-size live view for a running root scan. */
export function ScanProgress({ detail }: { detail: ClientDetail }) {
  const now = useNow();
  const p = detail.progress;
  const stage = p?.stage ?? 0;
  const target = detail.source ? detail.source.repo : 'your code';
  const steps = [
    'Spinning up an isolated sandbox',
    detail.source ? 'Unpacking & reading the repository' : 'Reading your code',
    'Tracing vulnerabilities',
    'Writing the report',
  ];
  return (
    <div className="card scan">
      <div className="scan-visual">
        <div className="radar" aria-hidden>
          <div className="ring" /><div className="ring" /><div className="ring" /><div className="ring" />
          <div className="cross" /><div className="sweep" />
          <span className="blip" style={{ top: '22%', left: '64%' }} />
          <span className="blip b2" style={{ top: '62%', left: '22%' }} />
          <span className="blip b3" style={{ top: '72%', left: '68%' }} />
          <div className="core" />
        </div>
      </div>
      <div className="scan-body">
        <div className="scan-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              {detail.source ? <><GithubMark size={12} /> github.com/{detail.source.repo}</> : 'Security Analyst · qwen3.8-max'}
            </div>
            <h2>Scanning {target}</h2>
          </div>
          <span className="timer" aria-label="Elapsed">{fmtClock(now - detail.createdAt)}</span>
        </div>
        <div className="shimmer" />
        <div className="stepper">
          {steps.map((s, i) => (
            <div key={s} className={`step${i < stage ? ' done' : i === stage ? ' active' : ''}`}>
              <span className="n">{i < stage ? <Check size={13} /> : i + 1}</span>
              {s}
              <span className="state">{i < stage ? 'done' : i === stage ? 'in progress' : ''}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="feed-h" style={{ marginBottom: 8 }}>
            <span>Live agent activity</span>
            <span>{p?.steps ? `${p.steps} tool call${p.steps === 1 ? '' : 's'}` : 'waiting for the first step'}</span>
          </div>
          <ul className="feed">
            {p?.activities?.length ? (
              p.activities.map((a, i) => (
                <li key={`${a.label}-${i}`}>
                  <span className={`k k-${a.kind}`}>{KIND_ICON[a.kind]}</span>
                  {a.label}
                  <span className="times">{a.count > 1 ? `×${a.count}` : ''}</span>
                </li>
              ))
            ) : (
              <li className="waiting"><LoaderCircle size={13} className="spin" /> Agent is starting up in its sandbox…</li>
            )}
          </ul>
        </div>
        <div className="scan-note"><Info size={14} style={{ flex: 'none', marginTop: 2 }} /> Thorough reviews take a few minutes. You can leave this page — the scan keeps running and lands in Recent scans.</div>
      </div>
    </div>
  );
}

/** Compact live row for a running follow-up. */
export function InlineProgress({ detail }: { detail: ClientDetail }) {
  const now = useNow();
  const p = detail.progress;
  const last = p?.activities?.[p.activities.length - 1];
  return (
    <div className="card inline-progress">
      <span className="ring" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Sentinel is working on it</b>
        <div className="sub">{last ? `${last.label}${last.count > 1 ? ` ×${last.count}` : ''} · ${p!.steps} tool calls` : 'Starting up…'}</div>
      </div>
      <span className="timer">{fmtClock(now - detail.createdAt)}</span>
    </div>
  );
}
