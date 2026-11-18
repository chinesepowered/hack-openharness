import 'server-only';
import type { UserRec, RepoRec } from './db';
import type { RepoOption } from '@/lib/shared/types';

const GH_API = 'https://api.github.com';
const UA = 'OpenHarness';

/** Public repositories offered to demo accounts (no GitHub sign-in needed; the agent clones them). */
export const DEMO_REPOS: RepoOption[] = [
  { fullName: 'developit/mitt', description: 'Tiny 200 byte functional event emitter / pubsub.', private: false, defaultBranch: 'main', language: 'TypeScript', htmlUrl: 'https://github.com/developit/mitt' },
  { fullName: 'lukeed/clsx', description: 'A tiny utility for constructing className strings conditionally.', private: false, defaultBranch: 'master', language: 'JavaScript', htmlUrl: 'https://github.com/lukeed/clsx' },
  { fullName: 'lukeed/dequal', description: 'A tiny utility to check for deep equality.', private: false, defaultBranch: 'master', language: 'JavaScript', htmlUrl: 'https://github.com/lukeed/dequal' },
  { fullName: 'sindresorhus/slugify', description: 'Slugify a string.', private: false, defaultBranch: 'main', language: 'JavaScript', htmlUrl: 'https://github.com/sindresorhus/slugify' },
  { fullName: 'ai/nanoid', description: 'A tiny, secure, URL-friendly, unique string ID generator for JavaScript.', private: false, defaultBranch: 'main', language: 'JavaScript', htmlUrl: 'https://github.com/ai/nanoid' },
  { fullName: 'tj/commander.js', description: 'Node.js command-line interfaces made easy.', private: false, defaultBranch: 'master', language: 'JavaScript', htmlUrl: 'https://github.com/tj/commander.js' },
];

export const REPO_NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
export const BRANCH_RE = /^(?!.*\.\.)(?!\/)[A-Za-z0-9._\/-]{1,200}(?<!\/)$/;

async function gh<T>(token: string, path: string): Promise<T> {
  const res = await fetch(GH_API + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  return (await res.json()) as T;
}

interface GhRepo {
  full_name: string; description: string | null; private: boolean; default_branch: string;
  language: string | null; stargazers_count: number; pushed_at: string; html_url: string; clone_url: string;
}
const toOption = (r: GhRepo): RepoOption => ({
  fullName: r.full_name, description: r.description || '', private: r.private, defaultBranch: r.default_branch,
  language: r.language || undefined, stars: r.stargazers_count, pushedAt: r.pushed_at, htmlUrl: r.html_url,
});

// ── OAuth ───────────────────────────────────────────────────────────────────────────────────────
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }),
  });
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error('oauth exchange failed');
  return j.access_token;
}

export function fetchGithubUser(token: string) {
  return gh<{ id: number; login: string; name: string | null; avatar_url: string }>(token, '/user');
}

// ── repos ───────────────────────────────────────────────────────────────────────────────────────
export async function listRepos(user: UserRec): Promise<RepoOption[]> {
  if (user.mode === 'github' && user.githubToken) {
    const repos = await gh<GhRepo[]>(user.githubToken, '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member');
    return repos.map(toOption);
  }
  const custom = user.customRepos || [];
  return [...custom, ...DEMO_REPOS.filter((d) => !custom.some((c) => c.fullName === d.fullName))];
}

/**
 * Resolve the repository a task may run on, checking the user can see it.
 * GitHub users: the API answers only for repos their token can read. Demo users: public repos only.
 */
export async function resolveRepo(user: UserRec, fullName: string, branch?: string): Promise<RepoRec | null> {
  if (!REPO_NAME_RE.test(fullName)) return null;
  if (branch && !BRANCH_RE.test(branch)) return null;
  if (user.mode === 'github' && user.githubToken) {
    try {
      const r = await gh<GhRepo>(user.githubToken, `/repos/${fullName}`);
      return { fullName: r.full_name, branch: branch || r.default_branch, private: r.private, htmlUrl: r.html_url, cloneUrl: r.clone_url };
    } catch { return null; }
  }
  const known = [...(user.customRepos || []), ...DEMO_REPOS].find((r) => r.fullName.toLowerCase() === fullName.toLowerCase());
  const name = known?.fullName || fullName;
  return {
    fullName: name, branch: branch || known?.defaultBranch || 'main', private: false,
    htmlUrl: `https://github.com/${name}`, cloneUrl: `https://github.com/${name}.git`,
  };
}

/** A private repo's tarball, fetched with the user's token on the server (the agent never sees it). */
export async function downloadTarball(token: string, fullName: string, branch: string, maxBytes = 80 * 1024 * 1024): Promise<Uint8Array> {
  const res = await fetch(`${GH_API}/repos/${fullName}/tarball/${encodeURIComponent(branch)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`tarball ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error('repository archive too large');
  return buf;
}
