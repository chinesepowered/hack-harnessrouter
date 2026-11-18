'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { parseInline, parseMarkdown, type Block, type Inline } from '@/shared/markdown';

// Renders the safe AST from shared/markdown as React elements. React escapes every text node and
// only http(s) links ever become <a>, so untrusted agent output can't inject markup.

export function renderInline(c: Inline[]): ReactNode[] {
  return c.map((n, i) => {
    switch (n.t) {
      case 'text': return <Fragment key={i}>{n.v}</Fragment>;
      case 'code': return <code key={i} className="ic">{n.v}</code>;
      case 'b': return <strong key={i}>{renderInline(n.c)}</strong>;
      case 'i': return <em key={i}>{renderInline(n.c)}</em>;
      case 's': return <del key={i}>{renderInline(n.c)}</del>;
      case 'a': return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow">{renderInline(n.c)}</a>;
      case 'br': return <br key={i} />;
    }
  });
}

export function InlineMd({ text }: { text: string }) {
  const c = useMemo(() => parseInline(text), [text]);
  return <>{renderInline(c)}</>;
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const long = code.split('\n').length > 22;
  const [open, setOpen] = useState(!long);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* ignore */ }
  };
  return (
    <div className={`code${open ? '' : ' clip'}`}>
      <div className="code-h">
        <span>{lang || 'code'}</span>
        <button className="icon-btn" onClick={copy} aria-label="Copy code" title="Copy">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre><code>{code}</code></pre>
      {long && (
        <button className="code-more" onClick={() => setOpen((o) => !o)}>{open ? 'Collapse' : `Show all ${code.split('\n').length} lines`}</button>
      )}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p': return <p>{renderInline(b.c)}</p>;
    case 'h': {
      const H = (['h3', 'h4', 'h5', 'h6'] as const)[b.level - 1];
      return <H>{renderInline(b.c)}</H>;
    }
    case 'code': return <CodeBlock code={b.v} lang={b.lang} />;
    case 'list': {
      const items = b.items.map((it, i) => (
        <li key={i}>{renderInline(it.c)}{it.sub.map((s, j) => <BlockView key={j} b={s} />)}</li>
      ));
      return b.ordered ? <ol start={b.start}>{items}</ol> : <ul>{items}</ul>;
    }
    case 'quote': return <blockquote>{b.c.map((s, i) => <BlockView key={i} b={s} />)}</blockquote>;
    case 'table':
      return (
        <div className="md-table">
          <table>
            <thead><tr>{b.head.map((h, i) => <th key={i}>{renderInline(h)}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{renderInline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'hr': return <hr />;
  }
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className={`md${className ? ' ' + className : ''}`}>{blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>;
}
