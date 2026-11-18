'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, Gauge, LoaderCircle, OctagonAlert, Wallet } from 'lucide-react';
import { StatusDot } from './AppShell';
import { HarnessBadge } from '@/components/HarnessBadge';
import { api } from '@/lib/client/api';
import { fmtCost, fmtDuration, timeAgo } from '@/lib/client/format';
import { HARNESS_META } from '@/lib/shared/harness-meta';
import type { PublicUsage, UsageRow } from '@/lib/shared/types';

const money = (v: number) => (v >= 100 ? `$${v.toFixed(0)}` : v >= 0.01 || v === 0 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="text-[12px] text-mute">{label}</div>
      <div className="mt-1 text-[26px] font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-dim">{sub}</div>}
    </div>
  );
}

function BudgetCard({ usage, onSave }: { usage: PublicUsage; onSave: (v: number | null) => Promise<void> }) {
  const [value, setValue] = useState(usage.budgetUsd != null ? String(usage.budgetUsd) : '');
  const [busy, setBusy] = useState(false);
  const budget = usage.budgetUsd;
  const pct = budget ? usage.spendUsd / budget : 0;
  // the fill carries severity; status colors always come with an icon and a label
  const state = !budget ? null : pct >= 1 ? 'critical' : pct >= 0.8 ? 'warning' : 'ok';
  const color = state === 'critical' ? 'var(--color-bad)' : state === 'warning' ? 'var(--color-warn)' : 'var(--color-brand)';
  const Icon = state === 'critical' ? OctagonAlert : state === 'warning' ? CircleAlert : Gauge;
  const label = state === 'critical' ? 'Budget reached: new tasks are paused' : state === 'warning' ? 'Nearing the monthly budget' : 'On track';

  async function save(v: number | null) {
    setBusy(true);
    try { await onSave(v); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Wallet className="size-4 text-mute" />
        <div className="text-[14px] font-medium">Monthly budget</div>
        {state && (
          <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color }}>
            <Icon className="size-3.5" /> {label}
          </span>
        )}
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); const n = Number(value); if (value.trim() && Number.isFinite(n)) void save(n); }}
        >
          <div className="flex h-8 items-center rounded-lg border border-line2 bg-panel2 px-2.5 focus-within:border-dim">
            <span className="text-[13px] text-dim">$</span>
            <input data-testid="budget-input" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Set a cap" className="w-[84px] bg-transparent pl-1 font-mono text-[13px] outline-none placeholder:text-dim" />
          </div>
          <button data-testid="budget-save" disabled={busy} className="h-8 rounded-lg bg-white px-3 text-[12.5px] font-medium text-black transition hover:bg-white/90 disabled:opacity-50">
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : budget != null ? 'Update' : 'Set budget'}
          </button>
          {budget != null && <button type="button" onClick={() => { setValue(''); void save(null); }} className="text-[12px] text-dim hover:text-text">Remove</button>}
        </form>
      </div>
      {budget != null ? (
        <>
          <div className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${color} 16%, var(--color-panel2))` }} role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={usage.spendUsd} aria-label="Monthly budget used">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, pct * 100)}%`, background: color }} />
          </div>
          <div className="mt-2 flex justify-between text-[12px]">
            <span className="text-text"><span className="font-medium">{money(usage.spendUsd)}</span> <span className="text-mute">of {money(budget)} used this month</span></span>
            <span className="text-mute">{Math.round(pct * 100)}%</span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[12.5px] text-dim">Set a monthly cap and OpenHarness stops starting new tasks once your metered spend reaches it.</p>
      )}
    </div>
  );
}

