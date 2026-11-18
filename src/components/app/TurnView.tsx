'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Ban, ChevronDown, ChevronRight, CircleCheck, CircleX, Clock, Coins, Download, FileDiff, FilePen, FilePlus,
  FileText, FlaskConical, Globe, ListTodo, LoaderCircle, Search, ShieldCheck, SquareTerminal, TriangleAlert, Wrench,
} from 'lucide-react';
import { HarnessBadge } from '@/components/HarnessBadge';
import { Markdown } from './Markdown';
import { DiffStatsLabel, DiffView } from './DiffView';
import { fmtCost, fmtDuration, fmtTokens } from '@/lib/client/format';
import { HARNESS_META, type HarnessKey } from '@/lib/shared/harness-meta';
import type { PublicTurn, Step, ToolKind, ToolStep } from '@/lib/shared/types';

const TOOL_ICON: Record<ToolKind, typeof SquareTerminal> = {
  run: SquareTerminal, edit: FilePen, write: FilePlus, read: FileText, search: Search, plan: ListTodo, web: Globe, tool: Wrench,
};

export const isLive = (t: PublicTurn) => t.status === 'starting' || t.status === 'running';

export function useElapsed(t: PublicTurn): number {
  const live = isLive(t);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [live]);
  if (!live) return t.elapsedSec ?? ((t.finishedAt ?? now) - t.startedAt) / 1000;
  return Math.max(0, (now - t.startedAt) / 1000);
}

function ToolRow({ s }: { s: ToolStep }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICON[s.tool];
  const hasOut = Boolean(s.output);
  return (
    <div className="rise group">
      <button type="button" onClick={() => hasOut && setOpen(!open)} className={`flex w-full items-center gap-2.5 rounded-md px-2 py-[5px] text-left ${hasOut ? 'hover:bg-panel2' : 'cursor-default'}`}>
        {s.done ? <Icon className="size-3.5 shrink-0 text-dim" /> : <LoaderCircle className="size-3.5 shrink-0 animate-spin text-brand2" />}
        <span className="w-[46px] shrink-0 text-[12px] text-mute">{s.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[#c6ccd8]">{s.detail || '…'}</span>
        {hasOut && (open ? <ChevronDown className="size-3.5 text-dim" /> : <ChevronRight className="size-3.5 text-dim opacity-0 group-hover:opacity-100" />)}
      </button>
      {open && s.output && (
        <pre className="mb-1 ml-[70px] mr-2 max-h-48 overflow-auto rounded-md border border-line bg-[#0a0c10] px-3 py-2 font-mono text-[11.5px] leading-relaxed text-mute">{s.output}</pre>
      )}
    </div>
  );
}

function Steps({ steps, live }: { steps: Step[]; live: boolean }) {
  return (
    <div className="space-y-0.5">
      {steps.map((s) =>
        s.kind === 'tool' ? <ToolRow key={s.key} s={s} /> : s.text.trim() ? (
          <div key={s.key} className={`rise px-2 py-1 text-[13px] text-mute ${live && !s.done ? '' : ''}`}>
            <Markdown className="!text-[13px] [&_p]:my-1">{s.text}</Markdown>
          </div>
        ) : null,
      )}
    </div>
  );
}

function stepSummary(steps: Step[]): string {
  const tools = steps.filter((s): s is ToolStep => s.kind === 'tool');
  const runs = tools.filter((t) => t.tool === 'run').length;
  const edits = tools.filter((t) => t.tool === 'edit' || t.tool === 'write').length;
  const reads = tools.filter((t) => t.tool === 'read' || t.tool === 'search').length;
  const parts = [`${tools.length} step${tools.length === 1 ? '' : 's'}`];
  if (runs) parts.push(`${runs} command${runs === 1 ? '' : 's'}`);
  if (edits) parts.push(`${edits} edit${edits === 1 ? '' : 's'}`);
  if (reads) parts.push(`${reads} read${reads === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function TestsChip({ tests }: { tests?: string }) {
  if (!tests) return null;
  const ok = tests === 'passed';
  const bad = tests === 'failed';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] ${ok ? 'border-ok/30 bg-ok/10 text-ok' : bad ? 'border-bad/30 bg-bad/10 text-bad' : 'border-line2 bg-raised text-mute'}`}>
      <FlaskConical className="size-3" /> tests {tests.replace('_', ' ')}
    </span>
  );
}

export function ResultCard({ sessionId, turn, harness }: { sessionId: string; turn: PublicTurn; harness: HarnessKey }) {
  const [tab, setTab] = useState<'diff' | 'summary' | null>(null);
  const m = turn.manifest;
  const hasPatch = Boolean(turn.patch && turn.patch.trim());
  if (!m && !hasPatch && !turn.summaryMd) return null;
  const dl = (p: string) => `/api/sessions/${sessionId}/files/${p.split('/').map(encodeURIComponent).join('/')}`;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line2 bg-panel2" style={{ boxShadow: `inset 3px 0 0 0 ${HARNESS_META[harness].color}` }}>
      <div className="px-4 pb-3 pt-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium">{m?.title || 'Result'}</span>
          <TestsChip tests={m?.tests} />
          {m?.verified && <span className="inline-flex items-center gap-1 rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11.5px] text-brand"><ShieldCheck className="size-3" /> self-verified</span>}
        </div>
        {m?.summary && <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{m.summary}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hasPatch && (
            <button type="button" data-testid="view-diff" onClick={() => setTab(tab === 'diff' ? null : 'diff')} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${tab === 'diff' ? 'border-brand/50 bg-brand/10 text-text' : 'border-line2 bg-raised text-mute hover:text-text'}`}>
              <FileDiff className="size-3.5" /> Diff · <DiffStatsLabel patch={turn.patch!} />
            </button>
          )}
          {turn.summaryMd && (
            <button type="button" onClick={() => setTab(tab === 'summary' ? null : 'summary')} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${tab === 'summary' ? 'border-brand/50 bg-brand/10 text-text' : 'border-line2 bg-raised text-mute hover:text-text'}`}>
              <FileText className="size-3.5" /> SUMMARY.md
            </button>
          )}
          {turn.files?.some((f) => f.path === 'changes.patch') && (
            <a href={dl('changes.patch')} className="inline-flex items-center gap-1.5 rounded-lg border border-line2 bg-raised px-2.5 py-1.5 text-xs text-mute transition hover:text-text"><Download className="size-3.5" /> changes.patch</a>
          )}
        </div>
      </div>
      {tab === 'diff' && hasPatch && <div className="border-t border-line p-3"><DiffView patch={turn.patch!} /></div>}
      {tab === 'summary' && turn.summaryMd && <div className="border-t border-line px-4 py-3"><Markdown>{turn.summaryMd}</Markdown></div>}
    </div>
  );
}

