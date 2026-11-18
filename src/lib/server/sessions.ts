import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSession, newId, putSession, type RepoRec, type SessionRec, type TurnRec, type UserRec } from './db';
import { harnessIdFor, defaultModelFor } from './harnesses';
import { catalog, modelAllowed } from './catalog';
import { resolveRepo } from './github';
import { isActive, launchTurn, runningCount } from './runner';
import { isHarnessKey, type HarnessKey } from '@/lib/shared/harness-meta';

export const MAX_PROMPT = 8000;
export const MAX_RUNNING_PER_USER = 6;

export class InputError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function cleanPrompt(p: unknown): string {
  if (typeof p !== 'string') throw new InputError('Describe the task.');
  const t = p.replace(/\r\n/g, '\n').trim();
  if (!t) throw new InputError('Describe the task.');
  if (t.length > MAX_PROMPT) throw new InputError(`Keep the task under ${MAX_PROMPT} characters.`);
  return t;
}

/** Validate a harness key + model from the browser against the server's own mapping and the live catalog. */
export async function resolveHarness(harness: unknown, model: unknown): Promise<{ key: HarnessKey; harnessId: string; model: string }> {
  if (!isHarnessKey(harness)) throw new InputError('Pick a harness.');
  const harnessId = harnessIdFor(harness);
  if (!harnessId) throw new InputError('That harness is not set up.');
  const h = (await catalog()).find((x) => x.key === harness);
  if (!h?.available) throw new InputError('That harness is unavailable right now.', 503);
  const m = typeof model === 'string' && model ? model : defaultModelFor(harness);
  if (!(await modelAllowed(harness, m))) throw new InputError('That model is not available on this harness.');
  return { key: harness, harnessId, model: m };
}

export async function resolveRepoFor(user: UserRec, fullName: unknown, branch: unknown): Promise<RepoRec> {
  if (typeof fullName !== 'string') throw new InputError('Pick a repository.');
  const b = typeof branch === 'string' && branch.trim() ? branch.trim() : undefined;
  const repo = await resolveRepo(user, fullName.trim(), b);
  if (!repo) throw new InputError('That repository is not available to your account.', 404);
  return repo;
}

function newTurn(prompt: string, model: string): TurnRec {
  return { id: newId('t'), prompt, model, status: 'starting', idempotencyKey: randomUUID(), startedAt: Date.now(), steps: [] };
}

function titleFrom(prompt: string): string {
  const one = prompt.split('\n')[0].trim();
  return one.length > 64 ? `${one.slice(0, 63)}…` : one;
}

export function checkCapacity(user: UserRec, adding = 1) {
  if (runningCount(user.id) + adding > MAX_RUNNING_PER_USER) {
    throw new InputError(`You already have ${MAX_RUNNING_PER_USER} tasks running. Wait for one to finish.`, 429);
  }
}

/** Create a session record and start its first task (one user request = one new task). */
export function startSession(user: UserRec, repo: RepoRec, h: { key: HarnessKey; harnessId: string; model: string }, prompt: string, groupId?: string): SessionRec {
  const now = Date.now();
  const turn = newTurn(prompt, h.model);
  const s: SessionRec = {
    id: newId('s'), userId: user.id, groupId, title: titleFrom(prompt), repo,
    harnessKey: h.key, harnessId: h.harnessId, model: h.model, status: 'starting',
    createdAt: now, updatedAt: now, turns: [turn],
  };
  putSession(s);
  launchTurn(s, turn, false);
  return s;
}

/** A follow-up on the same result: same HarnessRouter session, same harness, previous_response_id. */
export async function followUp(user: UserRec, sessionId: string, promptRaw: unknown, modelRaw: unknown): Promise<SessionRec> {
  const s = getSession(sessionId);
  if (!s || s.userId !== user.id) throw new InputError('Session not found.', 404);
  const prompt = cleanPrompt(promptRaw);
  if (isActive(s.turns[s.turns.length - 1])) throw new InputError('The agent is still working on the previous message.', 409);
  if (!s.hrSessionId || !s.turns.some((t) => t.responseId)) throw new InputError('This session cannot be continued. Start a new one.', 409);
  checkCapacity(user);
  const m = typeof modelRaw === 'string' && modelRaw ? modelRaw : s.turns[s.turns.length - 1]?.model || s.model;
  if (!(await modelAllowed(s.harnessKey, m))) throw new InputError('That model is not available on this harness.');
  const turn = newTurn(prompt, m);
  s.turns.push(turn);
  s.status = 'starting';
  putSession(s);
  launchTurn(s, turn, true);
  return s;
}
