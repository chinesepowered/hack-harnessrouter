'use client';

import { SEVERITIES, gradeOf, securityScore, type Grade } from '@/shared/findings';
import type { Severity, SeverityCounts } from '@/shared/types';

export const sevClass = (s: Severity) => s.toLowerCase();

export function SevPill({ s }: { s: Severity }) {
  return <span className={`sev sev-${sevClass(s)}`}>{s}</span>;
}

export function SeverityBar({ counts, mini = false }: { counts?: SeverityCounts | null; mini?: boolean }) {
  const total = counts ? SEVERITIES.reduce((n, s) => n + counts[s], 0) : 0;
  return (
    <div className={`sevbar${mini ? ' mini' : ''}`} aria-label="Severity distribution">
      {total > 0 &&
        SEVERITIES.filter((s) => counts![s] > 0).map((s, i) => (
          <span key={s} className={`bg-${sevClass(s)}`} style={{ flex: counts![s], animationDelay: `${i * 70}ms` }} />
        ))}
    </div>
  );
}

const GRADE_COLOR: Record<Grade, string> = { A: '#3df2b1', B: '#9be15d', C: '#f5c542', D: '#ff8a3d', F: '#ff4d6a' };
export const gradeColor = (g: Grade) => GRADE_COLOR[g];

export function GradeRing({ counts, size = 104 }: { counts?: SeverityCounts | null; size?: number }) {
  const score = securityScore(counts);
  const g = gradeOf(score);
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const color = gradeColor(g);
  return (
    <div>
      <div className="grade" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill={`${color}0d`} stroke={`${color}2b`} strokeWidth="7" />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${(score / 100) * c} ${c}`}
            style={{ filter: `drop-shadow(0 0 8px ${color}66)`, transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div className="grade-inner">
          <div className="g" style={{ color }}>{g}</div>
          <div className="s">{score}/100</div>
        </div>
      </div>
      <div className="grade-cap">Security grade</div>
    </div>
  );
}

export function GradePill({ counts }: { counts?: SeverityCounts | null }) {
  const g = gradeOf(securityScore(counts));
  const color = gradeColor(g);
  return (
    <span className="grade-pill" style={{ color, background: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}55` }} title={`Security grade ${g}`}>
      {g}
    </span>
  );
}

export function SeverityTiles({
  counts, active, onPick,
}: { counts?: SeverityCounts | null; active?: Severity | null; onPick?: (s: Severity | null) => void }) {
  return (
    <div className="tiles">
      {SEVERITIES.map((s) => {
        const n = counts ? counts[s] : 0;
        return (
          <button
            key={s}
            className={`tile c-${sevClass(s)}${n === 0 ? ' zero' : ''}${active === s ? ' on' : ''}`}
            onClick={() => onPick?.(active === s ? null : s)}
            disabled={!onPick || n === 0}
          >
            <div className="num">{n}</div>
            <div className="lab">{s}</div>
          </button>
        );
      })}
    </div>
  );
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
