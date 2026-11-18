'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FolderGit2, Lock, Plus, Search } from 'lucide-react';
import { HarnessBadge } from '@/components/HarnessBadge';
import { modelProvider, type HarnessKey } from '@/lib/shared/harness-meta';
import type { CatalogHarness, RepoOption } from '@/lib/shared/types';

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

// ── repository ──────────────────────────────────────────────────────────────────────────────────
export function RepoPicker({ repos, value, onChange, onAdd, demo }: {
  repos: RepoOption[]; value: RepoOption | null; onChange: (r: RepoOption) => void;
  onAdd?: (fullName: string) => Promise<void>; demo: boolean;
}) {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState('');
  const [err, setErr] = useState('');
  const list = useMemo(() => repos.filter((r) => r.fullName.toLowerCase().includes(q.toLowerCase())), [repos, q]);

  return (
    <div ref={ref} className="relative">
      <button type="button" data-testid="repo-picker" onClick={() => setOpen(!open)} className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-line2 bg-panel2 px-3 text-left text-sm transition hover:border-dim">
        <FolderGit2 className="size-4 shrink-0 text-mute" />
        {value ? (
          <span className="min-w-0 flex-1 truncate">
            <span className="text-mute">{value.fullName.split('/')[0]}/</span><span className="font-medium">{value.fullName.split('/')[1]}</span>
          </span>
        ) : <span className="flex-1 text-dim">Select a repository</span>}
        {value?.private && <Lock className="size-3.5 text-dim" />}
        <ChevronDown className="size-4 text-dim" />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-30 w-[420px] overflow-hidden rounded-xl border border-line2 bg-panel shadow-2xl shadow-black/60">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Search className="size-4 text-dim" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search repositories" className="w-full bg-transparent text-sm outline-none placeholder:text-dim" />
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {list.map((r) => (
              <button key={r.fullName} type="button" onClick={() => { onChange(r); setOpen(false); }} className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-raised">
                <FolderGit2 className="mt-0.5 size-4 shrink-0 text-dim" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="truncate">{r.fullName}</span>
                    {r.private && <Lock className="size-3 text-dim" />}
                  </div>
                  {r.description && <div className="truncate text-xs text-dim">{r.description}</div>}
                </div>
                {r.language && <span className="mt-0.5 shrink-0 text-[11px] text-dim">{r.language}</span>}
                {value?.fullName === r.fullName && <Check className="mt-0.5 size-4 text-brand" />}
              </button>
            ))}
            {list.length === 0 && <p className="px-3 py-3 text-xs text-dim">No matching repositories.</p>}
          </div>
          {demo && onAdd && (
            <form
              className="flex items-center gap-2 border-t border-line px-3 py-2.5"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr('');
                try { await onAdd(adding); setAdding(''); } catch (x) { setErr((x as Error).message); }
              }}
            >
              <Plus className="size-4 text-dim" />
              <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a public repo: owner/name" className="w-full bg-transparent text-sm outline-none placeholder:text-dim" />
              <button className="rounded-md bg-raised px-2 py-1 text-xs text-mute hover:text-text">Add</button>
            </form>
          )}
          {err && <p className="px-3 pb-2 text-xs text-bad">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ── model ───────────────────────────────────────────────────────────────────────────────────────
export function ModelPicker({ harness, value, onChange, compact = false, align = 'left', up = false }: {
  harness: CatalogHarness | undefined; value: string; onChange: (m: string) => void; compact?: boolean; align?: 'left' | 'right'; up?: boolean;
}) {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const models = (harness?.models || []).filter((m) => m.toLowerCase().includes(q.toLowerCase()));
    const map = new Map<string, string[]>();
    for (const m of models) {
      const p = m === harness?.defaultModel ? 'Recommended' : modelProvider(m);
      map.set(p, [...(map.get(p) || []), m]);
    }
    const order = ['Recommended', 'OpenAI', 'Anthropic', 'Google', 'Qwen', 'Moonshot', 'DeepSeek', 'xAI', 'Zhipu', 'MiniMax', 'Meta', 'Mistral', 'Muse', 'StepFun', 'Tencent', 'NVIDIA', 'Ant Group', 'Other'];
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [harness, q]);

  return (
    <div ref={ref} className="relative">
      <button type="button" data-testid="model-picker" disabled={!harness} onClick={() => setOpen(!open)} className={`flex items-center gap-2 rounded-lg border border-line2 bg-panel2 px-3 text-left transition hover:border-dim disabled:opacity-50 ${compact ? 'h-8 text-xs' : 'h-10 w-full text-sm'}`}>
        <span className={`min-w-0 flex-1 truncate font-mono ${compact ? 'text-[11.5px]' : 'text-[13px]'}`}>{value || 'Model'}</span>
        <ChevronDown className="size-4 shrink-0 text-dim" />
      </button>
      {open && harness && (
        <div className={`absolute z-30 w-[300px] overflow-hidden rounded-xl border border-line2 bg-panel shadow-2xl shadow-black/60 ${align === 'right' ? 'right-0' : 'left-0'} ${up ? 'bottom-11' : 'top-12'}`}>
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Search className="size-4 text-dim" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${harness.models.length} models on ${harness.label}`} className="w-full bg-transparent text-sm outline-none placeholder:text-dim" />
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {groups.map(([group, models]) => (
              <div key={group} className="mb-1">
                <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-dim">{group}</div>
                {models.map((m) => (
                  <button key={m} type="button" data-model={m} onClick={() => { onChange(m); setOpen(false); setQ(''); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-[12.5px] transition hover:bg-raised">
                    <span className="flex-1 truncate">{m}</span>
                    {m === value && <Check className="size-3.5 text-brand" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── harness grid ────────────────────────────────────────────────────────────────────────────────
export function HarnessGrid({ catalog, selected, onToggle, multi }: {
  catalog: CatalogHarness[]; selected: HarnessKey[]; onToggle: (k: HarnessKey) => void; multi: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {catalog.map((h) => {
        const on = selected.includes(h.key);
        const order = selected.indexOf(h.key);
        return (
          <button
            key={h.key}
            type="button"
            data-harness={h.key}
            data-selected={on ? 'true' : 'false'}
            disabled={!h.available}
            onClick={() => onToggle(h.key)}
            className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-transparent bg-raised' : 'border-line bg-panel2 hover:border-line2 hover:bg-raised/60'}`}
            style={on ? { boxShadow: `0 0 0 1.5px ${h.color}, 0 10px 30px -12px ${h.color}` } : undefined}
          >
            <HarnessBadge harness={h.key} size={32} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{h.label}</div>
              <div className="truncate text-[11px] text-dim">{h.available ? `${h.models.length} models` : 'unavailable'}</div>
            </div>
            {on && multi && <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full text-[10px] font-bold text-black" style={{ background: h.color }}>{order + 1}</span>}
          </button>
        );
      })}
    </div>
  );
}
