import { githubOAuthConfigured, publicUser, userFromRequest } from '@/lib/server/auth';
import { json } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = userFromRequest(req);
  return json({ user: user ? publicUser(user) : null, githubOAuth: githubOAuthConfigured() });
}
