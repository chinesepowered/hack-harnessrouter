// Tests for the isomorphic shared/ modules. Run via `pnpm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFindings, severityCounts, riskLevel, securityScore, gradeOf, toSeverity } from '../shared/findings.ts';
import { buildProgress, classifyTool } from '../shared/activity.ts';
import { parseMarkdown, parseInline, type Inline } from '../shared/markdown.ts';
import { findRepoRef, parseRepoUrl } from '../shared/github.ts';
import { failedRunMessage } from '../shared/errors.ts';

// ── findings ────────────────────────────────────────────────────────────────────────────────
test('normalizeFindings: real-world shape, sorting, CWE from references, unsafe refs dropped', () => {
  const raw = [
    { id: 'F-02', title: 'Missing rate limit', severity: 'low', location: 'app.py:9', description: 'x',
      recommendation: 'y', references: ['javascript:alert(1)', 'https://owasp.org/x'] },
    { id: 'F-01', title: 'OS command injection', severity: 'Critical', location: 'app.js:5',
      description: 'd', recommendation: 'r', references: ['https://cwe.mitre.org/data/definitions/78.html'] },
    { title: '', severity: 'High' }, // no title → skipped
    'garbage',
  ];
  const f = normalizeFindings(raw);
  assert.deepEqual(f.map((x) => x.id), ['F-01', 'F-02']);
  assert.equal(f[0].severity, 'Critical');
  assert.equal(f[0].cwe, 'CWE-78'); // derived from the reference URL
  assert.deepEqual(f[1].references, ['https://owasp.org/x']); // javascript: dropped
  assert.equal(f[1].severity, 'Low');
});

test('normalizeFindings: new schema, synonyms, wrapped object, bounds', () => {
  const f = normalizeFindings({ findings: [
    { name: 'IDOR', risk: 'moderate', remediation: 'check owner', cwe_id: 'cwe-639', fix_code: 'if x: abort(403)', impact: 'read others' },
  ] });
  assert.equal(f.length, 1);
  assert.equal(f[0].title, 'IDOR');
  assert.equal(f[0].severity, 'Medium');
  assert.equal(f[0].recommendation, 'check owner');
  assert.equal(f[0].cwe, 'CWE-639');
  assert.equal(f[0].fix, 'if x: abort(403)');
  assert.equal(f[0].id, 'F-01'); // generated
  const many = normalizeFindings(Array.from({ length: 300 }, (_, i) => ({ title: 't' + i, severity: 'info', description: 'x'.repeat(9000) })));
  assert.equal(many.length, 100);
  assert.ok(many[0].description.length <= 2500);
  assert.deepEqual(normalizeFindings(null), []);
  assert.equal(toSeverity('SEVERE'), 'High');
  assert.equal(toSeverity(undefined), 'Info');
});

test('severity counts, risk level, score and grade', () => {
  const c = severityCounts(normalizeFindings([{ title: 'a', severity: 'Critical' }, { title: 'b', severity: 'High' }, { title: 'c', severity: 'High' }]));
  assert.deepEqual(c, { Critical: 1, High: 2, Medium: 0, Low: 0, Info: 0 });
  assert.equal(riskLevel(c), 'Critical');
  assert.equal(riskLevel({ Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 }), null);
  assert.equal(securityScore(null), 100);
  assert.equal(gradeOf(securityScore({ Critical: 0, High: 0, Medium: 0, Low: 0, Info: 3 })), 'A');
  assert.ok(securityScore({ Critical: 1, High: 0, Medium: 0, Low: 0, Info: 0 }) <= 59); // a Critical caps at D
  assert.equal(gradeOf(securityScore({ Critical: 4, High: 4, Medium: 4, Low: 2, Info: 1 })), 'F');
});

// ── live activity ───────────────────────────────────────────────────────────────────────────
test('classifyTool maps real tool names to safe labels', () => {
  assert.equal(classifyTool('todo_write').kind, 'plan'); // not "write"
  assert.equal(classifyTool('grep_search').kind, 'read'); // not "search"
  assert.equal(classifyTool('read_file').kind, 'read');
  assert.equal(classifyTool('run_shell_command').kind, 'run');
  assert.equal(classifyTool('write_file').kind, 'write');
  assert.equal(classifyTool('web_fetch').kind, 'search');
  assert.equal(classifyTool('mcp__memories__memory_recall').label, 'Checking notes');
});

