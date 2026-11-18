import { newId, putGroup } from '@/lib/server/db';
import { fail, json, readJson, requireUser } from '@/lib/server/http';
import { checkCapacity, cleanPrompt, InputError, resolveHarness, resolveRepoFor, startSession } from '@/lib/server/sessions';
import { publicGroup } from '@/lib/server/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Head-to-head: the same task on 2–4 harnesses at once. Each run is its own HarnessRouter task on
 * its own harness; the group only links them in OpenHarness.
 */
export async function POST(req: Request) {
  const a = requireUser(req, { mutating: true });
  if ('response' in a) return a.response;
  const body = await readJson<{ repo?: string; branch?: string; prompt?: string; runs?: Array<{ harness?: string; model?: string }> }>(req);
  if (!body) return fail(400, 'Send JSON.');
  try {
    const prompt = cleanPrompt(body.prompt);
    const runs = Array.isArray(body.runs) ? body.runs.slice(0, 5) : [];
    if (runs.length < 2 || runs.length > 4) throw new InputError('Pick 2 to 4 harnesses to compare.');
    const resolved = await Promise.all(runs.map((r) => resolveHarness(r?.harness, r?.model)));
    const keys = resolved.map((r) => `${r.key}:${r.model}`);
    if (new Set(keys).size !== keys.length) throw new InputError('Each run needs a different harness or model.');
    const repo = await resolveRepoFor(a.user, body.repo, body.branch);
    checkCapacity(a.user, resolved.length);
    const groupId = newId('g');
    const sessions = resolved.map((h) => startSession(a.user, repo, h, prompt, groupId));
    const gr = { id: groupId, userId: a.user.id, prompt, repo, sessionIds: sessions.map((s) => s.id), createdAt: Date.now() };
    putGroup(gr);
    return json({ group: publicGroup(gr) }, 201);
  } catch (e) {
    if (e instanceof InputError) return fail(e.status, e.message);
    return fail(500, 'Could not start the comparison.');
  }
}
