import { getSession } from '@/lib/server/db';
import { fail, requireUser } from '@/lib/server/http';
import { hr } from '@/lib/server/hr';
import { safeRelPath } from '@/lib/server/harnessrouter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Owner-checked download of one deliverable (out/<path>), fetched server-side with the key. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; path: string[] }> }) {
  const a = requireUser(req);
  if ('response' in a) return a.response;
  const { id, path } = await ctx.params;
  const s = getSession(id);
  if (!s || s.userId !== a.user.id || !s.hrSessionId) return fail(404, 'Not found.');
  const rel = safeRelPath((path || []).join('/'));
  if (!rel) return fail(404, 'Not found.');
  const turn = [...s.turns].reverse().find((t) => t.files?.some((f) => f.path === rel));
  const file = turn?.files?.find((f) => f.path === rel);
  if (!file) return fail(404, 'Not found.');
  try {
    const { bytes } = await hr().fetchFile(s.hrSessionId, file.fileId);
    const name = rel.split('/').pop()!.replace(/["\r\n\\]/g, '_');
    const ext = (name.split('.').pop() || '').toLowerCase();
    const type = ext === 'json' ? 'application/json' : ['md', 'patch', 'diff', 'txt'].includes(ext) ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `attachment; filename="${name}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return fail(502, 'Could not fetch that file.');
  }
}
