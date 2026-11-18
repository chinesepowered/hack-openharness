'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Ban, CircleCheck, CircleX, Clock, Coins, ExternalLink, GitBranch, LoaderCircle, Swords, Timer, TriangleAlert, Trophy } from 'lucide-react';
import { useApp } from './AppShell';
import { DiffStatsLabel, DiffView } from './DiffView';
import { isLive, useElapsed } from './TurnView';
import { HarnessBadge } from '@/components/HarnessBadge';
import { api } from '@/lib/client/api';
import { fmtCost, fmtDuration } from '@/lib/client/format';
import { HARNESS_META } from '@/lib/shared/harness-meta';
import type { PublicGroup, PublicSession, ToolStep } from '@/lib/shared/types';

function StatusLine({ s }: { s: PublicSession }) {
  const t = s.turns[0];
  const elapsed = useElapsed(t);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
      {isLive(t) ? <span className="inline-flex items-center gap-1.5 text-brand2"><LoaderCircle className="size-3.5 animate-spin" /><span className="shimmer-text">Working</span></span>
        : t.status === 'completed' ? <span className="inline-flex items-center gap-1 text-ok"><CircleCheck className="size-3.5" /> Done</span>
        : t.status === 'cancelled' ? <span className="inline-flex items-center gap-1 text-dim"><Ban className="size-3.5" /> Cancelled</span>
        : t.status === 'incomplete' ? <span className="inline-flex items-center gap-1 text-warn"><TriangleAlert className="size-3.5" /> Stopped</span>
        : <span className="inline-flex items-center gap-1 text-bad"><CircleX className="size-3.5" /> Failed</span>}
      <span className="inline-flex items-center gap-1 text-dim"><Clock className="size-3" />{fmtDuration(elapsed)}</span>
      {t.costUsd !== undefined && <span className="inline-flex items-center gap-1 text-dim"><Coins className="size-3" />{fmtCost(t.costUsd)}</span>}
    </div>
  );
}

