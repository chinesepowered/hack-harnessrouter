'use client';

import { FileCode2, FlaskConical, LoaderCircle, Plus, TriangleAlert } from 'lucide-react';
import type { ClientSummary } from '@/shared/types';
import { GithubMark, SentinelMark } from './icons';
import { SeverityBar, timeAgo } from './primitives';

function label(t: ClientSummary) {
  return t.title || (t.source ? t.source.repo : '') || t.inputPreview || 'Untitled scan';
}

function Item({ t, active, onClick }: { t: ClientSummary; active: boolean; onClick: () => void }) {
  const running = t.status === 'starting' || t.status === 'in_progress';
  const failed = t.status === 'failed' || t.status === 'cancelled';
  return (
    <button className={`side-item${active ? ' active' : ''}`} onClick={onClick} title={label(t)}>
      <span className="side-ico">
        {running ? <LoaderCircle size={14} className="spin" style={{ color: 'var(--accent)' }} />
          : failed ? <TriangleAlert size={14} style={{ color: 'var(--crit)' }} />
          : t.source ? <GithubMark size={13} />
          : t.sample ? <FlaskConical size={14} />
          : <FileCode2 size={14} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <div className="side-title">{label(t)}</div>
        <div className="side-meta">
          {running ? <span style={{ color: 'var(--accent)' }}>Scanning…</span>
            : t.counts ? <SeverityBar counts={t.counts} mini /> : null}
          {!t.sample && <span>{timeAgo(t.createdAt)}</span>}
          {t.sample && <span>Sample</span>}
        </div>
      </span>
    </button>
  );
}

export function Sidebar({
  tasks, samples, activeId, onNew, onOpenTask, onOpenSample,
}: {
  tasks: ClientSummary[];
  samples: ClientSummary[];
  activeId?: string;
  onNew: () => void;
  onOpenTask: (id: string) => void;
  onOpenSample: (id: string) => void;
}) {
  const roots = tasks.filter((t) => !t.parentTaskId);
  return (
    <aside className="side">
      <div className="brand">
        <span className="mark"><SentinelMark size={19} /></span>
        <div>
          <div className="brand-name">Sentinel</div>
          <div className="brand-sub">AI security analyst</div>
        </div>
      </div>
      <button className="newscan" onClick={onNew}><Plus size={15} /> New scan</button>
      <div className="side-scroll">
        <div className="side-label">Recent scans</div>
        {roots.length === 0 && <div className="side-empty">No scans yet — start one.</div>}
        {roots.map((t) => <Item key={t.taskId} t={t} active={t.taskId === activeId} onClick={() => onOpenTask(t.taskId)} />)}
        {samples.length > 0 && <div className="side-label">Sample reports</div>}
        {samples.map((t) => <Item key={t.taskId} t={t} active={t.taskId === activeId} onClick={() => onOpenSample(t.taskId)} />)}
      </div>
      <div className="side-foot">
        <div>Agent backend <b>HarnessRouter</b></div>
        <div>Model <b>qwen3.8-max</b> · Qwen Code CLI</div>
      </div>
    </aside>
  );
}
