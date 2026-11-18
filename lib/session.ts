import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { ensureCookieSecret } from './secrets';

/**
 * The product's identity for the signed-in person. There is no external auth in this demo, so each
 * browser gets a stable, signed, httpOnly id cookie. That id is:
 *   - sent to HarnessRouter as `user` on every task (so per-person memory stays separated), and
 *   - the owner of every task record (checked on every route).
 * It is set by the SERVER, never read from anything the person typed, which is exactly what `user` requires.
 */

const COOKIE = 'hr_uid';
const ONE_YEAR = 60 * 60 * 24 * 365;

function secret(): string {
  return ensureCookieSecret();
}

function sign(id: string): string {
  return createHmac('sha256', secret()).update(id).digest('base64url');
}
function pack(id: string): string {
  return `${id}.${sign(id)}`;
}
function unpack(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf('.');
  if (i <= 0) return null;
  const id = value.slice(0, i);
  const sig = value.slice(i + 1);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const want = Buffer.from(sign(id));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

/** The current user's id, or null when there is no valid cookie. For ownership checks. */
export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  return unpack(jar.get(COOKIE)?.value);
}

/** The current user's id, creating and setting the cookie when absent. Use on the start route. */
export async function ensureUserId(): Promise<string> {
  const jar = await cookies();
  const existing = unpack(jar.get(COOKIE)?.value);
  if (existing) return existing;
  const id = randomUUID();
  jar.set(COOKIE, pack(id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR,
  });
  return id;
}
