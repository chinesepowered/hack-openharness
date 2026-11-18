import { newId, putUser } from '@/lib/server/db';
import { publicUser, sessionCookieHeader } from '@/lib/server/auth';
import { fail, json, sameOrigin } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Demo sign-in: a fresh account that can run tasks on public repositories (no GitHub token). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Cross-site request refused.');
  const user = { id: newId('u'), mode: 'demo' as const, login: 'demo-dev', name: 'Demo Developer', avatarUrl: '', createdAt: Date.now() };
  putUser(user);
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookieHeader(req, user.id) });
}
