#!/usr/bin/env node
// Developer smoke test: stream ONE task on one of OUR harnesses and summarize what came back.
//   node scripts/hr-smoke.mjs <feature_key> [--model M] [--user U] "<input>"
// Not the product path (that is the app's /api routes); this only checks a harness responds.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.harnessrouter.ai';
function apiKey() {
  const env = process.env.HR_API_KEY?.trim();
  if (env) return env;
  const lines = readFileSync(join(ROOT, '.env.harnessrouter'), 'utf8').split('\n').filter((l) => l.trim());
  return lines[0].slice('HR_API_KEY='.length).trim();
}

const argv = process.argv.slice(2);
const featureKey = argv.shift();
let model; let user = 'dev_smoke';
while (argv[0]?.startsWith('--')) {
  const flag = argv.shift();
  if (flag === '--model') model = argv.shift();
  else if (flag === '--user') user = argv.shift();
}
const input = argv.join(' ');
const setup = JSON.parse(readFileSync(join(ROOT, 'harnessrouter.json'), 'utf8')).setups.find((s) => s.feature_key === featureKey);
if (!setup || !input) { console.error('usage: hr-smoke.mjs <feature_key> [--model M] "<input>"'); process.exit(1); }

const body = { input, user, metadata: { harness_id: setup.harness_id }, stream: true };
if (model) body.model = model;
const t0 = Date.now();
const res = await fetch(`${API}/v1/responses`, {
  method: 'POST', redirect: 'manual',
  headers: { Authorization: `Bearer ${apiKey()}`, 'UHP-Version': '2026-09-28', 'Content-Type': 'application/json', Accept: 'text/event-stream', 'Idempotency-Key': randomUUID() },
  body: JSON.stringify(body),
});
if (!res.ok) { console.error('HTTP', res.status, (await res.text()).slice(0, 400)); process.exit(2); }

const counts = {};
let terminal = null; let ids = null;
const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, '\n');
  let i;
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const frame = buf.slice(0, i); buf = buf.slice(i + 2);
    const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data || data === '[DONE]') continue;
    let ev; try { ev = JSON.parse(data); } catch { continue; }
    counts[ev.type] = (counts[ev.type] || 0) + 1;
    if (!ids && ev.response?.metadata?.session_id) { ids = { response: ev.response.id, session: ev.response.metadata.session_id }; console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] created`, JSON.stringify(ids)); }
    if (ev.type === 'response.output_item.added' && ev.item?.type === 'function_call') console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] tool: ${ev.item.name}`);
    if (ev.type === 'response.output_item.done' && ev.item?.type === 'function_call') console.log(`      args: ${String(ev.item.arguments || '').slice(0, 160).replace(/\n/g, ' ')}`);
    if (ev.type === 'response.output_item.done' && ev.item?.type === 'function_call_output') console.log(`      out: ${String(ev.item.output || '').slice(0, 200).replace(/\n/g, ' ')}`);
    if (['response.completed', 'response.incomplete', 'response.failed'].includes(ev.type)) terminal = ev.response;
  }
}
console.log(`\n[${((Date.now() - t0) / 1000).toFixed(1)}s] events:`, JSON.stringify(counts));
if (!terminal) { console.log('no terminal event'); process.exit(3); }
const msgs = (terminal.output || []).filter((o) => o.type === 'message');
const last = msgs[msgs.length - 1];
console.log('status:', terminal.status, '| model:', terminal.model, '| served:', terminal.served_model, '| usage:', JSON.stringify(terminal.usage), '| incomplete:', JSON.stringify(terminal.incomplete_details), '| error:', JSON.stringify(terminal.error));
console.log('answer:\n' + (last?.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join(''));
const ann = (last?.content || []).flatMap((c) => c.annotations || []);
console.log('annotations:', ann.map((a) => a.filename).join(', '));
if (ids) {
  const f = await fetch(`${API}/v1/sessions/${ids.session}/files`, { headers: { Authorization: `Bearer ${apiKey()}`, 'UHP-Version': '2026-09-28' }, redirect: 'manual' });
  const fj = await f.json();
  console.log('session files:', (fj.files || []).map((x) => `${x.path}(${x.bytes})`).slice(0, 40).join(', '), `count=${fj.count}`);
  const s = await fetch(`${API}/v1/sessions/${ids.session}`, { headers: { Authorization: `Bearer ${apiKey()}`, 'UHP-Version': '2026-09-28' }, redirect: 'manual' });
  const sj = await s.json();
  console.log('session:', JSON.stringify({ status: sj.status, spend_usd: sj.spend_usd, elapsed: sj.elapsed, model: sj.model, backend: sj.backend }));
}
