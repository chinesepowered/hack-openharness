import { getGroup } from '@/lib/server/db';
import { fail, json, requireUser } from '@/lib/server/http';
import { recoverOnce } from '@/lib/server/runner';
import { publicGroup } from '@/lib/server/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  recoverOnce();
  const a = requireUser(req);
  if ('response' in a) return a.response;
  const { id } = await ctx.params;
  const gr = getGroup(id);
  if (!gr || gr.userId !== a.user.id) return fail(404, 'Comparison not found.');
  return json({ group: publicGroup(gr) });
}
