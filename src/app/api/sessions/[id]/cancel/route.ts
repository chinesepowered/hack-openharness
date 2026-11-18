import { getSession } from '@/lib/server/db';
import { fail, json, requireUser } from '@/lib/server/http';
import { cancelLatest } from '@/lib/server/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = requireUser(req, { mutating: true });
  if ('response' in a) return a.response;
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s || s.userId !== a.user.id) return fail(404, 'Session not found.');
  const ok = await cancelLatest(s);
  return ok ? json({ ok: true }) : fail(409, 'Nothing is running.');
}
