import { catalog } from '@/lib/server/catalog';
import { json, requireUser } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Harnesses and the models each can run (live from HarnessRouter). No harness ids. */
export async function GET(req: Request) {
  const a = requireUser(req);
  if ('response' in a) return a.response;
  return json({ harnesses: await catalog() });
}
