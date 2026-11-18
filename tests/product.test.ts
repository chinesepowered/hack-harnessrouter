// Product-level tests: the `user` guarantee (HarnessRouter client mocked) and per-user tenancy.
// Run: node --test --conditions=react-server tests/product.test.ts
// (--conditions=react-server makes the `server-only` import in lib/task-store.ts resolve to a no-op.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HarnessRouter, type HRResponse } from '../lib/harnessrouter.ts';
import { MemoryStore, TiDBStore, type TaskRecord } from '../lib/task-store.ts';

const SID = 'hsess_p1';
const RID = 'resp_p1';
const created: HRResponse = { id: RID, object: 'response', status: 'in_progress', output: [], metadata: { session_id: SID } };

interface Call { url: string; method: string; headers: Record<string, string>; body: any }
function mockFetch(route: (c: Call) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) h[k.toLowerCase()] = v;
    const c = { url: String(input), method: init?.method ?? 'GET', headers: h, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    return route(c);
  }) as typeof fetch;
  return { fetch: f, calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const client = (f: typeof fetch) => new HarnessRouter({ apiKey: 'sk-hr-testtesttest', fetch: f, sleep: async () => {} });

test('background start: sends user + harness_id + background:true, and no previous_response_id', async () => {
  const { fetch, calls } = mockFetch(() => json(created));
  await client(fetch).startBackground({ harnessId: 'chrn_x', input: 'scan this', user: 'u-42', idempotencyKey: 'k1' });
  const c = calls[0];
  assert.equal(c.url, 'https://api.harnessrouter.ai/v1/responses');
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.authorization, 'Bearer sk-hr-testtesttest');
  assert.equal(c.headers['uhp-version'], '2026-09-28');
  assert.equal(c.headers['idempotency-key'], 'k1');
  assert.equal(c.body.user, 'u-42'); // the signed-in person's id, always sent
  assert.equal(c.body.metadata.harness_id, 'chrn_x'); // server-set, never from the browser
  assert.equal(c.body.background, true);
  assert.equal(c.body.stream, undefined);
  assert.equal(c.body.previous_response_id, undefined);
  assert.equal(c.body.metadata.session_id, undefined);
});

test('background follow-up: carries previous_response_id, session_id, harness_id and user', async () => {
  const { fetch, calls } = mockFetch(() => json(created));
  await client(fetch).startBackground({
    harnessId: 'chrn_x', input: 'now show the fix', user: 'u-42',
    previousResponseId: 'resp_prev', sessionId: 'hsess_prev', idempotencyKey: 'k2',
  });
  const b = calls[0].body;
  assert.equal(b.user, 'u-42');
  assert.equal(b.previous_response_id, 'resp_prev');
  assert.equal(b.metadata.harness_id, 'chrn_x');
  assert.equal(b.metadata.session_id, 'hsess_prev');
  assert.equal(b.background, true);
});

test('per-task budgets go out as snake_case', async () => {
  const { fetch, calls } = mockFetch(() => json(created));
  await client(fetch).startBackground({
    harnessId: 'chrn_x', input: 'x', user: 'u', idempotencyKey: 'k3',
    maxStep: 120, timeoutSeconds: 1200, maxCostUsd: 3,
  });
  const b = calls[0].body;
  assert.equal(b.max_step, 120);
  assert.equal(b.timeout_seconds, 1200);
  assert.equal(b.max_cost_usd, 3);
});

test('MemoryStore keeps each user’s tasks separate (tenancy)', async () => {
  const store = new MemoryStore();
  const mk = (taskId: string, userId: string): TaskRecord => ({
    taskId, userId, harnessId: 'chrn_x', idempotencyKey: 'k', status: 'completed',
    input: 'secret for ' + userId, createdAt: Date.now(), updatedAt: Date.now(),
  });
  await store.put(mk('ta', 'userA'));
  await store.put(mk('tb', 'userB'));

  const aList = await store.listByUser('userA');
  const bList = await store.listByUser('userB');
  assert.deepEqual(aList.map((r) => r.taskId), ['ta']);
  assert.deepEqual(bList.map((r) => r.taskId), ['tb']);

  // Ownership: a record carries its owner; routes reject a mismatch (userId !== caller).
  const ta = await store.get('ta');
  assert.equal(ta?.userId, 'userA');
  assert.notEqual(ta?.userId, 'userB');
});

test('TiDBStore: builds executor once, creates table, upserts, reads, lists by user', async () => {
  const mk = (taskId: string, userId: string, createdAt: number): TaskRecord => ({
    taskId, userId, harnessId: 'chrn_x', idempotencyKey: 'k', status: 'completed',
    input: 'x', createdAt, updatedAt: createdAt,
  });
  const r1 = mk('t1', 'userA', 100);
  const r2 = mk('t2', 'userA', 200);
  const calls: { sql: string; params: unknown[] }[] = [];
  const fakeExec = (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT data FROM sentinel_tasks WHERE task_id/.test(sql)) {
      return Promise.resolve(params[0] === 't1' ? [{ data: JSON.stringify(r1) }] : []);
    }
    if (/SELECT data FROM sentinel_tasks WHERE user_id/.test(sql)) {
      // newest first; mix object + string forms to exercise both decode paths
      return Promise.resolve([{ data: r2 }, { data: JSON.stringify(r1) }]);
    }
    return Promise.resolve({ rowsAffected: 1 });
  };
  let made = 0;
  const store = new TiDBStore(async () => { made++; return fakeExec as unknown as (s: string, p?: unknown[]) => Promise<unknown>; });

  await store.put(r1);
  await store.put(r2);
  const got = await store.get('t1');
  const miss = await store.get('nope');
  const list = await store.listByUser('userA');

  assert.equal(made, 1); // executor + table init happen once, then reused
  assert.ok(calls.some((c) => /CREATE TABLE IF NOT EXISTS sentinel_tasks/.test(c.sql)));
  const ins = calls.find((c) => /INSERT INTO sentinel_tasks/.test(c.sql));
  assert.ok(ins && ins.params[0] === 't1' && /ON DUPLICATE KEY UPDATE/.test(ins.sql));
  assert.equal(JSON.parse(ins!.params[3] as string).taskId, 't1'); // full record stored as JSON
  assert.equal(got?.taskId, 't1');
  assert.equal(miss, undefined);
  assert.deepEqual(list.map((r) => r.taskId), ['t2', 't1']); // ordered newest-first, both decode paths
});
