import 'server-only';
import { hr } from './hr';
import { HRError, TERMINAL_STATUSES, answerText, type HRResponse } from './harnessrouter';
import { StepBuilder, scrub } from './steps';
import { allSessions, getUser, putSession, save, type RepoRec, type SessionRec, type TurnRec } from './db';
import { downloadTarball } from './github';
import { publicTurn } from './views';
import type { LiveEvent, Manifest, TurnStatus } from '@/lib/shared/types';

// ── live listeners (browser SSE connections). A listener leaving never stops a task. ────────────
type Listener = (e: LiveEvent) => void;
const g = globalThis as unknown as {
  __ohListeners?: Map<string, Set<Listener>>;
  __ohRunning?: Set<string>;
  __ohCancel?: Set<string>;
  __ohRecovered?: boolean;
};
const listeners = (g.__ohListeners ??= new Map());
const running = (g.__ohRunning ??= new Set());
const cancelRequested = (g.__ohCancel ??= new Set());

export function subscribe(sessionId: string, fn: Listener): () => void {
  const set = listeners.get(sessionId) ?? new Set();
  set.add(fn);
  listeners.set(sessionId, set);
  return () => { set.delete(fn); if (!set.size) listeners.delete(sessionId); };
}
function publish(sessionId: string, e: LiveEvent) {
  for (const fn of listeners.get(sessionId) ?? []) { try { fn(e); } catch { /* ignore */ } }
}

export const isActive = (t?: TurnRec) => Boolean(t && (t.status === 'starting' || t.status === 'running'));

export function runningCount(userId: string): number {
  return allSessions().filter((s) => s.userId === userId && isActive(s.turns[s.turns.length - 1])).length;
}

// ── task input ──────────────────────────────────────────────────────────────────────────────────
function header(repo: RepoRec, archive?: string): string {
  return [`Repository: ${repo.cloneUrl}`, `Branch: ${repo.branch}`, ...(archive ? [`Archive: ${archive}`] : [])].join('\n');
}

/** First turn: the repo header + the developer's task. Private repos travel as an uploaded archive. */
async function firstInput(s: SessionRec, prompt: string): Promise<unknown> {
  const user = getUser(s.userId);
  if (s.repo.private && user?.githubToken) {
    const bytes = await downloadTarball(user.githubToken, s.repo.fullName, s.repo.branch);
    const f = await hr().uploadFile('repo.tar.gz', bytes, 'application/gzip');
    return [{
      role: 'user',
      content: [
        { type: 'input_text', text: `${header(s.repo, 'repo.tar.gz')}\n\nTask:\n${prompt}` },
        { type: 'input_file', file_id: f.id },
      ],
    }];
  }
  return `${header(s.repo)}\n\nTask:\n${prompt}`;
}

function plainError(err: unknown): string {
  if (err instanceof HRError) {
    if (err.code === 'model_not_available') return 'That model is not available on this harness right now. Pick another model.';
    if (err.code === 'session_busy') return 'This session is still finishing its previous message. Try again in a moment.';
    if (err.status === 429) return 'The agent service is busy. Try again in a moment.';
    if (err.status === 401 || err.status === 403) return 'OpenHarness could not reach the agent service (configuration problem).';
    if (err.status >= 500) return 'The agent service had a problem. Try again.';
    return 'The task could not be started.';
  }
  const msg = (err as Error)?.message || '';
  if (/tarball|archive/.test(msg)) return 'Could not package the repository for the agent.';
  return 'Something went wrong while running the task.';
}

