#!/usr/bin/env node
// Records real footage of the running app for the demo video (no mocks: real HarnessRouter tasks).
//   node demo/record.mjs            both takes (A: single session, B: race), in parallel
//   TAKES=A node demo/record.mjs    one take
// Output: demo/build/takes/<take>/{NNNNNN.jpg, frames.json}
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, 'demo', 'build');
const BASE = process.env.APP || 'http://localhost:3000';
const TAKES = (process.env.TAKES || 'A,B').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TASK_A = 'Add a once(type, handler) method that calls the handler at most one time and then unsubscribes it. Add tests for it and document it in the README.';
const FOLLOW_A = 'Walk me through how once() behaves if the handler emits the same event again. Answer briefly; no code changes.';
const TASK_B = 'Add a clear() method that removes every handler (or only the handlers of one event type when a type is given). Add tests and a README entry.';

// A visible cursor + click ripple (headless Chromium draws none).
const CURSOR = `
(() => {
  if (window.__fakeCursor) return; window.__fakeCursor = true;
  const add = () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform .02s linear;';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.5 L14.4 20.2 L11.3 13.6 L17.5 13.4 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const x0 = Number(sessionStorage.getItem('__cx') || -100), y0 = Number(sessionStorage.getItem('__cy') || -100);
    c.style.transform = 'translate(' + x0 + 'px,' + y0 + 'px)';
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; sessionStorage.setItem('__cx', e.clientX); sessionStorage.setItem('__cy', e.clientY); }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;width:34px;height:34px;border-radius:50%;border:2px solid rgba(139,124,255,.95);background:rgba(139,124,255,.25);left:' + (e.clientX - 17) + 'px;top:' + (e.clientY - 17) + 'px;transform:scale(.4);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out;';
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.6)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
})();`;

class Take {
  constructor(page, name) {
    this.page = page; this.name = name;
    this.dir = join(BUILD, 'takes', name);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.frames = []; this.marks = []; this.n = 0; this.pending = new Set(); this.cdp = null; this.casting = false;
    this.mouse = { x: 960, y: 540 };
  }
  log(...a) { console.log(`[${this.name} ${new Date().toISOString().slice(11, 19)}]`, ...a); }
  mark(label) { this.marks.push({ label, t: Date.now() / 1000 }); this.log('mark', label); }
  push(buf) {
    const f = `${String(++this.n).padStart(6, '0')}.jpg`;
    this.frames.push({ f, t: Date.now() / 1000 });
    const p = writeFile(join(this.dir, f), buf).finally(() => this.pending.delete(p));
    this.pending.add(p);
  }
  async cast(on) {
    if (!this.cdp) {
      this.cdp = await this.page.context().newCDPSession(this.page);
      this.cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
        this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
        if (this.casting) this.push(Buffer.from(data, 'base64'));
      });
    }
    if (on && !this.casting) { this.casting = true; await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 }); }
    if (!on && this.casting) { this.casting = false; await this.cdp.send('Page.stopScreencast').catch(() => {}); }
  }
  /** Screenshot every `ms` until done() is true (long agent runs). */
  async interval(ms, done, maxMs = 45 * 60 * 1000) {
    await this.cast(false);
    const t0 = Date.now();
    let checks = 0;
    for (;;) {
      const s = Date.now();
      try { this.push(await this.page.screenshot({ type: 'jpeg', quality: 88 })); } catch { /* navigating */ }
      if (++checks % 3 === 0 && (await done().catch(() => false))) break;
      if (Date.now() - t0 > maxMs) { this.log('interval: max time'); break; }
      await sleep(Math.max(0, ms - (Date.now() - s)));
    }
  }
  async still(ms) { // a frame now and at the end, so static moments have real duration even with screencast idle
    try { this.push(await this.page.screenshot({ type: 'jpeg', quality: 92 })); } catch { /* ignore */ }
    await sleep(ms);
  }
  async move(x, y, ms = 600) {
    const steps = Math.max(8, Math.round(ms / 16));
    const { x: x0, y: y0 } = this.mouse;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps; const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await sleep(ms / steps);
    }
    this.mouse = { x, y };
  }
  async click(locator, { ms = 650, pause = 220 } = {}) {
    const el = this.page.locator(locator).first();
    await el.waitFor({ state: 'visible', timeout: 30000 });
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    await this.move(b.x + b.width / 2, b.y + b.height / 2, ms);
    await sleep(pause);
    await this.page.mouse.down(); await sleep(70); await this.page.mouse.up();
    await sleep(250);
  }
  async type(text, delay = 30) {
    for (const ch of text) { await this.page.keyboard.type(ch); await sleep(delay + Math.random() * delay * 0.8); }
  }
  async wheel(dy, steps = 30, ms = 1500) {
    for (let i = 0; i < steps; i++) { await this.page.mouse.wheel(0, dy / steps); await sleep(ms / steps); }
  }
  async save() {
    await this.cast(false);
    await Promise.all([...this.pending]);
    writeFileSync(join(this.dir, 'frames.json'), JSON.stringify({ frames: this.frames, marks: this.marks }));
    this.log('saved', this.frames.length, 'frames');
  }
}

