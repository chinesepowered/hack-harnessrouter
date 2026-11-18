'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

// ── shapes (mirror lib/service.ts; the browser only ever sees these) ───────────────────────────
type TaskStatus = 'starting' | 'in_progress' | 'completed' | 'incomplete' | 'failed' | 'cancelled';
type Renderer = 'html' | 'markdown' | 'json' | 'code' | 'image' | 'pdf' | 'csv' | 'text' | 'file';

interface ClientFile {
  path: string;
  filename: string;
  bytes: number;
  kind: Renderer;
  downloadPath: string;
}
interface Detail {
  taskId: string;
  status: TaskStatus;
  input: string;
  createdAt: number;
  answer?: string;
  roleMismatch?: boolean;
  title?: string;
  summary?: string;
  incompleteReason?: string;
  canContinue: boolean;
  parentTaskId?: string;
  files: ClientFile[];
  previewUrl?: string;
  previewFilename?: string;
}
interface Summary {
  taskId: string;
  status: TaskStatus;
  createdAt: number;
  inputPreview: string;
  title?: string;
  parentTaskId?: string;
}

const TERMINAL: ReadonlySet<TaskStatus> = new Set(['completed', 'incomplete', 'failed', 'cancelled']);

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: 'Review a vulnerable snippet',
    text: `Review this Express.js route for security vulnerabilities and tell me how to fix each one:

const express = require('express');
const { exec } = require('child_process');
const app = express();
app.use(express.json());

app.get('/ping', (req, res) => {
  exec('ping -c 1 ' + req.query.host, (e, out) => res.send(out));
});

app.get('/user', (req, res) => {
  db.query("SELECT * FROM users WHERE id = " + req.query.id, (e, rows) => res.json(rows));
});

app.listen(3000);`,
  },
  {
    label: 'Threat-model an API',
    text: 'Threat-model a web application with a public REST API, JWT-based authentication, file uploads, and a PostgreSQL database. Identify the main risks (mapped to OWASP) and recommended controls.',
  },
  {
    label: 'Audit a Dockerfile',
    text: `Assess this Dockerfile for security issues and give hardening recommendations:

FROM node:18
WORKDIR /app
COPY . .
RUN npm install
ENV API_KEY=sk_live_51H8xExampleKeyHardcoded
USER root
EXPOSE 3000
CMD ["node", "server.js"]`,
  },
];

// ── helpers ────────────────────────────────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fileIcon(kind: Renderer): string {
  switch (kind) {
    case 'html': return '🌐';
    case 'json': return '{ }';
    case 'markdown': return 'md';
    case 'code': return '</>';
    case 'image': return '🖼';
    case 'pdf': return 'pdf';
    case 'csv': return 'csv';
    default: return '📄';
  }
}
/** The agent emits `role_mismatch` on the first line; show the rest as a plain message. */
function stripRoleMismatch(answer: string): string {
  const lines = answer.split('\n');
  if (lines[0]?.trim().toLowerCase().startsWith('role_mismatch')) {
    return lines.slice(1).join('\n').trim() || 'This request is outside what the Security Analyst does.';
  }
  return answer;
}

