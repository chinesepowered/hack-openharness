#!/usr/bin/env node
// HarnessRouter admin CLI for OpenHarness (developer-only; never shipped to the browser).
//
//   node scripts/hr-admin.mjs me                 which Workspace the key acts in
//   node scripts/hr-admin.mjs bases [id...]      bases and their available models
//   node scripts/hr-admin.mjs harnesses          names/ids/bases in the Workspace (read-only)
//   node scripts/hr-admin.mjs ensure             reuse-by-name or create every setup in
//                                                harness/setups.json, then write harnessrouter.json
//   node scripts/hr-admin.mjs show <harness_id>  the live record of one of OUR harnesses
//   node scripts/hr-admin.mjs sync               fetch live (ETag) -> full PUT with If-Match for
//                                                every setup whose model/instructions changed
//
// The key comes from HR_API_KEY or the one-line .env.harnessrouter file. It is never printed,
// never placed in argv, and only ever sent to https://api.harnessrouter.ai (redirects refused).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.harnessrouter.ai';
const UHP_VERSION = '2026-09-28';

function apiKey() {
  const env = process.env.HR_API_KEY?.trim();
  if (env) return env;
  const lines = readFileSync(join(ROOT, '.env.harnessrouter'), 'utf8').split('\n').filter((l) => l.trim());
  if (lines.length !== 1 || !lines[0].startsWith('HR_API_KEY=')) throw new Error('.env.harnessrouter must hold one HR_API_KEY line');
  return lines[0].slice('HR_API_KEY='.length).trim();
}

async function call(method, path, body, extra = {}) {
  const headers = { Authorization: `Bearer ${apiKey()}`, 'UHP-Version': UHP_VERSION, Accept: 'application/json', ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const e = json?.error || {};
    const err = new Error(`${method} ${path} -> ${res.status} ${e.code || ''} ${e.message || (typeof json?.detail === 'string' ? json.detail : '')}`.trim());
    err.status = res.status; err.code = e.code; err.detail = e.detail;
    throw err;
  }
  return { json, etag: res.headers.get('etag') };
}

const SETUPS_FILE = join(ROOT, 'harness', 'setups.json');
const HANDOFF_FILE = join(ROOT, 'harnessrouter.json');

function readInstructions(setup) {
  return readFileSync(join(ROOT, 'harness', setup.instructions_file), 'utf8').trim();
}

function entryFromLive(live, featureKey) {
  return { feature_key: featureKey, harness_id: live.id, name: live.name, base: live.base, model: live.defaultModel, instructions: live.systemPrompt };
}

function writeHandoff(entries) {
  writeFileSync(HANDOFF_FILE, JSON.stringify({ setups: entries }, null, 2) + '\n');
}