function sanitizeManifest(m: unknown): Manifest | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const o = m as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? scrub(v).slice(0, max) : undefined);
  const files = Array.isArray(o.changed_files) ? o.changed_files.filter((x): x is string => typeof x === 'string').slice(0, 300).map((x) => scrub(x).replace(/^repo\//, '')) : undefined;
  return {
    title: str(o.title, 120),
    summary: str(o.summary, 800),
    changed_files: files,
    tests: str(o.tests, 24),
    verified: typeof o.verified === 'boolean' ? o.verified : undefined,
  };
}

// ── run one turn (never awaited by a request handler) ─────────────────────────────────────────
export function launchTurn(s: SessionRec, turn: TurnRec, followUp: boolean) {
  void runTurn(s, turn, followUp);
}

async function runTurn(s: SessionRec, turn: TurnRec, followUp: boolean) {
  running.add(turn.id);
  const builder = new StepBuilder(turn.startedAt, turn.steps);
  try {
    const input = followUp ? turn.prompt : await firstInput(s, turn.prompt);
    const prev = followUp ? [...s.turns].reverse().find((t) => t.id !== turn.id && t.responseId) : undefined;
    const r = await hr().runStreamed(
      {
        harnessId: s.harnessId, // always the harness this session started on
        input,
        user: s.userId, // the signed-in person's product id, from the server-side record
        model: turn.model,
        idempotencyKey: turn.idempotencyKey,
        previousResponseId: prev?.responseId,
        sessionId: followUp ? s.hrSessionId : undefined,
      },
      {
        onIds: async ({ responseId, sessionId }) => {
          turn.responseId = responseId;
          if (!s.hrSessionId) s.hrSessionId = sessionId;
          turn.status = 'running';
          s.status = 'running';
          putSession(s);
          save(true);
          publish(s.id, { type: 'turn', turn: publicTurn(turn), sessionStatus: s.status });
          if (cancelRequested.delete(turn.id)) { try { await hr().cancelResponse(responseId); } catch { /* best effort */ } }
        },
        onEvent: (ev) => {
          const u = builder.apply(ev);
          if (!u) return;
          if ('step' in u) publish(s.id, { type: 'step', turnId: turn.id, step: u.step });
          else publish(s.id, { type: 'delta', turnId: turn.id, key: u.delta.key, delta: u.delta.delta });
          s.updatedAt = Date.now();
          save();
        },
      },
    );
    builder.finish();
    await settle(s, turn, r);
  } catch (err) {
    builder.finish();
    turn.status = 'failed';
    s.status = 'failed';
    turn.finishedAt = Date.now();
    turn.note = plainError(err);
    putSession(s);
    save(true);
    publish(s.id, { type: 'turn', turn: publicTurn(turn), sessionStatus: s.status });
    console.error('[openharness] task failed', s.id, turn.id, err instanceof HRError ? `${err.status} ${err.code}` : (err as Error)?.name);
  } finally {
    running.delete(turn.id);
  }
}

/** Read the files the harness wrote under out/ (patch, manifest, summary) with the server key. */
async function collectOutputs(hsid: string, turn: TurnRec) {
  const files = await hr().listFiles(hsid);
  const out = files.filter((f) => f.path.startsWith('out/') && f.path.length > 4);
  turn.files = out.map((f) => ({ path: f.path.slice(4), bytes: f.bytes, fileId: f.id }));
  const text = async (name: string, cap: number) => {
    const f = out.find((x) => x.path === `out/${name}`);
    if (!f) return undefined;
    if (f.bytes > cap) return null;
    const { bytes } = await hr().fetchFile(hsid, f.id);
    return new TextDecoder().decode(bytes);
  };
  const [patch, manifest, summary] = await Promise.all([
    text('changes.patch', 1_500_000), text('manifest.json', 64_000), text('SUMMARY.md', 64_000),
  ]);
  if (patch === null) turn.note = 'The diff is too large to show here. Download changes.patch instead.';
  else if (patch !== undefined) turn.patch = patch;
  if (typeof summary === 'string') turn.summaryMd = scrub(summary);
  if (typeof manifest === 'string') {
    try { turn.manifest = sanitizeManifest(JSON.parse(manifest)); } catch { /* not JSON */ }
  }
}

async function settle(s: SessionRec, turn: TurnRec, r: HRResponse) {
  const status = (TERMINAL_STATUSES.has(r.status) ? r.status : 'failed') as TurnStatus;
  turn.status = status;
  turn.finishedAt = Date.now();
  turn.responseId ||= r.id;
  const hsid = s.hrSessionId || r.metadata?.session_id;
  if (hsid && !s.hrSessionId) s.hrSessionId = hsid;

  let answer = scrub(answerText(r) || '');
  if (/^\s*role_mismatch\b/i.test(answer)) {
    turn.refused = true;
    answer = answer.replace(/^\s*role_mismatch[^\n]*\n?/i, '').trim();
  }
  turn.answer = answer;
  turn.servedModel = (r.served_model || r.model || turn.model) ?? undefined;
  const u = r.usage || {};
  turn.usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_tokens, totalTokens: u.total_tokens };
  if (status === 'incomplete') {
    turn.note = r.incomplete_details?.reason === 'timeout'
      ? 'Stopped at the time limit. Send a follow-up to continue where it left off.'
      : 'Stopped at the step limit. Send a follow-up to continue where it left off.';
  } else if (status === 'failed') turn.note = 'The agent hit an error and stopped.';
  else if (status === 'cancelled') turn.note = 'Cancelled.';

  if (hsid) {
    try { await collectOutputs(hsid, turn); } catch { /* the answer still stands */ }
    try {
      const info = await hr().getSession(hsid);
      const spend = Number(info.spend_usd);
      if (Number.isFinite(spend)) {
        const idx = s.turns.indexOf(turn);
        const before = s.turns.slice(0, idx).reverse().find((t) => typeof t.sessionSpendAfter === 'number')?.sessionSpendAfter ?? 0;
        turn.costUsd = Math.max(0, Math.round((spend - before) * 10000) / 10000);
        turn.sessionSpendAfter = spend;
      }
    } catch { /* cost is optional */ }
  }
  turn.elapsedSec = Math.round((turn.finishedAt - turn.startedAt) / 100) / 10;
  if (s.turns[0] === turn && turn.manifest?.title) s.title = turn.manifest.title;
  s.status = status;
  putSession(s);
  save(true);
  publish(s.id, { type: 'turn', turn: publicTurn(turn), sessionStatus: s.status });
}

// ── cancel ──────────────────────────────────────────────────────────────────────────────────────
export async function cancelLatest(s: SessionRec): Promise<boolean> {
  const t = s.turns[s.turns.length - 1];
  if (!isActive(t)) return false;
  if (t.responseId) {
    try { await hr().cancelResponse(t.responseId); } catch { /* the stream reports the outcome */ }
  } else {
    cancelRequested.add(t.id);
  }
  return true;
}

// ── recovery after a restart: finish turns that were running, never resend them ───────────────
export function recoverOnce() {
  if (g.__ohRecovered) return;
  g.__ohRecovered = true;
  for (const s of allSessions()) {
    for (const t of s.turns) {
      if (!isActive(t) || running.has(t.id)) continue;
      if (!t.responseId) {
        t.status = 'failed';
        t.note = 'Interrupted before it started. Send it again.';
        t.finishedAt = Date.now();
        s.status = 'failed';
        putSession(s);
        continue;
      }
      running.add(t.id);
      void hr().waitForResponse(t.responseId)
        .then((r) => settle(s, t, r))
        .catch(() => {
          t.status = 'failed'; t.note = 'Lost track of this task after a restart.'; s.status = 'failed'; putSession(s);
        })
        .finally(() => running.delete(t.id));
    }
  }
  save(true);
}
