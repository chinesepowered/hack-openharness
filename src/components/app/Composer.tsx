'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, GitBranch, LoaderCircle, ShieldCheck, Swords, Zap } from 'lucide-react';
import { useApp } from './AppShell';
import { HarnessGrid, ModelPicker, RepoPicker } from './Pickers';
import { HarnessBadge } from '@/components/HarnessBadge';
import { api } from '@/lib/client/api';
import type { HarnessKey } from '@/lib/shared/harness-meta';
import type { PublicGroup, PublicSession, RepoOption } from '@/lib/shared/types';

const SUGGESTIONS = [
  'Add a once() method that unsubscribes after the first event, with tests',
  'Explain how this library works and where the core logic lives',
  'Add TypeScript JSDoc to the public API and document it in the README',
  'Find and fix an edge-case bug, then add a regression test',
];

export function Composer() {
  const { user, catalog, repos, addRepo, refreshSessions } = useApp();
  const router = useRouter();
  const [repo, setRepo] = useState<RepoOption | null>(null);
  const [branch, setBranch] = useState('');
  const [race, setRace] = useState(false);
  const [selected, setSelected] = useState<HarnessKey[]>([]);
  const [models, setModels] = useState<Partial<Record<HarnessKey, string>>>({});
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!repo && repos.length) { setRepo(repos[0]); setBranch(repos[0].defaultBranch); } }, [repos, repo]);
  // Pre-select a harness once, when the catalog first arrives. Never re-select after the user clears it.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !catalog.length) return;
    defaulted.current = true;
    const first = catalog.find((h) => h.available);
    if (first) setSelected((cur) => (cur.length ? cur : [first.key]));
  }, [catalog]);

  const modelFor = (k: HarnessKey) => models[k] || catalog.find((h) => h.key === k)?.defaultModel || '';
  const primary = catalog.find((h) => h.key === selected[0]);

  function toggle(k: HarnessKey) {
    if (!race) { setSelected([k]); return; }
    setSelected((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= 4 ? cur : [...cur, k]));
  }

  function setMode(r: boolean) {
    setRace(r);
    setSelected((cur) => (r ? cur : cur.slice(0, 1)));
  }

  const canRun = Boolean(repo && prompt.trim() && (race ? selected.length >= 2 : selected.length === 1)) && !busy;
  const label = useMemo(() => {
    if (race) return selected.length >= 2 ? `Race ${selected.length} harnesses` : 'Pick 2–4 harnesses';
    return primary ? `Run on ${primary.label}` : 'Run';
  }, [race, selected, primary]);

  async function run() {
    if (!canRun || !repo) return;
    setBusy(true);
    setError('');
    try {
      if (race) {
        const r = await api<{ group: PublicGroup }>('/api/compare', {
          body: { repo: repo.fullName, branch, prompt, runs: selected.map((k) => ({ harness: k, model: modelFor(k) })) },
        });
        refreshSessions();
        router.push(`/app/compare/${r.group.id}`);
      } else {
        const r = await api<{ session: PublicSession }>('/api/sessions', {
          body: { repo: repo.fullName, branch, harness: selected[0], model: modelFor(selected[0]), prompt },
        });
        refreshSessions();
        router.push(`/app/s/${r.session.id}`);
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[980px] px-8 pb-16 pt-12">
        <h1 className="text-[30px] font-semibold tracking-[-0.02em]">What should we build?</h1>
        <p className="mt-1.5 text-[14.5px] text-mute">Pick a repository, a harness and a model, or race several harnesses on the same task.</p>

        <div className="mt-8 rounded-2xl border border-line bg-panel p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Repository</label>
              <RepoPicker repos={repos} value={repo} onChange={(r) => { setRepo(r); setBranch(r.defaultBranch); }} onAdd={(n) => addRepo(n)} demo={user.mode === 'demo'} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Branch</label>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-line2 bg-panel2 px-3 focus-within:border-dim">
                <GitBranch className="size-4 text-mute" />
                <input value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full bg-transparent font-mono text-[13px] outline-none" />
              </div>
            </div>
          </div>

          <div className="mb-2 mt-5 flex items-center justify-between">
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Harness</label>
            <div className="flex rounded-lg border border-line2 bg-panel2 p-0.5 text-xs">
              <button type="button" onClick={() => setMode(false)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${!race ? 'bg-raised text-text' : 'text-mute hover:text-text'}`}><Zap className="size-3.5" /> Single</button>
              <button type="button" data-testid="race-toggle" onClick={() => setMode(true)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${race ? 'bg-raised text-text' : 'text-mute hover:text-text'}`}><Swords className="size-3.5" /> Race 2–4</button>
            </div>
          </div>
          {catalog.length === 0 ? (
            <div className="grid h-[120px] place-items-center rounded-xl border border-line bg-panel2"><LoaderCircle className="size-5 animate-spin text-dim" /></div>
          ) : (
            <HarnessGrid catalog={catalog} selected={selected} onToggle={toggle} multi={race} />
          )}

          <div className="mt-4">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-dim">{race ? 'Models' : 'Model'}</label>
            {!race && primary && (
              <div className="grid items-center gap-3 sm:grid-cols-[300px_1fr]">
                <ModelPicker harness={primary} value={modelFor(primary.key)} onChange={(m) => setModels({ ...models, [primary.key]: m })} />
                <p className="text-[12.5px] text-dim"><span className="text-mute">{primary.label}</span> · {primary.tagline} · runs {primary.models.length} models</p>
              </div>
            )}
            {race && (
              <div className="grid gap-2 sm:grid-cols-2">
                {selected.map((k) => {
                  const h = catalog.find((x) => x.key === k);
                  return (
                    <div key={k} data-row={k} className="flex items-center gap-2.5 rounded-lg border border-line bg-panel2 p-1.5 pl-2.5">
                      <HarnessBadge harness={k} size={24} />
                      <span className="w-[96px] shrink-0 truncate text-[13px]">{h?.label}</span>
                      <div className="min-w-0 flex-1"><ModelPicker harness={h} value={modelFor(k)} onChange={(m) => setModels({ ...models, [k]: m })} compact /></div>
                    </div>
                  );
                })}
                {selected.length < 2 && <p className="text-[12.5px] text-dim">Select at least two harnesses above.</p>}
              </div>
            )}
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Task</label>
            <div className="rounded-xl border border-line2 bg-panel2 p-2 focus-within:border-dim">
              <textarea
                data-testid="task-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
                rows={4}
                placeholder="Describe the change, the bug, or the question…"
                className="w-full resize-none bg-transparent px-2 py-1.5 text-[14.5px] leading-relaxed outline-none placeholder:text-dim"
              />
              <div className="flex items-center gap-3 px-1 pb-0.5">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-dim"><ShieldCheck className="size-3.5" /> Runs in an isolated sandbox. You review the diff.</span>
                <button type="button" data-testid="run" onClick={run} disabled={!canRun} className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-30">
                  {busy ? <LoaderCircle className="size-4 animate-spin" /> : race ? <Swords className="size-4" /> : <ArrowUp className="size-4" />} {label}
                </button>
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Try</div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setPrompt(s)} className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12.5px] text-mute transition hover:border-line2 hover:text-text">{s}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
