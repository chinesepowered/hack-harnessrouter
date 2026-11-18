import 'server-only';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { RepoRef } from '@/shared/github';

/**
 * Fetch a PUBLIC GitHub repository as a .tar.gz for the agent's sandbox.
 *
 * SSRF-safe: the only URL ever fetched is built here from parts that `parseRepoUrl` already
 * whitelisted, and the final (post-redirect) host must be GitHub's. Size-capped and time-capped.
 * The archive is never extracted on our server — the agent extracts it inside its sandbox.
 */
export const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const runFile = promisify(execFile);

export type RepoFetchCode = 'not_found' | 'too_large' | 'unreachable';
export class RepoFetchError extends Error {
  readonly code: RepoFetchCode;
  constructor(code: RepoFetchCode) {
    super(code);
    this.code = code;
  }
}

export async function fetchRepoArchive(r: RepoRef): Promise<Uint8Array> {
  try {
    return await viaArchive(r);
  } catch (e) {
    const err = e instanceof RepoFetchError ? e : new RepoFetchError('unreachable');
    if (err.code !== 'unreachable') throw err;
    // Dev fallback for machines behind proxies that block GitHub archive downloads. On hosts
    // without git (e.g. Vercel) this simply fails and the original error is reported.
    try {
      return await viaGit(r);
    } catch (g) {
      throw g instanceof RepoFetchError && g.code === 'too_large' ? g : err;
    }
  }
}

async function viaArchive(r: RepoRef): Promise<Uint8Array> {
  const url = `https://codeload.github.com/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}/tar.gz/${encodeURIComponent(r.ref || 'HEAD')}`;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  let host = '';
  try { host = new URL(res.url || url).hostname; } catch { /* keep empty */ }
  if (!/(^|\.)github(usercontent)?\.com$/i.test(host)) throw new RepoFetchError('unreachable');
  if (res.status === 404) throw new RepoFetchError('not_found');
  if (!res.ok || !res.body) throw new RepoFetchError('unreachable');
  if (Number(res.headers.get('content-length') || 0) > MAX_ARCHIVE_BYTES) throw new RepoFetchError('too_large');
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_ARCHIVE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new RepoFetchError('too_large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  if (out.length < 2 || out[0] !== 0x1f || out[1] !== 0x8b) throw new RepoFetchError('unreachable'); // gzip magic
  return out;
}

async function viaGit(r: RepoRef): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-repo-'));
  try {
    const args = ['clone', '--depth', '1', '--quiet', '--no-tags', '--single-branch'];
    if (r.ref) args.push('--branch', r.ref);
    args.push(`https://github.com/${r.owner}/${r.repo}.git`, join(dir, 'src'));
    await runFile('git', args, {
      timeout: 90_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' },
    });
    const tgz = join(dir, 'repo.tar.gz');
    await runFile('tar', ['-czf', tgz, '--exclude=.git', '-C', join(dir, 'src'), '.'], { timeout: 60_000 });
    if ((await stat(tgz)).size > MAX_ARCHIVE_BYTES) throw new RepoFetchError('too_large');
    return new Uint8Array(await readFile(tgz));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
