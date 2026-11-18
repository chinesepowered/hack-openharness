import 'server-only';
import type { GroupRec, SessionRec, TurnRec } from './db';
import { getSession } from './db';
import type { PublicGroup, PublicSession, PublicTurn, SessionSummary } from '@/lib/shared/types';

// The ONLY way records reach the browser. Server-only fields (harnessId, hrSessionId,
// responseId, idempotencyKey, fileIds, tokens) are dropped here by construction.

export function publicTurn(t: TurnRec): PublicTurn {
  return {
    id: t.id,
    prompt: t.prompt,
    model: t.model,
    servedModel: t.servedModel,
    status: t.status,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    steps: t.steps,
    answer: t.answer,
    refused: t.refused,
    manifest: t.manifest,
    summaryMd: t.summaryMd,
    patch: t.patch,
    files: t.files?.map((f) => ({ path: f.path, bytes: f.bytes })),
    usage: t.usage,
    costUsd: t.costUsd,
    elapsedSec: t.elapsedSec,
    note: t.note,
  };
}

export function publicSession(s: SessionRec): PublicSession {
  return {
    id: s.id,
    title: s.title,
    repo: { fullName: s.repo.fullName, branch: s.repo.branch, private: s.repo.private, htmlUrl: s.repo.htmlUrl },
    harness: s.harnessKey,
    model: s.model,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    groupId: s.groupId,
    turns: s.turns.map(publicTurn),
  };
}

export function sessionSummary(s: SessionRec): SessionSummary {
  const last = s.turns[s.turns.length - 1];
  return {
    id: s.id, title: s.title, repo: s.repo.fullName, harness: s.harnessKey, model: last?.model || s.model,
    status: s.status, updatedAt: s.updatedAt, groupId: s.groupId, turns: s.turns.length,
  };
}

export function publicGroup(gr: GroupRec): PublicGroup {
  return {
    id: gr.id, prompt: gr.prompt, createdAt: gr.createdAt,
    repo: { fullName: gr.repo.fullName, branch: gr.repo.branch, private: gr.repo.private, htmlUrl: gr.repo.htmlUrl },
    sessions: gr.sessionIds.map((id) => getSession(id)).filter((s): s is SessionRec => Boolean(s)).map(publicSession),
  };
}
