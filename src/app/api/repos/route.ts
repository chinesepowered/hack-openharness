import { putUser } from '@/lib/server/db';
import { listRepos, REPO_NAME_RE } from '@/lib/server/github';
import { fail, json, readJson, requireUser } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const a = requireUser(req);
  if ('response' in a) return a.response;
  try {
    return json({ repos: await listRepos(a.user), mode: a.user.mode });
  } catch {
    return fail(502, 'Could not load your repositories from GitHub.');
  }
}

/** Demo accounts can add any public repository by name ("owner/repo"). */
export async function POST(req: Request) {
  const a = requireUser(req, { mutating: true });
  if ('response' in a) return a.response;
  const body = await readJson<{ fullName?: string; branch?: string }>(req);
  let name = String(body?.fullName || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!REPO_NAME_RE.test(name)) return fail(400, 'Use the form owner/repo.');
  if (a.user.mode === 'github') return fail(400, 'Your GitHub repositories are listed automatically.');
  const branch = String(body?.branch || '').trim() || 'main';
  const custom = (a.user.customRepos || []).filter((r) => r.fullName.toLowerCase() !== name.toLowerCase());
  name = name.slice(0, 140);
  a.user.customRepos = [{ fullName: name, description: 'Public repository', private: false, defaultBranch: branch, htmlUrl: `https://github.com/${name}` }, ...custom].slice(0, 20);
  putUser(a.user);
  return json({ repos: await listRepos(a.user) });
}