function CostBars({ rows }: { rows: UsageRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0.0001, ...rows.map((r) => r.totalUsd));
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-[14px] font-medium">Cost by harness × model</div>
      <div className="mb-3 text-[12px] text-dim">Metered spend this month. One bar per harness and model you ran.</div>
      {rows.length === 0 && <p className="py-6 text-center text-[12.5px] text-dim">No tasks this month yet.</p>}
      <div className="space-y-1">
        {rows.map((r, i) => {
          const avgSec = r.timedTasks ? r.totalSec / r.timedTasks : undefined;
          const w = Math.max(0.6, (r.totalUsd / max) * 100);
          return (
            <div key={`${r.harness}-${r.model}`} data-testid="usage-row" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={`relative grid grid-cols-[230px_1fr_150px] items-center gap-3 rounded-lg px-2 py-2 transition ${hover === i ? 'bg-panel2' : ''}`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <HarnessBadge harness={r.harness} size={24} />
                <div className="min-w-0">
                  <div className="truncate text-[13px]">{HARNESS_META[r.harness].label}</div>
                  <div className="truncate font-mono text-[11px] text-dim">{r.model}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-3 rounded-r-[4px]" style={{ width: `${w}%`, background: 'var(--color-brand)', opacity: hover === null || hover === i ? 1 : 0.55 }} />
                <span className="shrink-0 text-[12.5px] font-medium text-text">{money(r.totalUsd)}</span>
              </div>
              <div className="text-right text-[11.5px] text-mute">
                {r.tasks} task{r.tasks === 1 ? '' : 's'} · {fmtDuration(avgSec)} avg
                <div className="text-dim">{r.testsKnown ? `tests ${r.testsPassed}/${r.testsKnown} passed` : 'no test result'}</div>
              </div>
              {hover === i && (
                <div className="pointer-events-none absolute left-[240px] top-full z-20 mt-1 rounded-lg border border-line2 bg-raised px-3 py-2 text-[12px] shadow-xl shadow-black/50">
                  <div className="font-medium">{HARNESS_META[r.harness].label} · <span className="font-mono">{r.model}</span></div>
                  <div className="mt-1 text-mute">{money(r.totalUsd)} total · {money(r.totalUsd / Math.max(1, r.tasks))} per task · {r.completed}/{r.tasks} completed</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UsageView() {
  const [usage, setUsage] = useState<PublicUsage | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<{ usage: PublicUsage }>('/api/usage').then((r) => setUsage(r.usage)).catch((e) => setError((e as Error).message)); }, []);

  const spread = useMemo(() => {
    const per = (usage?.byCombo || []).filter((r) => r.completed && r.totalUsd > 0).map((r) => r.totalUsd / r.tasks);
    if (per.length < 2) return null;
    return Math.max(...per) / Math.min(...per);
  }, [usage]);

  async function saveBudget(v: number | null) {
    const r = await api<{ usage: PublicUsage }>('/api/usage/budget', { body: { monthlyUsd: v } });
    setUsage(r.usage);
  }

  if (error) return <div className="grid h-full place-items-center text-sm text-bad">{error}</div>;
  if (!usage) return <div className="grid h-full place-items-center"><LoaderCircle className="size-5 animate-spin text-dim" /></div>;
  const month = new Date(usage.monthStart).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] px-8 pb-16 pt-10">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Usage</h1>
        <p className="mt-1 text-[14px] text-mute">{month}. Every task is metered by HarnessRouter, so this is exactly what each agent cost you.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Spend this month" value={money(usage.spendUsd)} sub={`${usage.tasks} task${usage.tasks === 1 ? '' : 's'}`} />
          <Tile label="Average per task" value={usage.tasks ? money(usage.spendUsd / usage.tasks) : '–'} />
          <Tile label="Harness × model combos" value={String(usage.combos)} sub={`${usage.harnesses} harness${usage.harnesses === 1 ? '' : 'es'}`} />
          <Tile label="Cost spread per task" value={spread ? `${spread >= 10 ? Math.round(spread) : spread.toFixed(1)}×` : '–'} sub="priciest vs cheapest combo" />
        </div>

        <div className="mt-3"><BudgetCard usage={usage} onSave={saveBudget} /></div>
        <div className="mt-3"><CostBars rows={usage.byCombo} /></div>

        <div className="mt-3 rounded-xl border border-line bg-panel p-4">
          <div className="mb-2 text-[14px] font-medium">Recent tasks</div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-dim">
                <th className="pb-2 font-medium">Task</th><th className="pb-2 font-medium">Harness · model</th><th className="pb-2 font-medium">Status</th><th className="pb-2 text-right font-medium">Time</th><th className="pb-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.recent.map((t, i) => (
                <tr key={`${t.sessionId}-${i}`} className="border-t border-line">
                  <td className="max-w-[340px] truncate py-2 pr-3"><Link href={t.groupId ? `/app/compare/${t.groupId}` : `/app/s/${t.sessionId}`} className="hover:underline">{t.title}</Link><div className="text-[11px] text-dim">{timeAgo(t.startedAt)}</div></td>
                  <td className="py-2 pr-3"><span className="inline-flex items-center gap-2"><HarnessBadge harness={t.harness} size={18} />{HARNESS_META[t.harness].label} <span className="font-mono text-[11px] text-dim">{t.model}</span></span></td>
                  <td className="py-2 pr-3"><span className="inline-flex items-center gap-1.5 text-mute"><StatusDot status={t.status} />{t.status}</span></td>
                  <td className="py-2 text-right text-mute">{fmtDuration(t.elapsedSec)}</td>
                  <td className="py-2 text-right font-medium">{t.costUsd !== undefined ? fmtCost(t.costUsd) : '–'}</td>
                </tr>
              ))}
              {usage.recent.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-dim">No tasks this month yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