export function TurnView({ sessionId, turn, harness, userName }: { sessionId: string; turn: PublicTurn; harness: HarnessKey; userName: string }) {
  const live = isLive(turn);
  const elapsed = useElapsed(turn);
  const [showSteps, setShowSteps] = useState(false);
  const meta = HARNESS_META[harness];

  // When done, the last message is the answer: do not repeat it in the timeline.
  const steps = useMemo(() => {
    if (live || !turn.answer) return turn.steps;
    const lastMsg = [...turn.steps].reverse().find((s) => s.kind === 'message');
    return turn.steps.filter((s) => s !== lastMsg);
  }, [turn.steps, turn.answer, live]);
  const tail = live ? steps.slice(-14) : steps;
  const hidden = live ? Math.max(0, steps.length - tail.length) : 0;

  return (
    <div className="space-y-4">
      {/* the developer's message */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-md border border-line2 bg-raised px-4 py-2.5">
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{turn.prompt}</div>
          <div className="mt-1 text-right text-[10.5px] text-dim">{userName}</div>
        </div>
      </div>

      {/* the agent */}
      <div className="flex gap-3">
        <HarnessBadge harness={harness} size={30} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
            <span className="font-medium text-text">{meta.label}</span>
            <span className="rounded-md border border-line bg-panel2 px-1.5 py-px font-mono text-[11px] text-mute">{turn.model}</span>
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-brand2"><LoaderCircle className="size-3.5 animate-spin" /><span className="shimmer-text">Working</span></span>
            ) : turn.status === 'completed' ? (
              <span className="inline-flex items-center gap-1 text-ok"><CircleCheck className="size-3.5" /> Done</span>
            ) : turn.status === 'cancelled' ? (
              <span className="inline-flex items-center gap-1 text-dim"><Ban className="size-3.5" /> Cancelled</span>
            ) : turn.status === 'incomplete' ? (
              <span className="inline-flex items-center gap-1 text-warn"><TriangleAlert className="size-3.5" /> Stopped</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-bad"><CircleX className="size-3.5" /> Failed</span>
            )}
            <span className="inline-flex items-center gap-1 text-dim"><Clock className="size-3" /> {fmtDuration(elapsed)}</span>
            {turn.costUsd !== undefined && <span className="inline-flex items-center gap-1 text-dim"><Coins className="size-3" /> {fmtCost(turn.costUsd)}</span>}
            {!live && turn.usage?.outputTokens ? <span className="text-dim">{fmtTokens(turn.usage.outputTokens)} out tokens</span> : null}
          </div>

          {/* steps */}
          {steps.length > 0 && (
            <div className="mt-2 rounded-xl border border-line bg-panel/70 p-1.5">
              {live ? (
                <>
                  {hidden > 0 && <div className="px-2 py-1 text-[11px] text-dim">{hidden} earlier step{hidden === 1 ? '' : 's'}</div>}
                  <Steps steps={tail} live />
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setShowSteps(!showSteps)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-mute hover:bg-panel2">
                    {showSteps ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    {stepSummary(steps)}
                  </button>
                  {showSteps && <Steps steps={steps} live={false} />}
                </>
              )}
            </div>
          )}
          {live && steps.length === 0 && (
            <div className="mt-2 rounded-xl border border-line bg-panel/70 px-3.5 py-3 text-[12.5px] text-mute"><span className="shimmer-text">Starting the {meta.label} sandbox…</span></div>
          )}

          {/* the answer */}
          {!live && turn.answer && (
            <div className="mt-3 text-[14px]">
              {turn.refused && <div className="mb-1 text-xs text-warn">Out of scope for a coding agent</div>}
              <Markdown>{turn.answer}</Markdown>
            </div>
          )}
          {turn.note && !live && (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-[12.5px] ${turn.status === 'failed' ? 'border-bad/30 bg-bad/5 text-bad' : 'border-warn/30 bg-warn/5 text-warn'}`}>{turn.note}</div>
          )}
          {!live && <ResultCard sessionId={sessionId} turn={turn} harness={harness} />}
        </div>
      </div>
    </div>
  );
}