// ── component ───────────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const [tasks, setTasks] = useState<Summary[]>([]);
  const [thread, setThread] = useState<Detail[]>([]);
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0); // re-render for elapsed timers

  const threadRef = useRef<Detail[]>([]);
  threadRef.current = thread;
  const runIdRef = useRef(0); // cancels pollers when the thread is replaced
  const polling = useRef<Set<string>>(new Set());

  const lastTurn = thread[thread.length - 1];
  const anyRunning = thread.some((t) => !TERMINAL.has(t.status));

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      if (res.ok) {
        const j = (await res.json()) as { tasks: Summary[] };
        setTasks(j.tasks || []);
      }
    } catch {
      /* ignore list errors */
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // tick every second while something is running (for the elapsed counter)
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const upsertTurn = useCallback((d: Detail) => {
    setThread((cur) => {
      const i = cur.findIndex((t) => t.taskId === d.taskId);
      if (i === -1) return [...cur, d];
      const next = cur.slice();
      next[i] = d;
      return next;
    });
  }, []);

  const poll = useCallback(
    (taskId: string, runId: number) => {
      if (polling.current.has(taskId)) return;
      polling.current.add(taskId);
      const startedAt = Date.now();
      const tick = async () => {
        if (runId !== runIdRef.current) {
          polling.current.delete(taskId);
          return;
        }
        try {
          const res = await fetch(`/api/tasks/${taskId}`, { cache: 'no-store' });
          if (res.ok) {
            const d = (await res.json()) as Detail;
            if (runId === runIdRef.current) upsertTurn(d);
            if (TERMINAL.has(d.status)) {
              polling.current.delete(taskId);
              loadTasks();
              return;
            }
          }
        } catch {
          /* transient; keep polling */
        }
        const elapsed = Date.now() - startedAt;
        const delay = elapsed > 60_000 ? 5000 : 2500;
        window.setTimeout(tick, delay);
      };
      window.setTimeout(tick, 1500);
    },
    [loadTasks, upsertTurn],
  );

  const startNew = useCallback(
    async (input: string) => {
      setError(null);
      setBusy(true);
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input }),
        });
        const d = (await res.json()) as Detail & { error?: string };
        if (!res.ok) {
          setError(d.error || 'Could not start the analysis.');
          return;
        }
        runIdRef.current += 1;
        polling.current.clear();
        setThread([d]);
        setComposer('');
        loadTasks();
        if (!TERMINAL.has(d.status)) poll(d.taskId, runIdRef.current);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [loadTasks, poll],
  );

  const followUp = useCallback(
    async (input: string) => {
      const parent = threadRef.current[threadRef.current.length - 1];
      if (!parent || !parent.canContinue) return;
      setError(null);
      setBusy(true);
      try {
        const res = await fetch(`/api/tasks/${parent.taskId}/continue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input }),
        });
        const d = (await res.json()) as Detail & { error?: string };
        if (!res.ok) {
          setError(d.error || 'Could not continue the analysis.');
          return;
        }
        setThread((cur) => [...cur, d]);
        setComposer('');
        loadTasks();
        if (!TERMINAL.has(d.status)) poll(d.taskId, runIdRef.current);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [loadTasks, poll],
  );

  const openTask = useCallback(
    async (taskId: string) => {
      setError(null);
      runIdRef.current += 1;
      polling.current.clear();
      const myRun = runIdRef.current;
      try {
        const res = await fetch(`/api/tasks/${taskId}`, { cache: 'no-store' });
        if (!res.ok) {
          setError('Could not open that analysis.');
          return;
        }
        const d = (await res.json()) as Detail;
        if (myRun !== runIdRef.current) return;
        setThread([d]);
        if (!TERMINAL.has(d.status)) poll(d.taskId, myRun);
      } catch {
        setError('Network error. Please try again.');
      }
    },
    [poll],
  );

  const resetToNew = useCallback(() => {
    runIdRef.current += 1;
    polling.current.clear();
    setThread([]);
    setComposer('');
    setError(null);
  }, []);

  const onSubmit = useCallback(() => {
    const input = composer.trim();
    if (!input || busy || anyRunning) return;
    if (thread.length > 0 && lastTurn?.canContinue) followUp(input);
    else if (thread.length === 0) startNew(input);
  }, [composer, busy, anyRunning, thread.length, lastTurn, followUp, startNew]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  };

  const activeRootId = thread[0]?.taskId;
  const composerMode: 'new' | 'followup' | 'locked' = useMemo(() => {
    if (thread.length === 0) return 'new';
    if (anyRunning) return 'locked';
    return lastTurn?.canContinue ? 'followup' : 'new';
  }, [thread.length, anyRunning, lastTurn]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">S</div>
          <div>
            <h1>Sentinel</h1>
            <p className="sub">AI Security Analyst</p>
          </div>
        </div>
        <button className="newbtn" onClick={resetToNew} disabled={busy}>
          + New analysis
        </button>
        <div className="history">
          <div className="label">Your analyses</div>
          {tasks.length === 0 && <div className="empty">No analyses yet.</div>}
          {tasks.map((t) => (
            <button
              key={t.taskId}
              className={`histitem${t.parentTaskId ? ' child' : ''}${t.taskId === activeRootId || thread.some((x) => x.taskId === t.taskId) ? ' active' : ''}`}
              onClick={() => openTask(t.taskId)}
              title={t.inputPreview}
            >
              <StatusDot status={t.status} />
              <span className="txt">
                {t.parentTaskId ? '↳ ' : ''}
                {t.title || t.inputPreview || 'Untitled'}
              </span>
              <span className="when">{timeAgo(t.createdAt)}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <div className="scroll">
          {thread.length === 0 ? (
            <section className="hero">
              <h2>Analyze something for security issues</h2>
              <p>
                Paste source code, a config file, a Dockerfile, dependencies, or logs, or describe a
                system to threat-model. Sentinel reviews it, explains each finding with severity and
                remediation, and produces a shareable report. For authorized, defensive, and
                educational use only.
              </p>
              <div className="examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} className="chip" onClick={() => setComposer(ex.text)}>
                    {ex.label}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="hero">
              <h2>{thread[0].title || 'Security analysis'}</h2>
              <p>Agent: Security Analyst · qwen / qwen3.8-max · via HarnessRouter</p>
            </section>
          )}

          {error && <div className="error-banner">{error}</div>}

          {thread.map((turn) => (
            <Turn key={turn.taskId} turn={turn} />
          ))}
        </div>

        <div className="composer">
          <div className="inner">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                composerMode === 'followup'
                  ? 'Ask a follow-up about this analysis (e.g. "show me the fixed code")…'
                  : 'Describe a security task, or paste code / config / logs to analyze…'
              }
              disabled={composerMode === 'locked'}
            />
            <div className="row">
              <span className="note">
                {composerMode === 'locked' ? (
                  <>Analysis in progress. You can continue once it finishes.</>
                ) : composerMode === 'followup' ? (
                  <>Continuing this analysis · <span className="kbd">⌘/Ctrl ↵</span> to send</>
                ) : (
                  <>New analysis · <span className="kbd">⌘/Ctrl ↵</span> to send</>
                )}
              </span>
              <button
                className="submit"
                onClick={onSubmit}
                disabled={busy || composerMode === 'locked' || composer.trim().length === 0}
              >
                {busy ? 'Sending…' : composerMode === 'followup' ? 'Continue' : 'Analyze'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusDot({ status }: { status: TaskStatus }) {
  const color =
    status === 'completed'
      ? 'var(--accent)'
      : status === 'failed'
        ? 'var(--danger)'
        : status === 'incomplete'
          ? 'var(--sev-medium)'
          : TERMINAL.has(status)
            ? 'var(--text-faint)'
            : 'var(--sev-low)';
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flex: '0 0 auto',
        marginTop: 6,
        boxShadow: TERMINAL.has(status) ? 'none' : `0 0 6px ${color}`,
      }}
    />
  );
}

function Turn({ turn }: { turn: Detail }) {
  const running = !TERMINAL.has(turn.status);
  const elapsed = Math.floor((Date.now() - turn.createdAt) / 1000);

  return (
    <div className="turn">
      <div className="bubble-user">
        <div className="who">Request</div>
        <div className="body">{turn.input}</div>
      </div>

      {running && (
        <div className="card pending">
          <div className="working">
            <span className="spinner" />
            <div>
              <div>Analyzing… <span className="badge in_progress">{turn.status}</span></div>
              <div className="hint">
                The agent is working in its sandbox ({elapsed}s). This can take from a few seconds to a
                couple of minutes.
              </div>
            </div>
          </div>
        </div>
      )}

      {turn.status === 'failed' && (
        <div className="card failed">
          <div className="result-head">
            <h3>Analysis failed</h3>
            <span className="badge failed">failed</span>
          </div>
          <p className="answer">
            {turn.answer?.trim() || 'The analysis did not complete. Please try again.'}
          </p>
        </div>
      )}

      {turn.status === 'cancelled' && (
        <div className="card">
          <div className="result-head">
            <h3>Analysis cancelled</h3>
            <span className="badge cancelled">cancelled</span>
          </div>
        </div>
      )}

      {(turn.status === 'completed' || turn.status === 'incomplete') && turn.roleMismatch && (
        <div className="card rolemismatch">
          <div className="result-head">
            <h3>Outside scope</h3>
            <span className="badge cancelled">not a security task</span>
          </div>
          <p className="answer">{stripRoleMismatch(turn.answer || '')}</p>
        </div>
      )}

      {(turn.status === 'completed' || turn.status === 'incomplete') && !turn.roleMismatch && (
        <div className="card">
          <div className="result-head">
            <h3>{turn.title || 'Analysis complete'}</h3>
            <span className={`badge ${turn.status}`}>{turn.status}</span>
          </div>
          {turn.summary && <p className="result-summary">{turn.summary}</p>}
          {turn.answer && <p className="answer">{turn.answer}</p>}

          {turn.incompleteReason && (
            <p className="footer-meta">
              Stopped early ({turn.incompleteReason === 'timeout' ? 'time budget' : 'step budget'}).
              You can continue to let it finish.
            </p>
          )}

          {turn.previewUrl && (
            <div className="preview-wrap">
              <div className="preview-bar">
                <span>
                  <span className="dot">●</span> Security report: sandboxed preview
                </span>
                <a href={turn.previewUrl} target="_blank" rel="noreferrer noopener">
                  Open in new tab ↗
                </a>
              </div>
              <iframe
                className="preview-frame"
                src={turn.previewUrl}
                sandbox="allow-scripts allow-forms"
                referrerPolicy="no-referrer"
                title={`Report for ${turn.taskId}`}
              />
            </div>
          )}

          {turn.files.length > 0 && (
            <div className="files">
              <div className="files-label">Deliverables</div>
              {turn.files.map((f) => (
                <div className="file" key={f.path}>
                  <span className="icon">{fileIcon(f.kind)}</span>
                  <span className="fname">{f.filename}</span>
                  <span className="meta">{formatBytes(f.bytes)}</span>
                  <a className="dl" href={f.downloadPath}>
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