test('buildProgress: stage advances with activity, repeats collapse, only names used', () => {
  assert.equal(buildProgress('starting', []).stage, 0);
  assert.equal(buildProgress('running', []).stage, 1);
  const p = buildProgress('running', ['glob', 'read_file', 'read_file', 'run_shell_command', 'write_file', 'write_file']);
  assert.equal(p.stage, 3);
  assert.equal(p.steps, 6);
  assert.deepEqual(p.activities.map((a) => [a.kind, a.count]), [['read', 3], ['run', 1], ['write', 2]]);
});

// ── markdown safety ─────────────────────────────────────────────────────────────────────────
const links = (c: Inline[]): string[] => c.flatMap((n) => (n.t === 'a' ? [n.href, ...links(n.c)] : 'c' in n ? links(n.c) : []));

test('markdown: only http(s) links survive; raw HTML stays text', () => {
  const c = parseInline('[ok](https://example.com) [bad](javascript:alert(1)) [data](data:text/html,x) <script>alert(1)</script>');
  assert.deepEqual(links(c), ['https://example.com']);
  const text = c.filter((n) => n.t === 'text').map((n) => (n as { v: string }).v).join('');
  assert.ok(text.includes('<script>alert(1)</script>')); // rendered as text by React, never markup
  assert.ok(text.includes('bad') && text.includes('data'));
});

test('markdown: inline formatting, fences, lists, tables', () => {
  const inl = parseInline('**bold** and `code` and *it*, see https://owasp.org.');
  assert.deepEqual(inl.map((n) => n.t), ['b', 'text', 'code', 'text', 'i', 'text', 'a', 'text']);
  const blocks = parseMarkdown('# Title\n\nPara one\nline two\n\n- a\n  - nested\n- b\n\n```python\nprint(1)\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |');
  assert.deepEqual(blocks.map((b) => b.t), ['h', 'p', 'list', 'code', 'table']);
  const list = blocks[2] as { t: 'list'; items: { sub: unknown[] }[] };
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].sub.length, 1);
  assert.deepEqual(blocks[3], { t: 'code', lang: 'python', v: 'print(1)' });
});

// ── GitHub repo references (the server builds its ONLY fetch URL from these) ─────────────────
test('parseRepoUrl accepts real repo URLs', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/we45/Vulnerable-Flask-App'), { owner: 'we45', repo: 'Vulnerable-Flask-App', ref: null, subpath: null });
  assert.deepEqual(parseRepoUrl('github.com/vercel/next.js.git'), { owner: 'vercel', repo: 'next.js', ref: null, subpath: null });
  assert.deepEqual(parseRepoUrl('https://github.com/a/b/tree/dev/src/api'), { owner: 'a', repo: 'b', ref: 'dev', subpath: 'src/api' });
  assert.equal(findRepoRef('Audit this before we deploy: https://github.com/we45/Vulnerable-Flask-App thanks')?.repo, 'Vulnerable-Flask-App');
});

test('parseRepoUrl rejects non-repos and injection / traversal attempts', () => {
  for (const bad of [
    'https://gitlab.com/a/b', 'https://github.com/a', 'https://github.com/settings/profile',
    'https://evil.com/github.com/a/b', 'https://github.com/-x/b', 'https://github.com/a/..',
    'https://github.com/a/b/tree/--upload-pack=touch%20pwned', 'https://github.com/a/b/tree/-ref',
  ]) assert.equal(parseRepoUrl(bad), null, bad);
  assert.equal(parseRepoUrl('https://github.com/a/b/tree/main/../../etc')?.subpath, null); // traversal subpath dropped
  assert.equal(findRepoRef('no repo here'), null);
});

test('failed runs show a plain sentence from the error code, never upstream text', () => {
  const upstream = { type: 'harness_error', code: 'provider_error', message: 'upstream secret detail resp_123' };
  const m = failedRunMessage(upstream);
  assert.match(m, /model provider/);
  assert.doesNotMatch(m, /resp_123|secret/);
  assert.match(failedRunMessage({ code: 'something_new', message: 'x' }), /failed before finishing/);
  assert.match(failedRunMessage(null), /failed before finishing/);
  assert.match(failedRunMessage('provider_error'), /failed before finishing/); // only an object's code counts
});
