import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Stable server secrets for signing the session cookie and the preview URLs.
 *
 * In PRODUCTION set real env vars (COOKIE_SECRET, PREVIEW_SIGNING_SECRET) — on a serverless host
 * every invocation is a fresh process, so a random per-process value would make cookies and
 * preview links stop validating between requests. See README.
 *
 * In DEVELOPMENT (a single long-lived process) we generate a value once and keep it in BOTH
 * `globalThis` and `process.env`. Both are process-global, so every route module instance Next
 * compiles in dev reads the SAME secret — without this, a cookie signed by one route fails to
 * verify in another.
 */
function ensure(name: string, gen: () => string): string {
  const existing = process.env[name];
  if (existing && existing.trim()) return existing.trim();
  const g = globalThis as unknown as { __sentinelSecrets?: Record<string, string> };
  g.__sentinelSecrets ??= {};
  g.__sentinelSecrets[name] ??= gen();
  process.env[name] = g.__sentinelSecrets[name];
  return g.__sentinelSecrets[name];
}

/** 64 hex chars → the adapter's previewSecret() parses it as 32 bytes. */
export function ensurePreviewSecret(): string {
  return ensure('PREVIEW_SIGNING_SECRET', () => randomBytes(32).toString('hex'));
}
export function previewSecretBuf(): Buffer {
  return Buffer.from(ensurePreviewSecret(), 'hex');
}
export function ensureCookieSecret(): string {
  return ensure('COOKIE_SECRET', () => randomUUID() + randomUUID());
}

// Populate process.env at import so every module instance in this process agrees.
ensurePreviewSecret();
ensureCookieSecret();
