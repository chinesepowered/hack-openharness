import { fail, json, readJson, requireUser } from '@/lib/server/http';
import { followUp, InputError } from '@/lib/server/sessions';
import { publicSession } from '@/lib/server/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Follow-up on the same result: continues the HarnessRouter session with previous_response_id. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = requireUser(req, { mutating: true });
  if ('response' in a) return a.response;
  const { id } = await ctx.params;
  const body = await readJson<{ prompt?: string; model?: string }>(req);
  if (!body) return fail(400, 'Send JSON.');
  try {
    const s = await followUp(a.user, id, body.prompt, body.model);
    return json({ session: publicSession(s) });
  } catch (e) {
    if (e instanceof InputError) return fail(e.status, e.message);
    return fail(500, 'Could not send the message.');
  }
}
