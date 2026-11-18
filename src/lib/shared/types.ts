// What the browser may see. Built by src/lib/server/views.ts from the server records: no
// HarnessRouter ids, no download URLs, no keys, no raw upstream errors.
import type { HarnessKey } from './harness-meta';

export type TurnStatus = 'starting' | 'running' | 'completed' | 'incomplete' | 'failed' | 'cancelled';
export type ToolKind = 'run' | 'edit' | 'write' | 'read' | 'search' | 'plan' | 'web' | 'tool';

export interface ToolStep {
  kind: 'tool';
  key: string;
  tool: ToolKind;
  name: string;
  detail: string;
  output?: string;
  done: boolean;
  at: number; // ms since the turn started
}
export interface MessageStep {
  kind: 'message';
  key: string;
  text: string;
  done: boolean;
  at: number;
}
export type Step = ToolStep | MessageStep;

export interface Manifest {
  title?: string;
  summary?: string;
  changed_files?: string[];
  tests?: 'passed' | 'failed' | 'not_run' | string;
  verified?: boolean;
}

export interface PublicFile { path: string; bytes: number }

export interface PublicTurn {
  id: string;
  prompt: string;
  model: string;
  servedModel?: string;
  status: TurnStatus;
  startedAt: number;
  finishedAt?: number;
  steps: Step[];
  answer?: string;
  refused?: boolean;
  manifest?: Manifest;
  summaryMd?: string;
  patch?: string;
  files?: PublicFile[];
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; totalTokens?: number };
  costUsd?: number;
  elapsedSec?: number;
  note?: string; // plain-language status note (e.g. why it stopped)
}

export interface PublicRepo {
  fullName: string;
  branch: string;
  private: boolean;
  htmlUrl: string;
}

export interface PublicSession {
  id: string;
  title: string;
  repo: PublicRepo;
  harness: HarnessKey;
  model: string;
  status: TurnStatus;
  createdAt: number;
  updatedAt: number;
  groupId?: string;
  turns: PublicTurn[];
}

export interface SessionSummary {
  id: string;
  title: string;
  repo: string;
  harness: HarnessKey;
  model: string;
  status: TurnStatus;
  updatedAt: number;
  groupId?: string;
  turns: number;
}

export interface PublicUser {
  id: string;
  login: string;
  name: string;
  avatarUrl: string;
  mode: 'github' | 'demo';
}

export interface RepoOption {
  fullName: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  language?: string;
  stars?: number;
  pushedAt?: string;
  htmlUrl: string;
}

export interface CatalogHarness {
  key: HarnessKey;
  label: string;
  maker: string;
  monogram: string;
  color: string;
  tagline: string;
  defaultModel: string;
  models: string[];
  available: boolean;
}

/** Server-Sent Events from /api/sessions/:id/stream */
export type LiveEvent =
  | { type: 'snapshot'; session: PublicSession }
  | { type: 'step'; turnId: string; step: Step }
  | { type: 'delta'; turnId: string; key: string; delta: string }
  | { type: 'turn'; turn: PublicTurn; sessionStatus: TurnStatus };

export interface UsageRow {
  harness: HarnessKey;
  model: string;
  tasks: number;
  completed: number;
  totalUsd: number;
  totalSec: number;
  timedTasks: number;
  testsPassed: number;
  testsKnown: number;
}

export interface PublicUsage {
  monthStart: number;
  spendUsd: number;
  tasks: number;
  combos: number;
  harnesses: number;
  budgetUsd: number | null;
  byCombo: UsageRow[];
  recent: Array<{
    sessionId: string; title: string; harness: HarnessKey; model: string; status: TurnStatus;
    costUsd?: number; elapsedSec?: number; startedAt: number; groupId?: string;
  }>;
}

export interface PublicGroup {
  id: string;
  prompt: string;
  repo: PublicRepo;
  createdAt: number;
  sessions: PublicSession[];
}
