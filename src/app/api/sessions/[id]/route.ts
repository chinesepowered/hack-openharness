import { getSession } from '@/lib/server/db';
import { fail, json, requireUser } from '@/lib/server/http';
import { recoverOnce } from '@/lib/server/runner';
import { publicSession } from '@/lib/server/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  recoverOnce();
  const a = requireUser(req);
  if ('response' in a) return a.response;
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s || s.userId !== a.user.id) return fail(404, 'Session not found.');
  return json({ session: publicSession(s) });
}
