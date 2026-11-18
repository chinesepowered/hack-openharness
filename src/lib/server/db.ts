import 'server-only';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { HarnessKey } from '@/lib/shared/harness-meta';
import type { Manifest, RepoOption, Step, TurnStatus } from '@/lib/shared/types';

/**
 * A tiny JSON-file store for the hackathon build (one Node process). Swap for Postgres/SQLite in
 * production; the rest of the app only uses the functions below.
 * Server-only fields (harnessId, hrSessionId, responseId, fileIds, githubToken) never reach the
 * browser: src/lib/server/views.ts builds every public object.
 */
export interface UserRec {
  id: string;
  mode: 'github' | 'demo';
  githubId?: number;
  login: string;
  name: string;
  avatarUrl: string;
  githubToken?: string;
  customRepos?: RepoOption[];
  createdAt: number;
}

export interface FileRec { path: string; bytes: number; fileId: string }

export interface TurnRec {
  id: string;
  prompt: string;
  model: string;
  status: TurnStatus;
  idempotencyKey: string;
  responseId?: string;
  startedAt: number;
  finishedAt?: number;
  steps: Step[];
  answer?: string;
  refused?: boolean;
  manifest?: Manifest;
  summaryMd?: string;
  patch?: string;
  files?: FileRec[];
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; totalTokens?: number };
  costUsd?: number;
  sessionSpendAfter?: number;
  elapsedSec?: number;
  servedModel?: string;
  note?: string;
}

export interface RepoRec { fullName: string; branch: string; private: boolean; htmlUrl: string; cloneUrl: string }

export interface SessionRec {
  id: string;
  userId: string;
  groupId?: string;
  title: string;
  repo: RepoRec;
  harnessKey: HarnessKey;
  harnessId: string;
  model: string;
  status: TurnStatus;
  hrSessionId?: string;
  createdAt: number;
  updatedAt: number;
  turns: TurnRec[];
}

export interface GroupRec { id: string; userId: string; prompt: string; repo: RepoRec; sessionIds: string[]; createdAt: number }

interface Data { users: Record<string, UserRec>; sessions: Record<string, SessionRec>; groups: Record<string, GroupRec> }

// turbopackIgnore: never trace the data folder (user records, tokens) into server bundles.
const DIR = process.env.OPENHARNESS_DATA_DIR?.trim() || join(/*turbopackIgnore: true*/ process.cwd(), '.data');
const FILE = join(/*turbopackIgnore: true*/ DIR, 'db.json');

const g = globalThis as unknown as { __ohDB?: Data; __ohDBTimer?: NodeJS.Timeout | null };

function data(): Data {
  if (g.__ohDB) return g.__ohDB;
  if (!existsSync(/*turbopackIgnore: true*/ DIR)) mkdirSync(/*turbopackIgnore: true*/ DIR, { recursive: true, mode: 0o700 });
  let d: Data = { users: {}, sessions: {}, groups: {} };
  if (existsSync(/*turbopackIgnore: true*/ FILE)) {
    try { d = { ...d, ...(JSON.parse(readFileSync(/*turbopackIgnore: true*/ FILE, 'utf8')) as Data) }; } catch { /* corrupt: start fresh */ }
  }
  return (g.__ohDB = d);
}

function flush() {
  const d = data();
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(d), { mode: 0o600 });
  renameSync(/*turbopackIgnore: true*/ tmp, /*turbopackIgnore: true*/ FILE);
}

/** Debounced write-through. */
export function save(immediate = false) {
  if (immediate) {
    if (g.__ohDBTimer) clearTimeout(g.__ohDBTimer);
    g.__ohDBTimer = null;
    flush();
    return;
  }
  if (g.__ohDBTimer) return;
  g.__ohDBTimer = setTimeout(() => { g.__ohDBTimer = null; flush(); }, 250);
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url').replace(/[-_]/g, 'x')}`;

// users
export function getUser(id: string): UserRec | undefined { return data().users[id]; }
export function findUserByGithubId(githubId: number): UserRec | undefined {
  return Object.values(data().users).find((u) => u.githubId === githubId);
}
export function putUser(u: UserRec) { data().users[u.id] = u; save(); }

// sessions
export function getSession(id: string): SessionRec | undefined { return data().sessions[id]; }
export function putSession(s: SessionRec) { s.updatedAt = Date.now(); data().sessions[s.id] = s; save(); }
export function listSessions(userId: string): SessionRec[] {
  return Object.values(data().sessions).filter((s) => s.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function allSessions(): SessionRec[] { return Object.values(data().sessions); }
export function deleteSession(id: string) { delete data().sessions[id]; save(); }

// compare groups
export function getGroup(id: string): GroupRec | undefined { return data().groups[id]; }
export function putGroup(gr: GroupRec) { data().groups[gr.id] = gr; save(); }

/** A stable per-install secret for cookie signing when SESSION_SECRET is not set (local dev). */
export function localSecret(): Buffer {
  const f = join(/*turbopackIgnore: true*/ DIR, 'secret');
  data();
  if (!existsSync(/*turbopackIgnore: true*/ f)) writeFileSync(/*turbopackIgnore: true*/ f, randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(readFileSync(/*turbopackIgnore: true*/ f, 'utf8').trim(), 'hex');
}
