import { listSessions } from '@/lib/server/db';
import { fail, json, readJson, requireUser } from '@/lib/server/http';
import { recoverOnce } from '@/lib/server/runner';
import { checkBudget, checkCapacity, cleanPrompt, InputError, resolveHarness, resolveRepoFor, startSession } from '@/lib/server/sessions';
import { publicSession, sessionSummary } from '@/lib/server/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  recoverOnce();
  const a = requireUser(req);
  if ('response' in a) return a.response;
  return json({ sessions: listSessions(a.user.id).map(sessionSummary) });
}

/** New session = one new HarnessRouter task: { repo, branch?, harness, model?, prompt } */
export async function POST(req: Request) {
  recoverOnce();
  const a = requireUser(req, { mutating: true });
  if ('response' in a) return a.response;
  const body = await readJson<{ repo?: string; branch?: string; harness?: string; model?: string; prompt?: string }>(req);
  if (!body) return fail(400, 'Send JSON.');
  try {
    const prompt = cleanPrompt(body.prompt);
    const h = await resolveHarness(body.harness, body.model);
    const repo = await resolveRepoFor(a.user, body.repo, body.branch);
    checkCapacity(a.user);
    checkBudget(a.user);
    const s = startSession(a.user, repo, h, prompt);
    return json({ session: publicSession(s) }, 201);
  } catch (e) {
    if (e instanceof InputError) return fail(e.status, e.message);
    return fail(500, 'Could not start the session.');
  }
}
