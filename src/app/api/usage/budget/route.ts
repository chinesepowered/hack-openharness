import { putUser } from '@/lib/server/db';
import { fail, json, readJson, requireUser } from '@/lib/server/http';
import { usageFor } from '@/lib/server/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Set or clear the monthly budget: { monthlyUsd: number | null } */
export async function POST(req: Request) {
  const a = requireUser(req, { mutating: true });
  if ('response' in a) return a.response;
  const body = await readJson<{ monthlyUsd?: number | null }>(req);
  if (!body) return fail(400, 'Send JSON.');
  const v = body.monthlyUsd;
  if (v === null) a.user.budgetUsd = undefined;
  else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000) a.user.budgetUsd = Math.round(v * 100) / 100;
  else return fail(400, 'Enter a budget between $0 and $100,000.');
  putUser(a.user);
  return json({ usage: usageFor(a.user) });
}