export function CompareView({ id }: { id: string }) {
  const { refreshSessions } = useApp();
  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [missing, setMissing] = useState(false);
  const [diffFor, setDiffFor] = useState<string | null>(null);

  const running = group?.sessions.some((s) => isLive(s.turns[0])) ?? true;
  useEffect(() => {
    let stop = false;
    const load = () => api<{ group: PublicGroup }>(`/api/compare/${id}`).then((r) => { if (!stop) setGroup(r.group); }).catch((e) => { if ((e as { status?: number }).status === 404) setMissing(true); });
    load();
    if (!running) return () => { stop = true; };
    const t = setInterval(load, 2000);
    return () => { stop = true; clearInterval(t); };
  }, [id, running]);
  useEffect(() => { if (!running) refreshSessions(); }, [running, refreshSessions]);

  const awards = useMemo(() => {
    const done = (group?.sessions || []).filter((s) => s.turns[0]?.status === 'completed');
    if (done.length < 2) return {} as Record<string, string[]>;
    const out: Record<string, string[]> = {};
    const add = (sid: string, a: string) => { (out[sid] ||= []).push(a); };
    const fastest = done.reduce((a, b) => ((a.turns[0].elapsedSec ?? 1e9) <= (b.turns[0].elapsedSec ?? 1e9) ? a : b));
    add(fastest.id, 'Fastest');
    const priced = done.filter((s) => s.turns[0].costUsd !== undefined);
    if (priced.length >= 2) add(priced.reduce((a, b) => (a.turns[0].costUsd! <= b.turns[0].costUsd! ? a : b)).id, 'Cheapest');
    return out;
  }, [group]);

  useEffect(() => {
    if (!diffFor && group) {
      const first = group.sessions.find((s) => s.turns[0]?.patch?.trim());
      if (first) setDiffFor(first.id);
    }
  }, [group, diffFor]);

  if (missing) return <div className="grid h-full place-items-center text-sm text-mute">Race not found.</div>;
  if (!group) return <div className="grid h-full place-items-center"><LoaderCircle className="size-5 animate-spin text-dim" /></div>;
  const cols = group.sessions.length;
  const diffSession = group.sessions.find((s) => s.id === diffFor);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-8 py-8">
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-xl border border-brand/40 bg-brand/10"><Swords className="size-4.5 text-brand" /></span>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Harness race · {cols} harnesses</div>
            <h1 className="mt-0.5 text-[19px] font-medium leading-snug">{group.prompt}</h1>
            <div className="mt-1 flex items-center gap-3 text-[12px] text-mute">
              <a href={group.repo.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text">{group.repo.fullName} <ExternalLink className="size-3" /></a>
              <span className="inline-flex items-center gap-1"><GitBranch className="size-3" />{group.repo.branch}</span>
            </div>
          </div>
        </div>

        <div className={`mt-6 grid gap-4 ${cols === 2 ? 'md:grid-cols-2' : cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
          {group.sessions.map((s) => {
            const t = s.turns[0];
            const meta = HARNESS_META[s.harness];
            const tools = t.steps.filter((x): x is ToolStep => x.kind === 'tool');
            const win = awards[s.id] || [];
            return (
              <div key={s.id} data-testid="race-card" className="flex min-h-[340px] flex-col overflow-hidden rounded-2xl border border-line bg-panel" style={{ boxShadow: `inset 0 3px 0 0 ${meta.color}` }}>
                <div className="flex items-center gap-3 px-4 pb-3 pt-4">
                  <HarnessBadge harness={s.harness} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{meta.label}</div>
                    <div className="truncate font-mono text-[11.5px] text-mute">{t.model}</div>
                  </div>
                </div>
                <div className="px-4"><StatusLine s={s} /></div>
                {win.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-4 pt-2">
                    {win.map((w) => <span key={w} className="inline-flex items-center gap-1 rounded-md border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[11px] text-warn">{w === 'Fastest' ? <Timer className="size-3" /> : <Trophy className="size-3" />}{w}</span>)}
                  </div>
                )}
                <div className="mt-3 flex-1 border-t border-line px-2 py-2">
                  {isLive(t) ? (
                    <div className="space-y-0.5">
                      {tools.length === 0 && <div className="px-2 py-1 text-[12px] text-dim"><span className="shimmer-text">Starting sandbox…</span></div>}
                      {tools.slice(-7).map((x) => (
                        <div key={x.key} className="rise flex items-center gap-2 px-2 py-[3px]">
                          {x.done ? <span className="size-1.5 shrink-0 rounded-full bg-dim" /> : <LoaderCircle className="size-3 shrink-0 animate-spin text-brand2" />}
                          <span className="w-[40px] shrink-0 text-[11.5px] text-mute">{x.name}</span>
                          <span className="truncate font-mono text-[11.5px] text-[#c6ccd8]">{x.detail}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2.5 px-2 py-1">
                      <div className="text-[14px] font-medium leading-snug">{t.manifest?.title || (t.status === 'completed' ? 'Finished' : t.note || 'Stopped')}</div>
                      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                        {t.manifest?.tests && <span className={`rounded-md border px-1.5 py-0.5 ${t.manifest.tests === 'passed' ? 'border-ok/30 bg-ok/10 text-ok' : t.manifest.tests === 'failed' ? 'border-bad/30 bg-bad/10 text-bad' : 'border-line2 text-mute'}`}>tests {t.manifest.tests.replace('_', ' ')}</span>}
                        {t.patch?.trim() ? <DiffStatsLabel patch={t.patch} /> : <span className="text-dim">no diff</span>}
                        <span className="text-dim">{tools.length} steps</span>
                      </div>
                      {t.manifest?.summary && <p className="line-clamp-4 text-[12.5px] leading-relaxed text-mute">{t.manifest.summary}</p>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
                  {t.patch?.trim() && <button type="button" onClick={() => setDiffFor(s.id)} className={`rounded-md px-2 py-1 text-[12px] transition ${diffFor === s.id ? 'bg-raised text-text' : 'text-mute hover:text-text'}`}>View diff</button>}
                  <Link href={`/app/s/${s.id}`} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-mute transition hover:bg-raised hover:text-text">Continue <ArrowRight className="size-3.5" /></Link>
                </div>
              </div>
            );
          })}
        </div>

        {diffSession?.turns[0]?.patch && (
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2 text-[13px]">
              <HarnessBadge harness={diffSession.harness} size={22} />
              <span className="font-medium">{HARNESS_META[diffSession.harness].label}</span><span className="text-dim">diff</span>
            </div>
            <DiffView patch={diffSession.turns[0].patch} />
          </div>
        )}
      </div>
    </div>
  );
}
