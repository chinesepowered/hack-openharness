import { githubOAuthConfigured, newState, stateCookieHeader } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appUrl(req: Request): string {
  return (process.env.APP_URL?.trim() || new URL(req.url).origin).replace(/\/+$/, '');
}

/** Start GitHub OAuth. Scope `repo` lets the server read private repos to hand them to the agent. */
export async function GET(req: Request) {
  const base = appUrl(req);
  if (!githubOAuthConfigured()) return Response.redirect(`${base}/?signin=demo`, 302);
  const state = newState();
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID!.trim());
  u.searchParams.set('redirect_uri', `${base}/api/auth/github/callback`);
  u.searchParams.set('scope', 'repo read:user');
  u.searchParams.set('state', state);
  u.searchParams.set('allow_signup', 'true');
  return new Response(null, { status: 302, headers: { Location: u.toString(), 'Set-Cookie': stateCookieHeader(req, state) } });
}
