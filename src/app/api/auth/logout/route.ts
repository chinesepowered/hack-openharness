import { clearSessionCookieHeader } from '@/lib/server/auth';
import { fail, json, sameOrigin } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'Cross-site request refused.');
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader(req) });
}
