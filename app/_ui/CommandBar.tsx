'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowUp, FileCode2, LoaderCircle, Paperclip, X } from 'lucide-react';
import type { RepoRef } from '@/shared/github';
import { GithubMark } from './icons';
import { fmtBytes } from './primitives';
import type { Attachment } from './draft';

export function CommandBar({
  value, onChange, attachments, onAttach, onRemove, repo, onDismissRepo, onSubmit, busy, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  attachments: Attachment[];
  onAttach: (files: FileList | File[]) => void;
  onRemove: (i: number) => void;
  repo: RepoRef | null;
  onDismissRepo: () => void;
  onSubmit: () => void;
  busy: boolean;
  autoFocus?: boolean;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const canSend = !busy && (value.trim().length > 0 || attachments.length > 0);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(340, Math.max(132, el.scrollHeight)) + 'px';
  }, [value]);

  useEffect(() => { if (autoFocus) ta.current?.focus(); }, [autoFocus]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (canSend) onSubmit(); }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files?.length) onAttach(e.dataTransfer.files);
  };
  const onPaste = (e: ClipboardEvent) => {
    if (e.clipboardData.files?.length) { e.preventDefault(); onAttach(e.clipboardData.files); }
  };

  return (
    <div
      className={`cmd${drag ? ' drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <div className="cmd-inner">
        <textarea
          ref={ta}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder="Paste code, drop files, or paste a GitHub repo URL…"
          spellCheck={false}
          aria-label="What should Sentinel review?"
        />
        {(repo || attachments.length > 0) && (
          <div className="cmd-chips">
            {repo && (
              <div className="repo-chip">
                <span className="gh"><GithubMark size={17} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b>{repo.owner}/{repo.repo}</b>{repo.ref && <span className="muted mono"> @ {repo.ref}</span>}
                  <div className="sub">Public repository — Sentinel will fetch it and audit the source in an isolated sandbox.</div>
                </div>
                <button className="icon-btn" onClick={onDismissRepo} aria-label="Don't scan this repo" title="Treat as text"><X size={15} /></button>
              </div>
            )}
            {attachments.map((a, i) => (
              <span className="att-chip" key={a.name + i}>
                <FileCode2 size={13} /> {a.name} <span className="muted">{fmtBytes(a.size)}</span>
                <button className="x" onClick={() => onRemove(i)} aria-label={`Remove ${a.name}`}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="cmd-bar">
          <div className="cmd-tools">
            <button className="tool-btn" onClick={() => fileInput.current?.click()}><Paperclip size={15} /> Attach files</button>
            <button className="tool-btn" onClick={() => { if (!/github\.com\//i.test(value)) onChange((value ? value.trimEnd() + '\n' : '') + 'https://github.com/'); ta.current?.focus(); }}>
              <GithubMark size={14} /> Scan a repo
            </button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) onAttach(e.target.files); e.target.value = ''; }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="cmd-hint"><span className="kbd">⌘</span><span className="kbd">↵</span></span>
            <button className="btn btn-primary" onClick={onSubmit} disabled={!canSend}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <ArrowUp size={15} />}
              {busy ? (repo ? 'Fetching repo…' : 'Starting…') : repo ? 'Scan repository' : 'Analyze'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
