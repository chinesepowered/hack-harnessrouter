'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, ChevronRight, CircleAlert, LoaderCircle, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { findRepoRef, repoSlug } from '@/shared/github';
import type { ClientDetail, ClientSummary, TaskStatus } from '@/shared/types';
import { Sidebar } from './_ui/Sidebar';
import { Home } from './_ui/Home';
import { ScanProgress, InlineProgress } from './_ui/ScanProgress';
import { Report, FollowUpReply } from './_ui/Report';
import { composeInput, readFiles, MAX_INPUT_CHARS, type Attachment, type Example } from './_ui/draft';

const TERMINAL: ReadonlySet<TaskStatus> = new Set(['completed', 'incomplete', 'failed', 'cancelled']);
const isRunning = (t?: ClientDetail) => !!t && !TERMINAL.has(t.status);
const sourceUrl = (t: ClientDetail) => (t.source
  ? `https://github.com/${t.source.repo}${t.source.ref ? `/tree/${t.source.ref}${t.source.subpath ? '/' + t.source.subpath : ''}` : ''}`
  : undefined);

async function getJSON<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  let data = {} as T & { error?: string };
  try { data = await res.json(); } catch { /* empty */ }
  return { ok: res.ok, status: res.status, data };
}

export default function App() {
  const [tasks, setTasks] = useState<ClientSummary[]>([]);
  const [samples, setSamples] = useState<ClientSummary[]>([]);
  const [thread, setThread] = useState<ClientDetail[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dismissedRepo, setDismissedRepo] = useState<string | null>(null);
  const [dock, setDock] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const runId = useRef(0);
  const polling = useRef<Set<string>>(new Set());
  const threadRef = useRef<ClientDetail[]>([]);
  threadRef.current = thread;

  const detected = useMemo(() => findRepoRef(draft), [draft]);
  const repo = detected && repoSlug(detected) !== dismissedRepo ? detected : null;
  const root = thread[0];
  const followUps = thread.slice(1);
  const anyRunning = thread.some(isRunning);

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 6500); }, []);

  const loadTasks = useCallback(async () => {
    try { const r = await getJSON<{ tasks: ClientSummary[] }>('/api/tasks'); if (r.ok) setTasks(r.data.tasks || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    loadTasks();
    getJSON<{ samples: ClientSummary[] }>('/api/samples').then((r) => r.ok && setSamples(r.data.samples || [])).catch(() => {});
  }, [loadTasks]);

  const upsert = useCallback((d: ClientDetail) => {
    setThread((cur) => {
      const i = cur.findIndex((t) => t.taskId === d.taskId);
      if (i === -1) return cur;
      const prev = cur[i];
      const keepStage = prev.progress && d.progress && d.progress.stage < prev.progress.stage;
      const next = cur.slice();
      next[i] = keepStage ? { ...d, progress: { ...d.progress!, stage: prev.progress!.stage } } : d;
      return next;
    });
  }, []);

  const poll = useCallback((taskId: string, myRun: number) => {
    if (polling.current.has(taskId)) return;
    polling.current.add(taskId);
    const t0 = Date.now();
    const tick = async () => {
      if (myRun !== runId.current) { polling.current.delete(taskId); return; }
      try {
        const r = await getJSON<ClientDetail>(`/api/tasks/${taskId}`);
        if (r.ok && myRun === runId.current) {
          upsert(r.data);
          if (TERMINAL.has(r.data.status)) { polling.current.delete(taskId); loadTasks(); return; }
        }
      } catch { /* transient: keep polling */ }
      setTimeout(tick, Date.now() - t0 > 90_000 ? 5000 : 2500);
    };
    setTimeout(tick, 1200);
  }, [loadTasks, upsert]);

  const resetDraft = () => { setDraft(''); setAttachments([]); setDismissedRepo(null); };

  const launch = useCallback(async (input: string, repoUrl: string | undefined, fromDraft: boolean) => {
    setBusy(true);
    try {
      const r = await getJSON<ClientDetail>('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, repo: repoUrl }),
      });
      if (!r.ok) { say(r.data.error || 'Could not start the scan.'); loadTasks(); return; }
      runId.current += 1;
      polling.current.clear();
      setThread([r.data]);
      if (fromDraft) resetDraft();
      loadTasks();
      if (isRunning(r.data)) poll(r.data.taskId, runId.current);
      window.scrollTo({ top: 0 });
    } catch {
      say('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [loadTasks, poll, say]);

  const startScan = useCallback(async () => {
    const input = composeInput(draft, attachments);
    if (!input && !repo) return;
    if (input.length > MAX_INPUT_CHARS) { say('That’s over the 100k-character limit. Attach fewer files or scan the GitHub repo instead.'); return; }
    const repoUrl = repo ? `https://github.com/${repo.owner}/${repo.repo}${repo.ref ? `/tree/${repo.ref}${repo.subpath ? '/' + repo.subpath : ''}` : ''}` : undefined;
    await launch(input, repoUrl, true);
  }, [attachments, draft, launch, repo, say]);

  const followUp = useCallback(async (prompt: string) => {
    // Continue from the latest turn that finished; a failed follow-up doesn't end the conversation
    // (HarnessRouter appends to the session after its latest turn either way).
    const parent = [...threadRef.current].reverse().find((t) => t.canContinue);
    if (!parent || parent.sample) return;
    setBusy(true);
    try {
      const r = await getJSON<ClientDetail>(`/api/tasks/${parent.taskId}/continue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: prompt }),
      });
      if (!r.ok) { say(r.data.error || 'Could not continue the analysis.'); return; }
      setThread((cur) => [...cur, r.data]);
      setDock('');
      loadTasks();
      if (isRunning(r.data)) poll(r.data.taskId, runId.current);
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 80);
    } catch {
      say('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [loadTasks, poll, say]);

  const openTask = useCallback(async (rootId: string) => {
    runId.current += 1;
    polling.current.clear();
    const mine = runId.current;
    try {
      const list = await getJSON<{ tasks: ClientSummary[] }>('/api/tasks');
      const all = list.ok ? list.data.tasks || [] : tasks;
      if (list.ok) setTasks(all);
      // rebuild the whole conversation: the root, then its follow-up chain in order
      const kids = new Map<string, ClientSummary[]>();
      for (const t of all) if (t.parentTaskId) kids.set(t.parentTaskId, [...(kids.get(t.parentTaskId) || []), t]);
      const order: string[] = [];
      const walk = (id: string) => {
        order.push(id);
        for (const c of (kids.get(id) || []).sort((a, b) => a.createdAt - b.createdAt)) walk(c.taskId);
      };
      walk(rootId);
      const details = await Promise.all(order.map((id) => getJSON<ClientDetail>(`/api/tasks/${id}`)));
      if (mine !== runId.current) return;
      const ok = details.filter((d) => d.ok).map((d) => d.data);
      if (!ok.length) { say('Could not open that scan.'); return; }
      setThread(ok);
      ok.filter(isRunning).forEach((d) => poll(d.taskId, mine));
      loadTasks(); // opening may have settled finished scans; refresh their sidebar status
      window.scrollTo({ top: 0 });
    } catch {
      say('Network error. Please try again.');
    }
  }, [loadTasks, poll, say, tasks]);

  const openSample = useCallback(async (id: string) => {
    runId.current += 1;
    polling.current.clear();
    const r = await getJSON<ClientDetail>(`/api/samples/${id}`);
    if (!r.ok) { say('Could not open that sample.'); return; }
    setThread([r.data]);
    window.scrollTo({ top: 0 });
  }, [say]);

  const newScan = useCallback(() => {
    runId.current += 1;
    polling.current.clear();
    setThread([]);
    window.scrollTo({ top: 0 });
  }, []);

  const onExample = (ex: Example) => { setDraft(ex.text); setAttachments(ex.attachments); setDismissedRepo(null); };
  const onAttach = async (files: FileList | File[]) => {
    const { ok, rejected } = await readFiles(files);
    if (ok.length) setAttachments((a) => [...a, ...ok].slice(0, 8));
    if (rejected.length) say(`Skipped: ${rejected.join(', ')}. Attach text/source files up to 300 KB.`);
  };
  const onDockKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (dock.trim() && !anyRunning && !busy) followUp(dock.trim()); }
  };

  const crumbTitle = root ? root.title || (root.source ? root.source.repo : isRunning(root) ? 'Scanning…' : 'Security review') : 'New scan';
  const showDock = root && !root.sample && TERMINAL.has(root.status) && root.status !== 'failed' && root.status !== 'cancelled' && !root.roleMismatch;

  return (
    <div className="shell">
      <Sidebar tasks={tasks} samples={samples} activeId={root?.taskId} onNew={newScan} onOpenTask={openTask} onOpenSample={openSample} />
      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>{root?.sample ? 'Samples' : 'Scans'}</span><ChevronRight size={14} /><b>{crumbTitle}</b>
          </div>
          <span className="agent-badge"><span className="live" /><b>Security Analyst</b><span className="long"> · qwen3.8-max on HarnessRouter</span></span>
        </header>

        {!root && (
          <Home
            value={draft} onChange={setDraft} attachments={attachments} onAttach={onAttach}
            onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))}
            repo={repo} onDismissRepo={() => detected && setDismissedRepo(repoSlug(detected))}
            onSubmit={startScan} busy={busy} samples={samples} onExample={onExample} onOpenSample={openSample}
          />
        )}

        {root && (
          <div className="view">
            {isRunning(root) && <ScanProgress detail={root} />}

            {root.status === 'failed' && (
              <div className="alert err rise"><TriangleAlert size={18} style={{ flex: 'none' }} />
                <div style={{ flex: 1 }}><b>The scan didn’t complete.</b><div style={{ marginTop: 4 }}>{root.answer || 'Please try again.'}</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => launch(root.input, sourceUrl(root), false)} disabled={busy}><RotateCcw size={13} /> Run it again</button>
              </div>
            )}
            {root.status === 'cancelled' && <div className="alert info rise"><CircleAlert size={18} /> This scan was cancelled.</div>}
            {root.roleMismatch && (
              <div className="alert info rise"><CircleAlert size={18} style={{ flex: 'none' }} />
                <div><b>Outside Sentinel’s scope.</b><div style={{ marginTop: 4 }}>{(root.answer || '').replace(/^\s*role_mismatch\s*/i, '') || 'Sentinel analyzes and advises on software and system security.'}</div></div></div>
            )}

            {(root.status === 'completed' || root.status === 'incomplete') && !root.roleMismatch && (
              <Report detail={root} onFollowUp={followUp} followUpRunning={anyRunning || busy} onNewScan={newScan} />
            )}

            {followUps.map((t, i) => (
              <div className="turn" key={t.taskId}>
                <div className="ask">{t.input}</div>
                {isRunning(t) ? <InlineProgress detail={t} />
                  : t.status === 'failed' ? (
                    <div className="alert err"><TriangleAlert size={16} style={{ flex: 'none' }} />
                      <span style={{ flex: 1 }}>{t.answer || 'That follow-up didn’t complete.'}</span>
                      {i === followUps.length - 1 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => followUp(t.input)} disabled={anyRunning || busy}><RotateCcw size={13} /> Try again</button>
                      )}
                    </div>
                  )
                  : <FollowUpReply detail={t} />}
              </div>
            ))}
          </div>
        )}

        {showDock && (
          <div className="dock">
            <div className="dock-inner">
              <textarea
                value={dock} onChange={(e) => setDock(e.target.value)} onKeyDown={onDockKey} rows={1}
                placeholder={anyRunning ? 'Sentinel is working. You can ask another follow-up when it finishes…' : 'Ask a follow-up about this report…'}
                disabled={anyRunning}
              />
              <button className="btn btn-primary" onClick={() => followUp(dock.trim())} disabled={!dock.trim() || anyRunning || busy} aria-label="Send follow-up">
                {busy ? <LoaderCircle size={15} className="spin" /> : <ArrowUp size={15} />}
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="toast" role="alert"><CircleAlert size={16} style={{ flex: 'none' }} /> {toast}
            <button className="icon-btn" onClick={() => setToast(null)} aria-label="Dismiss"><X size={14} /></button></div>
        )}
      </main>
    </div>
  );
}
