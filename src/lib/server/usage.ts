import 'server-only';
import { listSessions, type UserRec } from './db';
import type { PublicUsage, UsageRow } from '@/lib/shared/types';

/** Start of the current calendar month (UTC), in ms. */
export function monthStart(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** Real spend this month: the sum of each turn's metered HarnessRouter session spend. */
export function monthToDateSpend(userId: string, now = new Date()): number {
  const from = monthStart(now);
  let sum = 0;
  for (const s of listSessions(userId)) for (const t of s.turns) if (t.startedAt >= from && t.costUsd) sum += t.costUsd;
  return Math.round(sum * 10000) / 10000;
}

/** Spend analytics for one user, built only from their own records. */
export function usageFor(user: UserRec, now = new Date()): PublicUsage {
  const from = monthStart(now);
  const rows = new Map<string, UsageRow>();
  const recent: PublicUsage['recent'] = [];
  let spend = 0;
  let tasks = 0;
  for (const s of listSessions(user.id)) {
    for (const t of s.turns) {
      if (t.startedAt < from) continue;
      tasks += 1;
      spend += t.costUsd || 0;
      const key = `${s.harnessKey}|${t.model}`;
      const r = rows.get(key) ?? { harness: s.harnessKey, model: t.model, tasks: 0, completed: 0, totalUsd: 0, totalSec: 0, timedTasks: 0, testsPassed: 0, testsKnown: 0 };
      r.tasks += 1;
      if (t.status === 'completed') r.completed += 1;
      r.totalUsd += t.costUsd || 0;
      if (t.elapsedSec) { r.totalSec += t.elapsedSec; r.timedTasks += 1; }
      const tests = t.manifest?.tests;
      if (tests === 'passed' || tests === 'failed') { r.testsKnown += 1; if (tests === 'passed') r.testsPassed += 1; }
      rows.set(key, r);
      recent.push({
        sessionId: s.id, title: s.turns.indexOf(t) === 0 ? s.title : `${s.title} (follow-up)`, harness: s.harnessKey, model: t.model,
        status: t.status, costUsd: t.costUsd, elapsedSec: t.elapsedSec, startedAt: t.startedAt, groupId: s.groupId,
      });
    }
  }
  recent.sort((a, b) => b.startedAt - a.startedAt);
  const byCombo = [...rows.values()].map((r) => ({ ...r, totalUsd: Math.round(r.totalUsd * 10000) / 10000 })).sort((a, b) => b.totalUsd - a.totalUsd);
  return {
    monthStart: from,
    spendUsd: Math.round(spend * 10000) / 10000,
    tasks,
    combos: byCombo.length,
    harnesses: new Set(byCombo.map((r) => r.harness)).size,
    budgetUsd: user.budgetUsd ?? null,
    byCombo,
    recent: recent.slice(0, 12),
  };
}