function bodyFromLive(live) {
  // live (camelCase) -> request (snake_case); PUT replaces every field, so carry all of them over.
  const map = [['name', 'name'], ['base', 'base'], ['defaultModel', 'default_model'], ['systemPrompt', 'system_prompt'],
    ['mcpServers', 'mcp_servers'], ['skills', 'skills'], ['plugins', 'plugins'], ['additionalHeaders', 'additional_headers'],
    ['env', 'env'], ['maxStep', 'max_step'], ['timeoutSeconds', 'timeout_seconds'], ['maxCostUsd', 'max_cost_usd'],
    ['reasoningEffort', 'reasoning_effort'], ['environment', 'environment'], ['disabledTools', 'disabled_tools']];
  const body = {};
  for (const [c, s] of map) if (c in live) body[s] = live[c];
  if (live.engineMember) body.engine_member = live.engineMember;
  return body;
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

try {
  if (cmd === 'me') {
    const { json } = await call('GET', '/v1/me');
    console.log(JSON.stringify({ workspace: json.workspace, workspace_name: json.workspace_name, org_name: json.org_name }, null, 2));
  } else if (cmd === 'bases') {
    const { json } = await call('GET', '/v1/bases');
    const want = new Set(args);
    for (const b of json.bases || []) {
      if (want.size && !want.has(b.id)) continue;
      const avail = (b.models || []).filter((m) => m.available).map((m) => m.id);
      console.log(`${b.id.padEnd(14)} ${String(b.label).padEnd(18)} status=${b.status} default=${b.defaultModel} takesSkills=${b.takesSkills}\n    available(${avail.length}): ${avail.join(', ')}`);
    }
    console.log('runtimeDefaults', JSON.stringify(json.runtimeDefaults));
  } else if (cmd === 'harnesses') {
    const { json } = await call('GET', '/v1/harnesses');
    for (const h of json.harnesses || []) console.log(`${h.id}  base=${h.base}  model=${h.defaultModel}  name=${JSON.stringify(h.name)}`);
    console.log(`(${(json.harnesses || []).length} harnesses)`);
  } else if (cmd === 'ensure') {
    const setups = JSON.parse(readFileSync(SETUPS_FILE, 'utf8'));
    const { json: list } = await call('GET', '/v1/harnesses');
    const { json: cat } = await call('GET', '/v1/bases');
    const bases = new Map((cat.bases || []).map((b) => [b.id, b]));
    const entries = [];
    for (const s of setups.setups) {
      const instructions = readInstructions(s);
      const found = (list.harnesses || []).find((h) => h.name === s.name);
      if (found) {
        const diffs = [];
        if (found.base !== s.base) diffs.push('base');
        if (found.defaultModel !== s.model) diffs.push('model');
        if (found.systemPrompt !== instructions) diffs.push('instructions');
        console.log(JSON.stringify({ status: 'REUSED', feature_key: s.feature_key, harness_id: found.id, name: found.name, base: found.base, model: found.defaultModel, differs_from_plan: diffs }));
        entries.push(entryFromLive(found, s.feature_key));
        continue;
      }
      const b = bases.get(s.base);
      if (!b) { console.log(JSON.stringify({ status: 'BASE_NOT_AVAILABLE', feature_key: s.feature_key, base: s.base })); continue; }
      const avail = (b.models || []).filter((m) => m.available).map((m) => m.id);
      if (!avail.includes(s.model)) { console.log(JSON.stringify({ status: 'MODEL_NOT_AVAILABLE', feature_key: s.feature_key, base: s.base, model: s.model, available: avail })); continue; }
      const body = { name: s.name, base: s.base, default_model: s.model, system_prompt: instructions, mcp_servers: [], skills: [] };
      if (s.max_step) body.max_step = s.max_step;
      if (s.timeout_seconds) body.timeout_seconds = s.timeout_seconds;
      if (s.max_cost_usd) body.max_cost_usd = s.max_cost_usd;
      const { json: created } = await call('POST', '/v1/harnesses', body, { 'Idempotency-Key': `openharness-${s.feature_key}-v1` });
      console.log(JSON.stringify({ status: 'CREATED', feature_key: s.feature_key, harness_id: created.id, name: created.name, base: created.base, model: created.defaultModel }));
      entries.push(entryFromLive(created, s.feature_key));
    }
    writeHandoff(entries);
    console.log(`wrote ${HANDOFF_FILE} (${entries.length} setups)`);
  } else if (cmd === 'show') {
    const id = args[0];
    const { json, etag } = await call('GET', `/v1/harnesses/${encodeURIComponent(id)}`);
    console.log(JSON.stringify({ etag, id: json.id, name: json.name, base: json.base, model: json.defaultModel, maxStep: json.maxStep, timeoutSeconds: json.timeoutSeconds, maxCostUsd: json.maxCostUsd, instructions: json.systemPrompt }, null, 2));
  } else if (cmd === 'sync') {
    // Change flow from the HarnessRouter guide: fetch live + ETag, live wins over the file if it
    // was edited elsewhere, apply our change as a FULL PUT with If-Match, re-read and compare.
    const setups = JSON.parse(readFileSync(SETUPS_FILE, 'utf8'));
    const handoff = existsSync(HANDOFF_FILE) ? JSON.parse(readFileSync(HANDOFF_FILE, 'utf8')) : { setups: [] };
    const entries = [];
    for (const s of setups.setups) {
      const prev = handoff.setups.find((e) => e.feature_key === s.feature_key);
      if (!prev) { console.log(JSON.stringify({ status: 'NOT_CREATED', feature_key: s.feature_key, next: 'run ensure first' })); continue; }
      for (let attempt = 0; attempt < 2; attempt++) {
        const { json: live, etag } = await call('GET', `/v1/harnesses/${encodeURIComponent(prev.harness_id)}`);
        const editedElsewhere = ['name', 'base', 'model', 'instructions'].filter((k) => prev[k] !== entryFromLive(live, s.feature_key)[k]);
        const instructions = readInstructions(s);
        const body = { ...bodyFromLive(live), default_model: s.model, system_prompt: instructions };
        if (s.max_step !== undefined) body.max_step = s.max_step;
        if (s.timeout_seconds !== undefined) body.timeout_seconds = s.timeout_seconds;
        if (s.max_cost_usd !== undefined) body.max_cost_usd = s.max_cost_usd;
        if (JSON.stringify(body) === JSON.stringify(bodyFromLive(live))) {
          console.log(JSON.stringify({ status: 'UNCHANGED', feature_key: s.feature_key, harness_id: live.id, edited_elsewhere: editedElsewhere }));
          entries.push(entryFromLive(live, s.feature_key));
          break;
        }
        try {
          await call('PUT', `/v1/harnesses/${encodeURIComponent(live.id)}`, body, etag ? { 'If-Match': etag } : {});
        } catch (e) {
          if (e.status === 412 && attempt === 0) continue; // changed meanwhile: fetch again and redo
          throw e;
        }
        const { json: after } = await call('GET', `/v1/harnesses/${encodeURIComponent(live.id)}`);
        const mismatched = Object.keys(body).filter((k) => JSON.stringify(bodyFromLive(after)[k]) !== JSON.stringify(body[k]));
        console.log(JSON.stringify({ status: mismatched.length ? 'READBACK_MISMATCH' : 'UPDATED', feature_key: s.feature_key, harness_id: after.id, mismatched, edited_elsewhere: editedElsewhere }));
        entries.push(entryFromLive(after, s.feature_key));
        break;
      }
    }
    writeHandoff(entries);
  } else if (cmd === 'spend') {
    // Reconcile spend across OUR harnesses' sessions (GET /v1/sessions?harness=…), per harness.
    const handoff = JSON.parse(readFileSync(HANDOFF_FILE, 'utf8'));
    let total = 0; let count = 0;
    const rows = [];
    for (const s of handoff.setups) {
      let cursor = ''; let spend = 0; let n = 0; let secs = 0;
      for (let page = 0; page < 20; page++) {
        const q = `/v1/sessions?harness=${encodeURIComponent(s.harness_id)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const { json } = await call('GET', q);
        for (const x of json.sessions || []) { spend += Number(x.spend_usd) || 0; secs += Number(x.elapsed) || 0; n++; }
        if (!json.cursor || !(json.sessions || []).length) break;
        cursor = json.cursor;
      }
      rows.push({ feature_key: s.feature_key, sessions: n, spend_usd: Math.round(spend * 10000) / 10000, latest_turn_minutes: Math.round(secs / 6) / 10 }); // the list's `elapsed` covers only the latest turn
      total += spend; count += n;
    }
    for (const r of rows) console.log(JSON.stringify(r));
    console.log(JSON.stringify({ total_sessions: count, total_spend_usd: Math.round(total * 100) / 100 }));
  } else if (cmd === 'cancel-running') {
    // Stop runaway tasks: cancel every running turn in an OpenHarness data dir (optionally one race group).
    const dataDir = args[0] || join(ROOT, '.data');
    const group = args[1];
    const db = JSON.parse(readFileSync(join(dataDir, 'db.json'), 'utf8'));
    for (const s of Object.values(db.sessions || {})) {
      if (group && s.groupId !== group) continue;
      const t = s.turns[s.turns.length - 1];
      if (!t || !['starting', 'running'].includes(t.status) || !t.responseId) continue;
      const { json } = await call('POST', `/v1/responses/${encodeURIComponent(t.responseId)}/cancel`, {});
      console.log(JSON.stringify({ session: s.id, harness: s.harnessKey, model: t.model, status: json.status }));
    }
  } else {
    console.log('usage: node scripts/hr-admin.mjs me|bases [id..]|harnesses|ensure|show <id>|sync|cancel-running [dataDir] [groupId]');
    process.exit(1);
  }
} catch (e) {
  console.error(JSON.stringify({ status: 'ERROR', message: e.message, code: e.code, detail: e.detail }));
  process.exit(2);
}
