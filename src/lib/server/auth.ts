import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getUser, localSecret, type UserRec } from './db';
import type { PublicUser } from '@/lib/shared/types';

export const SESSION_COOKIE = 'oh_session';
export const STATE_COOKIE = 'oh_oauth_state';
const TTL_SECONDS = 14 * 24 * 3600;

function secret(): Buffer {
  const v = process.env.SESSION_SECRET?.trim();
  if (v) return /^[0-9a-f]{64,}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'utf8');
  return localSecret();
}
const mac = (msg: string) => createHmac('sha256', secret()).update(msg).digest('base64url');

/** "<userId>.<expiresAt>.<hmac>" */
export function signSession(userId: string, now = Date.now()): string {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(userId)) throw new Error('bad user id');
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return `${userId}.${exp}.${mac(`${userId}.${exp}`)}`;
}

export function verifySession(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const m = /^([A-Za-z0-9_]{1,64})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return null;
  const [, uid, exp, sig] = m;
  if (Number(exp) * 1000 < now) return null;
  const want = Buffer.from(mac(`${uid}.${exp}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? uid : null;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** The signed-in user for a route handler request, or null. */
export function userFromRequest(req: Request): UserRec | null {
  const uid = verifySession(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
  return uid ? getUser(uid) ?? null : null;
}

/** The signed-in user for a server component, or null. */
export async function currentUser(): Promise<UserRec | null> {
  const c = await cookies();
  const uid = verifySession(c.get(SESSION_COOKIE)?.value);
  return uid ? getUser(uid) ?? null : null;
}

function secureFlag(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  return proto === 'https' ? '; Secure' : '';
}

export function sessionCookieHeader(req: Request, userId: string): string {
  return `${SESSION_COOKIE}=${signSession(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}${secureFlag(req)}`;
}
export function clearSessionCookieHeader(req: Request): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`;
}
export function stateCookieHeader(req: Request, state: string): string {
  return `${STATE_COOKIE}=${state}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag(req)}`;
}
export function readStateCookie(req: Request): string | undefined {
  return readCookie(req.headers.get('cookie'), STATE_COOKIE);
}
export const newState = () => randomBytes(18).toString('base64url');

export function githubOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim());
}

export function publicUser(u: UserRec): PublicUser {
  return { id: u.id, login: u.login, name: u.name, avatarUrl: u.avatarUrl, mode: u.mode };
}
