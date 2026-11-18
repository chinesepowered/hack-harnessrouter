// Detect and strictly validate a GitHub repository reference. Isomorphic: the UI uses it to show
// a repo chip as the user types; the server uses it again (never trusting the client) to build
// the ONLY URL it will fetch. Everything is whitelisted characters, so no path/arg injection.

export interface RepoRef {
  owner: string;
  repo: string;
  ref: string | null;
  subpath: string | null;
}

const CANDIDATE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s<>"'()`]+/i;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME = /^[A-Za-z0-9_.][A-Za-z0-9._-]{0,99}$/;
const REF = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;
const SUBPATH = /^[A-Za-z0-9._\/-]{1,300}$/;
const RESERVED = new Set([
  'orgs', 'settings', 'marketplace', 'features', 'topics', 'collections', 'sponsors', 'about', 'pricing',
  'login', 'join', 'explore', 'notifications', 'new', 'search', 'enterprise', 'apps', 'site', 'security',
]);

export function parseRepoUrl(raw: string): RepoRef | null {
  let s = String(raw || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (!/^github\.com\//i.test(s)) return null;
  s = s.slice('github.com/'.length).split(/[?#]/)[0].replace(/[.,;:!]+$/, '');
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!OWNER.test(owner) || RESERVED.has(owner.toLowerCase())) return null;
  if (!NAME.test(repo) || repo === '.' || repo === '..') return null;
  let ref: string | null = null;
  let subpath: string | null = null;
  if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) {
    if (!REF.test(parts[3])) return null;
    ref = parts[3];
    const rest = parts.slice(4).join('/');
    if (rest && SUBPATH.test(rest) && !rest.split('/').some((x) => x === '..' || x === '.')) subpath = rest;
  }
  return { owner, repo, ref, subpath };
}

/** The first GitHub repo URL found in free text, if any. */
export function findRepoRef(text: string): RepoRef | null {
  const m = CANDIDATE.exec(String(text || ''));
  return m ? parseRepoUrl(m[0]) : null;
}

export const repoSlug = (r: { owner: string; repo: string }) => `${r.owner}/${r.repo}`;
