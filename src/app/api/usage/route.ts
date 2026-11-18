import { json, requireUser } from '@/lib/server/http';
import { usageFor } from '@/lib/server/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in user's metered spend this month, by harness × model. Their own records only. */
export async function GET(req: Request) {
  const a = requireUser(req);
  if ('response' in a) return a.response;
  return json({ usage: usageFor(a.user) });
}
