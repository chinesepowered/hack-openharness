'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, Coins, ExternalLink, GitBranch, Lock, LoaderCircle, Square, Swords } from 'lucide-react';
import { useApp, StatusDot } from './AppShell';
import { ModelPicker } from './Pickers';
import { TurnView, isLive } from './TurnView';
import { HarnessBadge } from '@/components/HarnessBadge';
import { api } from '@/lib/client/api';
import { fmtCost } from '@/lib/client/format';
import { HARNESS_META } from '@/lib/shared/harness-meta';
import type { LiveEvent, MessageStep, PublicSession, PublicTurn, Step } from '@/lib/shared/types';

function upsertStep(steps: Step[], step: Step): Step[] {
  const i = steps.findIndex((s) => s.key === step.key);
  if (i < 0) return [...steps, step];
  const next = steps.slice();
  next[i] = step;
  return next;
}

function apply(s: PublicSession | null, e: LiveEvent): PublicSession | null {
  if (e.type === 'snapshot') return e.session;
  if (!s) return s;
  if (e.type === 'turn') {
    const exists = s.turns.some((t) => t.id === e.turn.id);
    const turns = exists ? s.turns.map((t) => (t.id === e.turn.id ? e.turn : t)) : [...s.turns, e.turn];
    const title = turns[0]?.manifest?.title || s.title;
    return { ...s, turns, status: e.sessionStatus, title, updatedAt: Date.now() };
  }
  const turns = s.turns.map((t): PublicTurn => {
    if (t.id !== e.turnId) return t;
    if (e.type === 'step') return { ...t, status: t.status === 'starting' ? 'running' : t.status, steps: upsertStep(t.steps, e.step) };
    // delta: append to the streaming message
    const idx = t.steps.findIndex((x) => x.key === e.key);
    if (idx < 0) {
      const m: MessageStep = { kind: 'message', key: e.key, text: e.delta, done: false, at: Date.now() - t.startedAt };
      return { ...t, steps: [...t.steps, m] };
    }
    const cur = t.steps[idx] as MessageStep;
    const steps = t.steps.slice();
    steps[idx] = { ...cur, text: cur.text + e.delta };
    return { ...t, steps };
  });
  return { ...s, turns };
}

export function SessionView({ id }: { id: string }) {
  const { user, catalog, refreshSessions } = useApp();
  const [session, setSession] = useState<PublicSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    setSession(null);
    setMissing(false);
    const es = new EventSource(`/api/sessions/${id}/stream`);
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as LiveEvent | { type: 'ping' };
        if (e.type === 'ping') return;
        setSession((s) => apply(s, e));
        if (e.type === 'turn') refreshSessions();
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      // 404s close the stream for good; otherwise EventSource reconnects and gets a fresh snapshot.
      fetch(`/api/sessions/${id}`).then((r) => { if (r.status === 404) { setMissing(true); es.close(); } }).catch(() => {});
    };
    return () => es.close();
  }, [id, refreshSessions]);

  const last = session?.turns[session.turns.length - 1];
  const busy = Boolean(last && isLive(last));
  const harness = catalog.find((h) => h.key === session?.harness);

  useEffect(() => {
    if (session && !model) setModel(last?.model || session.model);
  }, [session, last, model]);

  // Follow the bottom while the agent works, unless the user scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [session]);
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const totalCost = useMemo(() => session?.turns.reduce((a, t) => a + (t.costUsd || 0), 0) ?? 0, [session]);

  async function send() {
    if (!prompt.trim() || busy || sending) return;
    setSending(true);
    setError('');
    try {
      const r = await api<{ session: PublicSession }>(`/api/sessions/${id}/messages`, { body: { prompt, model } });
      setSession(r.session);
      setPrompt('');
      stick.current = true;
      refreshSessions();
    } catch (e) {
      setError((e as Error).message);
    } finally { setSending(false); }
  }

  async function stop() {
    try { await api(`/api/sessions/${id}/cancel`, { body: {} }); } catch (e) { setError((e as Error).message); }
  }

  if (missing) return <div className="grid h-full place-items-center text-sm text-mute">Session not found.</div>;
  if (!session) return <div className="grid h-full place-items-center"><LoaderCircle className="size-5 animate-spin text-dim" /></div>;
  const meta = HARNESS_META[session.harness];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-bg/80 px-6 py-3 backdrop-blur">
        <HarnessBadge harness={session.harness} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-medium">{session.title}</h1>
            <StatusDot status={session.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-mute">
            <a href={session.repo.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text">
              {session.repo.private && <Lock className="size-3" />}{session.repo.fullName} <ExternalLink className="size-3" />
            </a>
            <span className="inline-flex items-center gap-1"><GitBranch className="size-3" />{session.repo.branch}</span>
            <span>{meta.label} · <span className="font-mono">{last?.model || session.model}</span></span>
            {totalCost > 0 && <span className="inline-flex items-center gap-1"><Coins className="size-3" />{fmtCost(totalCost)} total</span>}
            {session.groupId && <Link href={`/app/compare/${session.groupId}`} className="inline-flex items-center gap-1 text-brand hover:underline"><Swords className="size-3" /> back to race</Link>}
          </div>
        </div>
      </header>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] space-y-10 px-6 py-8">
          {session.turns.map((t) => <TurnView key={t.id} sessionId={session.id} turn={t} harness={session.harness} userName={user.name} />)}
        </div>
      </div>

      <div className="border-t border-line bg-bg px-6 py-4">
        <div className="mx-auto max-w-[860px]">
          {error && <p className="mb-2 text-xs text-bad">{error}</p>}
          <div className="rounded-2xl border border-line2 bg-panel2 p-2 focus-within:border-dim">
            <textarea
              data-testid="followup-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
              rows={2}
              placeholder={busy ? `${meta.label} is working… you can type your next message` : `Ask ${meta.label} for changes, a fix, or an explanation`}
              className="w-full resize-none bg-transparent px-2 py-1.5 text-[14px] outline-none placeholder:text-dim"
            />
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] text-dim">Continues this {meta.label} session</span>
              <div className="ml-auto flex items-center gap-2">
                <ModelPicker harness={harness} value={model} onChange={setModel} compact align="right" up />
                {busy ? (
                  <button type="button" onClick={stop} title="Stop" className="grid size-8 place-items-center rounded-lg border border-line2 bg-raised text-text hover:bg-line"><Square className="size-3.5 fill-current" /></button>
                ) : (
                  <button type="button" data-testid="followup-send" onClick={send} disabled={!prompt.trim() || sending} className="grid size-8 place-items-center rounded-lg bg-white text-black transition hover:bg-white/90 disabled:opacity-30">
                    {sending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
