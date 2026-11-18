'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Plus, Swords } from 'lucide-react';
import { Logo } from '@/components/icons';
import { HarnessBadge } from '@/components/HarnessBadge';
import { api } from '@/lib/client/api';
import { timeAgo } from '@/lib/client/format';
import type { CatalogHarness, PublicUser, RepoOption, SessionSummary, TurnStatus } from '@/lib/shared/types';

interface AppData {
  user: PublicUser;
  catalog: CatalogHarness[];
  repos: RepoOption[];
  sessions: SessionSummary[];
  refreshSessions: () => void;
  addRepo: (fullName: string, branch?: string) => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);
export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppShell');
  return v;
}

export function StatusDot({ status, className = '' }: { status: TurnStatus; className?: string }) {
  const c = status === 'running' || status === 'starting' ? 'bg-brand2 pulse-dot' : status === 'completed' ? 'bg-ok' : status === 'failed' ? 'bg-bad' : status === 'incomplete' ? 'bg-warn' : 'bg-dim';
  return <span className={`inline-block size-2 shrink-0 rounded-full ${c} ${className}`} />;
}

export function AppShell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogHarness[]>([]);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  const refreshSessions = useCallback(() => {
    api<{ sessions: SessionSummary[] }>('/api/sessions').then((r) => setSessions(r.sessions)).catch(() => {});
  }, []);

  useEffect(() => {
    api<{ harnesses: CatalogHarness[] }>('/api/catalog').then((r) => setCatalog(r.harnesses)).catch(() => {});
    api<{ repos: RepoOption[] }>('/api/repos').then((r) => setRepos(r.repos)).catch(() => {});
    refreshSessions();
  }, [refreshSessions]);

  // Keep the sidebar fresh while anything runs.
  const anyRunning = sessions.some((s) => s.status === 'running' || s.status === 'starting');
  useEffect(() => {
    const t = setInterval(refreshSessions, anyRunning ? 3000 : 15000);
    return () => clearInterval(t);
  }, [anyRunning, refreshSessions]);

  const addRepo = useCallback(async (fullName: string, branch?: string) => {
    const r = await api<{ repos: RepoOption[] }>('/api/repos', { body: { fullName, branch } });
    setRepos(r.repos);
  }, []);

  const value = useMemo(() => ({ user, catalog, repos, sessions, refreshSessions, addRepo }), [user, catalog, repos, sessions, refreshSessions, addRepo]);

  // Group races into one sidebar entry.
  const items = useMemo(() => {
    const out: Array<{ kind: 'session'; s: SessionSummary } | { kind: 'group'; id: string; list: SessionSummary[] }> = [];
    const seen = new Set<string>();
    for (const s of sessions) {
      if (s.groupId) {
        if (seen.has(s.groupId)) continue;
        seen.add(s.groupId);
        out.push({ kind: 'group', id: s.groupId, list: sessions.filter((x) => x.groupId === s.groupId) });
      } else out.push({ kind: 'session', s });
    }
    return out;
  }, [sessions]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  return (
    <Ctx.Provider value={value}>
      <div className="flex h-dvh overflow-hidden">
        <aside className="flex w-[272px] shrink-0 flex-col border-r border-line bg-panel">
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <Link href="/app"><Logo size={26} /></Link>
          </div>
          <div className="px-3 pb-3">
            <Link href="/app" className={`flex items-center gap-2 rounded-lg border border-line2 px-3 py-2 text-sm transition hover:bg-raised ${pathname === '/app' ? 'bg-raised' : 'bg-panel2'}`}>
              <Plus className="size-4 text-brand" /> New session
            </Link>
          </div>
          <div className="px-4 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Sessions</div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {items.length === 0 && <p className="px-3 py-2 text-xs text-dim">No sessions yet. Start one.</p>}
            {items.map((it) => {
              if (it.kind === 'group') {
                const href = `/app/compare/${it.id}`;
                const active = pathname === href;
                const st: TurnStatus = it.list.some((x) => x.status === 'running' || x.status === 'starting') ? 'running' : it.list.every((x) => x.status === 'completed') ? 'completed' : it.list[0].status;
                return (
                  <Link key={it.id} href={href} className={`group mb-0.5 flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition ${active ? 'bg-raised' : 'hover:bg-panel2'}`}>
                    <div className="mt-0.5 flex -space-x-1.5">
                      {it.list.slice(0, 3).map((x) => <HarnessBadge key={x.id} harness={x.harness} size={20} className="ring-2 ring-panel" />)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-[13px]"><Swords className="size-3 shrink-0 text-brand" /> <span className="truncate">{it.list[0].title}</span></div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-dim"><StatusDot status={st} /> race · {it.list.length} harnesses · {timeAgo(it.list[0].updatedAt)}</div>
                    </div>
                  </Link>
                );
              }
              const s = it.s;
              const href = `/app/s/${s.id}`;
              const active = pathname === href;
              return (
                <Link key={s.id} href={href} className={`mb-0.5 flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition ${active ? 'bg-raised' : 'hover:bg-panel2'}`}>
                  <HarnessBadge harness={s.harness} size={22} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{s.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-dim"><StatusDot status={s.status} /> <span className="truncate">{s.repo}</span> · {timeAgo(s.updatedAt)}</div>
                  </div>
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2.5 border-t border-line px-3 py-3">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="size-8 rounded-full" />
            ) : (
              <span className="brand-bg grid size-8 place-items-center rounded-full text-xs font-semibold text-black">{user.name.slice(0, 1)}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{user.name}</div>
              <div className="truncate text-[11px] text-dim">{user.mode === 'demo' ? 'Demo account · public repos' : `@${user.login}`}</div>
            </div>
            <button onClick={signOut} title="Sign out" className="rounded-md p-1.5 text-dim transition hover:bg-raised hover:text-text"><LogOut className="size-4" /></button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
