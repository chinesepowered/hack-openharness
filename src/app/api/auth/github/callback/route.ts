import { timingSafeEqual } from 'node:crypto';
import { findUserByGithubId, newId, putUser } from '@/lib/server/db';
import { githubOAuthConfigured, readStateCookie, sessionCookieHeader } from '@/lib/server/auth';
import { exchangeCode, fetchGithubUser } from '@/lib/server/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const base = (process.env.APP_URL?.trim() || new URL(req.url).origin).replace(/\/+$/, '');
  const url = new URL(req.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const expected = readStateCookie(req) || '';
  const ok = state.length > 0 && state.length === expected.length && timingSafeEqual(Buffer.from(state), Buffer.from(expected));
  if (!githubOAuthConfigured() || !code || !ok) return Response.redirect(`${base}/?signin=failed`, 302);
  try {
    const token = await exchangeCode(code, `${base}/api/auth/github/callback`);
    const gh = await fetchGithubUser(token);
    const existing = findUserByGithubId(gh.id);
    const user = {
      id: existing?.id || newId('u'), mode: 'github' as const, githubId: gh.id, login: gh.login,
      name: gh.name || gh.login, avatarUrl: gh.avatar_url, githubToken: token, createdAt: existing?.createdAt || Date.now(),
    };
    putUser(user);
    const headers = new Headers({ Location: `${base}/app` });
    headers.append('Set-Cookie', sessionCookieHeader(req, user.id));
    headers.append('Set-Cookie', 'oh_oauth_state=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0');
    return new Response(null, { status: 302, headers });
  } catch {
    return Response.redirect(`${base}/?signin=failed`, 302);
  }
}
