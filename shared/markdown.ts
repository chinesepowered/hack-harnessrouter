// A small, SAFE Markdown parser → AST. The renderer turns this into React elements, so there is
// no HTML injection path: raw HTML in the source is shown as text, and only http(s) links are
// ever emitted as links. Supports: headings, paragraphs, **bold**, *italic*, ~~strike~~,
// `code`, fenced code blocks, (nested) lists, blockquotes, tables, rules, links and bare URLs.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 's'; c: Inline[] }
  | { t: 'a'; href: string; c: Inline[] }
  | { t: 'br' };

export interface ListItem {
  c: Inline[];
  sub: Block[];
}

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

export const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

const FENCE = /^\s*(```+|~~~+)\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>/;
const LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const indentOf = (l: string) => (/^(\s*)/.exec(l) as RegExpExecArray)[1].replace(/\t/g, '    ').length;

function dedent(lines: string[]): string[] {
  const ind = lines.filter((l) => l.trim()).map(indentOf);
  const min = ind.length ? Math.min(...ind) : 0;
  return lines.map((l) => l.replace(/\t/g, '    ').slice(Math.min(min, indentOf(l))));
}

function isTableStart(line: string, next: string | undefined) {
  return line.includes('|') && next !== undefined && TABLE_SEP.test(next);
}

function isBlockStart(line: string, next: string | undefined) {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || LIST.test(line) || isTableStart(line, next);
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function parseList(lines: string[], start: number): [Block, number] {
  const first = LIST.exec(lines[start]) as RegExpExecArray;
  const base = indentOf(lines[start]);
  const ordered = /\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || indentOf(lines[i]) !== base || /\d/.test(m[2]) !== ordered) {
      if (!lines[i].trim() && i + 1 < lines.length) {
        const n = LIST.exec(lines[i + 1]);
        if (n && indentOf(lines[i + 1]) === base && /\d/.test(n[2]) === ordered) { i++; continue; }
      }
      break;
    }
    let body = m[3];
    i++;
    const sub: string[] = [];
    while (i < lines.length && lines[i].trim() && indentOf(lines[i]) > base) { sub.push(lines[i]); i++; }
    const nestAt = sub.findIndex((l) => LIST.test(l) || FENCE.test(l));
    const wrap = nestAt === -1 ? sub : sub.slice(0, nestAt);
    if (wrap.length) body += '\n' + wrap.map((l) => l.trim()).join('\n');
    items.push({ c: parseInline(body), sub: nestAt === -1 ? [] : parseBlocks(dedent(sub.slice(nestAt))) });
  }
  return [{ t: 'list', ordered, start: ordered ? parseInt(first[2], 10) || 1 : 1, items }, i];
}

export function parseBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fm = FENCE.exec(line);
    if (fm) {
      const marker = fm[1][0];
      const len = fm[1].length;
      const buf: string[] = [];
      i++;
      while (i < lines.length) {
        const close = /^\s*(```+|~~~+)\s*$/.exec(lines[i]);
        if (close && close[1][0] === marker && close[1].length >= len) break;
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push({ t: 'code', lang: fm[2].toLowerCase(), v: dedent(buf).join('\n') });
      continue;
    }
    const hm = HEADING.exec(line);
    if (hm) { out.push({ t: 'h', level: Math.min(4, hm[1].length) as 1 | 2 | 3 | 4, c: parseInline(hm[2]) }); i++; continue; }
    if (RULE.test(line)) { out.push({ t: 'hr' }); i++; continue; }
    if (QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) { buf.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++; }
      out.push({ t: 'quote', c: parseBlocks(buf) });
      continue;
    }
    if (isTableStart(line, lines[i + 1])) {
      const head = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(splitRow(lines[i]).map(parseInline)); i++; }
      out.push({ t: 'table', head, rows });
      continue;
    }
    if (LIST.test(line)) { const [b, next] = parseList(lines, i); out.push(b); i = next; continue; }
    const buf: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) { buf.push(lines[i].trim()); i++; }
    out.push({ t: 'p', c: parseInline(buf.join('\n')) });
  }
  return out;
}

export function parseMarkdown(src: string): Block[] {
  return parseBlocks(String(src ?? '').replace(/\r\n?/g, '\n').split('\n'));
}

function matchBracket(s: string, i: number): number {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '[') depth++;
    else if (s[j] === ']') { depth--; if (depth === 0) return j; }
  }
  return -1;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '`') {
      let n = 1;
      while (s[i + n] === '`') n++;
      const end = s.indexOf('`'.repeat(n), i + n);
      if (end !== -1) { flush(); out.push({ t: 'code', v: s.slice(i + n, end).replace(/^ (.+) $/, '$1') }); i = end + n; continue; }
      buf += '`'.repeat(n); i += n; continue;
    }
    if (ch === '\n') { flush(); out.push({ t: 'br' }); i++; continue; }
    if (ch === '\\' && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|~>]/.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2) { flush(); out.push({ t: 'b', c: parseInline(s.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if (s.startsWith('~~', i)) {
      const end = s.indexOf('~~', i + 2);
      if (end > i + 2) { flush(); out.push({ t: 's', c: parseInline(s.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if (ch === '*' && s[i + 1] && !/[\s*]/.test(s[i + 1])) {
      const end = s.indexOf('*', i + 1);
      if (end > i + 1 && !/\s/.test(s[end - 1]) && s[end + 1] !== '*') {
        flush(); out.push({ t: 'i', c: parseInline(s.slice(i + 1, end)) }); i = end + 1; continue;
      }
    }
    if (ch === '[') {
      const close = matchBracket(s, i);
      if (close !== -1 && s[close + 1] === '(') {
        const pe = s.indexOf(')', close + 2);
        if (pe !== -1) {
          const label = s.slice(i + 1, close);
          const url = s.slice(close + 2, pe).trim().split(/\s+/)[0] || '';
          flush();
          if (SAFE_URL.test(url)) out.push({ t: 'a', href: url, c: parseInline(label) });
          else out.push(...parseInline(label)); // javascript:, data:, relative… → plain text
          i = pe + 1;
          continue;
        }
      }
    }
    if ((ch === 'h' || ch === 'H') && (i === 0 || /[\s(]/.test(s[i - 1]))) {
      const m = /^https?:\/\/[^\s<>()"']+/i.exec(s.slice(i));
      if (m) {
        const url = m[0].replace(/[.,;:!?]+$/, '');
        flush(); out.push({ t: 'a', href: url, c: [{ t: 'text', v: url }] }); i += url.length; continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Plain text (for previews / titles). */
export function inlineToText(c: Inline[]): string {
  return c.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? ' ' : 'c' in n ? inlineToText(n.c) : '')).join('');
}