async function sessionDone(page, id) {
  return page.evaluate(async (sid) => {
    const r = await fetch(`/api/sessions/${sid}`, { cache: 'no-store' });
    const j = await r.json();
    const t = j.session.turns[j.session.turns.length - 1];
    return !['starting', 'running'].includes(t.status);
  }, id);
}
async function groupDone(page, id) {
  return page.evaluate(async (gid) => {
    const r = await fetch(`/api/compare/${gid}`, { cache: 'no-store' });
    const j = await r.json();
    return j.group.sessions.every((s) => !['starting', 'running'].includes(s.turns[0].status));
  }, id);
}

async function takeA(ctx, signedIn) {
  const page = await ctx.newPage();
  const T = new Take(page, 'A');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await sleep(800);
  await T.cast(true);
  T.mark('landing');
  await T.move(1200, 640, 900);
  await T.still(2600);
  await page.evaluate(() => window.scrollTo({ top: 760, behavior: 'smooth' }));
  await T.still(2400);
  await page.evaluate(() => window.scrollTo({ top: 1520, behavior: 'smooth' }));
  await T.still(2600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await T.still(1800);

  T.mark('compose');
  await T.click('button:has-text("Try the demo")');
  await page.waitForURL(/\/app$/);
  signedIn();
  await page.locator('[data-harness="qwen"]').waitFor({ timeout: 30000 });
  await T.still(1200);
  await T.click('[data-testid="repo-picker"]');
  await T.still(1600);
  await T.click('button:has-text("developit/mitt")');
  await T.still(500);
  await T.click('[data-harness="qwen"]');
  await T.still(900);
  await T.click('[data-testid="model-picker"]');
  await T.still(900);
  const list = page.locator('[data-model]').first();
  const lb = await list.boundingBox();
  await T.move(lb.x + 120, lb.y + 140, 500);
  await T.wheel(900, 40, 2200);
  await T.still(500);
  await T.wheel(-900, 20, 900);
  await T.click('[data-model="qwen3.8-max"]');
  await T.still(600);
  await T.click('[data-testid="task-input"]');
  await T.type(TASK_A, 24);
  await T.still(700);
  await T.click('[data-testid="run"]');
  await page.waitForURL(/\/app\/s\//, { timeout: 30000 });
  const sid = page.url().split('/').pop();
  T.mark('live');
  await T.still(2500);
  await T.interval(1000, () => sessionDone(page, sid));

  T.mark('result');
  await T.cast(true);
  await T.still(2500);
  await T.click('[data-testid="view-diff"]');
  await T.still(1400);
  const scroller = page.locator('main .overflow-y-auto').first();
  const sb = await scroller.boundingBox();
  await T.move(sb.x + sb.width / 2, sb.y + sb.height / 2, 500);
  await T.wheel(1400, 70, 7000);
  await T.still(1500);
  await T.wheel(1200, 50, 5000);
  await T.still(1500);
  await T.click('button:has-text("SUMMARY.md")');
  await T.still(1200);
  await T.wheel(700, 30, 3000);
  await T.still(2000);

  T.mark('followup');
  await T.click('[data-testid="followup-input"]');
  await T.type(FOLLOW_A, 26);
  await T.still(600);
  await T.click('[data-testid="followup-send"]');
  T.mark('followup-live');
  await T.still(2500);
  await T.interval(1000, () => sessionDone(page, sid));
  T.mark('followup-result');
  await T.cast(true);
  await T.still(1500);
  await T.move(sb.x + sb.width / 2, sb.y + sb.height / 2, 400);
  await T.wheel(-500, 30, 2500);
  await T.still(2000);
  await T.wheel(500, 20, 1500);
  await T.still(2500);
  T.mark('end');
  await T.save();
  writeFileSync(join(BUILD, 'takes', 'A', 'session.txt'), sid);
}

async function takeB(ctx) {
  const page = await ctx.newPage();
  const T = new Take(page, 'B');
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page.locator('[data-harness="qwen"]').waitFor({ timeout: 30000 });
  await sleep(1500);
  await T.cast(true);
  T.mark('race-compose');
  await T.still(800);
  await T.click('[data-testid="race-toggle"]');
  await T.still(500);
  // end with exactly Qwen Code + Codex selected, whatever the default was
  for (const k of ['claude-code', 'qwen', 'codex', 'minimax', 'gemini', 'opencode', 'kimi', 'grok', 'aider', 'openhands']) {
    const want = k === 'qwen' || k === 'codex';
    const on = (await page.getAttribute(`[data-harness="${k}"]`, 'data-selected')) === 'true';
    if (on !== want) await T.click(`[data-harness="${k}"]`);
  }
  const sel = await page.$$eval('[data-selected="true"]', (els) => els.map((e) => e.getAttribute('data-harness')));
  if (sel.sort().join(',') !== 'codex,qwen') throw new Error('race selection wrong: ' + sel.join(','));
  await T.still(800);
  await T.click('[data-row="codex"] [data-testid="model-picker"]');
  await T.still(700);
  await T.click('[data-model="gpt-6-luna"]');
  await T.still(600);
  const qm = await page.textContent('[data-row="qwen"] [data-testid="model-picker"]');
  const cm = await page.textContent('[data-row="codex"] [data-testid="model-picker"]');
  if (!qm.includes('qwen3.8-max') || !cm.includes('gpt-6-luna')) throw new Error(`race models wrong: ${qm} / ${cm}`);
  await T.click('[data-testid="task-input"]');
  await T.type(TASK_B, 22);
  await T.still(600);
  await T.click('[data-testid="run"]');
  await page.waitForURL(/\/app\/compare\//, { timeout: 30000 });
  const gid = page.url().split('/').pop();
  T.mark('race-live');
  await T.still(2000);
  await T.interval(1000, () => groupDone(page, gid));
  T.mark('race-result');
  await T.cast(true);
  await T.still(3000);
  const cards = page.locator('[data-testid="race-card"]');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const btn = cards.nth(i).locator('button:has-text("View diff")');
    if (await btn.count()) { await T.click(`[data-testid="race-card"] >> nth=${i} >> button:has-text("View diff")`); await T.still(1500); }
  }
  const scroller = page.locator('main .overflow-y-auto').first();
  const sb = await scroller.boundingBox();
  await T.move(sb.x + sb.width / 2, sb.y + sb.height * 0.6, 500);
  await T.wheel(900, 40, 4000);
  await T.still(2000);
  await T.wheel(-900, 30, 2500);
  await T.still(1500);
  T.mark('end');
  await T.save();
  writeFileSync(join(BUILD, 'takes', 'B', 'group.txt'), gid);
}

const TASK_C = 'Add a JSDoc comment above the emit function that documents its parameters. Docs-only change: verify with the type check only.';
const RACE_C = ['claude-code', 'gemini', 'minimax', 'kimi'];

/** Take C (v2): new landing → 4-agent side by side → Usage & budget. Fresh account. */
async function takeC(ctx) {
  const page = await ctx.newPage();
  const T = new Take(page, 'C');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await sleep(800);
  await T.cast(true);
  T.mark('landing');
  await T.move(1250, 620, 900);
  await T.still(2600);
  await page.evaluate(() => window.scrollTo({ top: 760, behavior: 'smooth' }));
  await T.still(2800);
  await page.evaluate(() => window.scrollTo({ top: 1520, behavior: 'smooth' }));
  await T.still(2200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await T.still(1600);

  T.mark('c-compose');
  await T.click('button:has-text("Try the demo")');
  await page.waitForURL(/\/app$/);
  await page.locator('[data-harness="qwen"]').waitFor({ timeout: 30000 });
  await T.still(900);
  await T.click('[data-testid="race-toggle"]');
  for (const k of ['claude-code', 'codex', 'qwen', 'minimax', 'gemini', 'opencode', 'kimi', 'grok', 'aider', 'openhands']) {
    const want = RACE_C.includes(k);
    const on = (await page.getAttribute(`[data-harness="${k}"]`, 'data-selected')) === 'true';
    if (on !== want) await T.click(`[data-harness="${k}"]`, { ms: 420, pause: 120 });
  }
  const sel = await page.$$eval('[data-selected="true"]', (els) => els.map((e) => e.getAttribute('data-harness')));
  if (sel.sort().join(',') !== [...RACE_C].sort().join(',')) throw new Error('take C selection wrong: ' + sel.join(','));
  await T.still(700);
  await T.click('[data-testid="task-input"]');
  await T.type(TASK_C, 16);
  await T.still(500);
  await T.click('[data-testid="run"]');
  await page.waitForURL(/\/app\/compare\//, { timeout: 30000 });
  const gid = page.url().split('/').pop();
  T.mark('c-live');
  await T.still(2000);
  await T.interval(1000, () => groupDone(page, gid));
  T.mark('c-result');
  await T.cast(true);
  await T.still(3500);

  T.mark('c-usage');
  await T.click('[data-testid="nav-usage"]');
  await page.waitForURL(/\/app\/usage/);
  await page.locator('[data-testid="usage-row"]').first().waitFor({ timeout: 20000 });
  await T.still(1800);
  const rows = page.locator('[data-testid="usage-row"]');
  const rb = await rows.nth(0).boundingBox();
  await T.move(rb.x + rb.width * 0.45, rb.y + rb.height / 2, 600);
  await T.still(1600);
  // a budget the month's real spend sits at roughly half of
  const spent = await page.evaluate(async () => (await (await fetch('/api/usage', { cache: 'no-store' })).json()).usage.spendUsd);
  const budget = Math.max(1, Math.ceil(spent / 0.45));
  await T.click('[data-testid="budget-input"]');
  await T.type(String(budget), 90);
  await T.still(300);
  await T.click('[data-testid="budget-save"]');
  await T.still(3200);
  T.mark('c-end');
  await T.save();
  writeFileSync(join(BUILD, 'takes', 'C', 'group.txt'), `${gid} budget=${budget} spent=${spent}`);
}

/** Take C2: re-shoot take C's result + Usage screens for the same account (no new agent runs). */
async function takeC2(ctx) {
  const { token, gid } = JSON.parse(readFileSync(process.env.C2_FILE, 'utf8'));
  await ctx.addCookies([{ name: 'oh_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  const T = new Take(page, 'C2');
  await page.goto(`${BASE}/app/compare/${gid}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => fetch('/api/usage/budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthlyUsd: null }) }));
  await page.locator('[data-testid="race-card"]').first().waitFor({ timeout: 20000 });
  await sleep(1200);
  await T.cast(true);
  T.mark('c2-result');
  await T.move(1500, 700, 600);
  await T.still(3500);
  T.mark('c2-usage');
  await T.click('[data-testid="nav-usage"]');
  await page.waitForURL(/\/app\/usage/);
  await page.locator('[data-testid="usage-row"]').first().waitFor({ timeout: 20000 });
  await T.still(1800);
  const rb = await page.locator('[data-testid="usage-row"]').nth(0).boundingBox();
  await T.move(rb.x + rb.width * 0.45, rb.y + rb.height / 2, 600);
  await T.still(1600);
  await T.click('[data-testid="budget-input"]');
  await T.type('3', 90);
  await T.still(300);
  await T.click('[data-testid="budget-save"]');
  await T.still(3200);
  T.mark('c2-end');
  await T.save();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
await ctx.addInitScript(CURSOR);
if (TAKES.length === 1 && TAKES[0] === 'C2') {
  await takeC2(ctx);
  await browser.close();
  console.log('done');
  process.exit(0);
}
if (TAKES.length === 1 && TAKES[0] === 'C') {
  await takeC(ctx);
  await browser.close();
  console.log('done');
  process.exit(0);
}
let resolveSignedIn;
const signedIn = new Promise((r) => { resolveSignedIn = r; });
const jobs = [];
if (TAKES.includes('A')) jobs.push(takeA(ctx, () => resolveSignedIn()));
else {
  // sign in first for a lone take B
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`); await p.click('button:has-text("Try the demo")'); await p.waitForURL(/\/app$/); await p.close();
  resolveSignedIn();
}
if (TAKES.includes('B')) jobs.push(signedIn.then(() => sleep(15000)).then(() => takeB(ctx)));
await Promise.all(jobs);
await browser.close();
console.log('done');
