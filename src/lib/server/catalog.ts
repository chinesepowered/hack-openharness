import 'server-only';
import { hr } from './hr';
import { configuredHarnessKeys, defaultModelFor, harnessIdFor } from './harnesses';
import { HARNESS_META, type HarnessKey } from '@/lib/shared/harness-meta';
import type { CatalogHarness } from '@/lib/shared/types';

/** Models each of OUR harnesses may run, read live from HarnessRouter and cached for 10 minutes. */
const TTL = 10 * 60 * 1000;
const g = globalThis as unknown as { __ohCatalog?: { at: number; data: CatalogHarness[] }; __ohCatalogLoading?: Promise<CatalogHarness[]> };

async function load(): Promise<CatalogHarness[]> {
  const keys = configuredHarnessKeys();
  return Promise.all(keys.map(async (key): Promise<CatalogHarness> => {
    const meta = HARNESS_META[key];
    const def = defaultModelFor(key);
    try {
      const { models } = await hr().harnessModels(harnessIdFor(key)!);
      const ids = models.filter((m) => m.available).map((m) => m.id);
      const ordered = [def, ...ids.filter((m) => m !== def)].filter((m, i, a) => a.indexOf(m) === i && ids.includes(m));
      return { ...meta, defaultModel: def, models: ordered.length ? ordered : [def], available: ordered.length > 0 };
    } catch {
      return { ...meta, defaultModel: def, models: [def], available: false };
    }
  }));
}

export async function catalog(): Promise<CatalogHarness[]> {
  const c = g.__ohCatalog;
  if (c && Date.now() - c.at < TTL) return c.data;
  g.__ohCatalogLoading ??= load().then((data) => {
    g.__ohCatalog = { at: Date.now(), data };
    return data;
  }).finally(() => { g.__ohCatalogLoading = undefined; });
  return g.__ohCatalogLoading;
}

/** True when `model` may run on harness `key` (validated server-side on every task). */
export async function modelAllowed(key: HarnessKey, model: string): Promise<boolean> {
  const h = (await catalog()).find((x) => x.key === key);
  if (!h) return false;
  return h.models.includes(model);
}
