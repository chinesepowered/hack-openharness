import 'server-only';
import { userFromRequest } from './auth';
import type { UserRec } from './db';

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Plain-language error for the browser. Never pass upstream messages through here. */
export function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

/**
 * Mutating routes accept only same-origin browser requests (CSRF) with a JSON body.
 * Browsers always send Origin on cross-origin POSTs; non-browser clients carry no cookies.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try { return new URL(origin).host === host; } catch { return false; }
}

export type Authed = { user: UserRec } | { response: Response };

export function requireUser(req: Request, opts: { mutating?: boolean } = {}): Authed {
  if (opts.mutating && !sameOrigin(req)) return { response: fail(403, 'Cross-site request refused.') };
  const user = userFromRequest(req);
  if (!user) return { response: fail(401, 'Please sign in.') };
  return { user };
}

export async function readJson<T>(req: Request, maxBytes = 64 * 1024): Promise<T | null> {
  const type = req.headers.get('content-type') || '';
  if (!type.includes('application/json')) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}
