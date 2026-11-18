import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HARNESS_META, type HarnessKey, isHarnessKey } from '@/lib/shared/harness-meta';

/**
 * Server mapping: product harness key (what the browser sends, e.g. "codex") -> the HarnessRouter
 * harness_id this product created for it. harness_ids never leave the server.
 * Source: harnessrouter.json (written by `npm run hr:ensure`).
 */
interface Setup { feature_key: string; harness_id: string; name: string; base: string; model: string }

let cache: Map<HarnessKey, Setup> | null = null;

function load(): Map<HarnessKey, Setup> {
  if (cache) return cache;
  const doc = JSON.parse(readFileSync(join(process.cwd(), 'harnessrouter.json'), 'utf8')) as { setups?: Setup[] } & Partial<Setup>;
  const setups: Setup[] = Array.isArray(doc.setups) ? doc.setups : doc.harness_id ? [doc as Setup] : [];
  const m = new Map<HarnessKey, Setup>();
  for (const s of setups) if (isHarnessKey(s.feature_key) && /^chrn_[A-Za-z0-9]+$/.test(s.harness_id)) m.set(s.feature_key, s);
  return (cache = m);
}

export function harnessIdFor(key: string): string | null {
  if (!isHarnessKey(key)) return null;
  return load().get(key)?.harness_id ?? null;
}

export function defaultModelFor(key: HarnessKey): string {
  return load().get(key)?.model ?? HARNESS_META[key].defaultModel;
}

export function configuredHarnessKeys(): HarnessKey[] {
  const m = load();
  return (Object.keys(HARNESS_META) as HarnessKey[]).filter((k) => m.has(k));
}
