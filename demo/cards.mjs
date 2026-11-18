#!/usr/bin/env node
// Records the animated HTML scene cards, timed to the narration.
//   node demo/cards.mjs [sceneId...]
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILD, LEAD, TAIL, ROOT, audioDuration, wordTime } from './lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// scene id -> [html file, cue name -> [phrase, nth, offset seconds], extra hold seconds]
const CARDS = {
  '01-hook': ['hook.html', {
    agent: ['coding agent', 0, -0.2], model: ['a model', 0, 0.1], harness: ['a harness', 0, 0.1],
    tools: ['tools', 0, 0], prompts: ['prompts', 0, 0], loop: ['loop', 0, 0], sub: ['OpenCode', 0, 0], tag: ['But the harness', 0, 0],
  }, 0.4],
  '02-problem': ['problem.html', {
    h0: ['Claude Code', 0, 0], h1: ['Codex', 0, 0], h2: ['Qwen Code', 0, 0], h3: ['MiniMax', 0, 0], h4: ['Gemini CLI', 0, 0],
    install: ['separate install', 0, 0.3], login: ['separate login', 0, 0.3], more: ['way of working', 0, 0.2], count: ['babysitting', 0, 0.2],
  }, 0.8],
  '08-arch': ['arch.html', {
    browser: ['Under the hood', 0, 0.2], backend: ['Next.js', 0, 0], api: ['Responses API', 0, 0], bases: ['one harness per', 0, 0],
    keys: ['API keys', 0, 0], keys2: ['API keys', 0, 1.2],
  }, 0.8],
  '09-close': ['close.html', {
    name: ['OpenHarness', 0, -0.1], t1: ['Any harness', 0, 0], t2: ['Any model', 0, 0], t3: ['Your repo', 0, 0], meta: ['Your repo', 0, 0.9],
  }, 2.6],
};

const only = new Set(process.argv.slice(2));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

for (const [id, [file, cueDefs, hold]] of Object.entries(CARDS)) {
  if (only.size && !only.has(id)) continue;
  const dur = LEAD + audioDuration(id) + TAIL + hold;
  const cues = {};
  for (const [name, [phrase, nth, off]] of Object.entries(cueDefs)) cues[name] = Math.max(0, LEAD + wordTime(id, phrase, nth) + off);
  const dir = join(BUILD, 'takes', `card-${id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  await page.setContent('<html style="background:#08090c"></html>');
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const pending = [];
  let n = 0;
  let on = true;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (!on) return;
    const f = `${String(++n).padStart(6, '0')}.jpg`;
    frames.push({ f, t: Date.now() / 1000 });
    pending.push(writeFile(join(dir, f), Buffer.from(data, 'base64')));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 1920, maxHeight: 1080 });
  await page.goto(`file://${join(ROOT, 'demo', 'scenes', file)}#${encodeURIComponent(JSON.stringify(cues))}`);
  const start = Date.now() / 1000;
  await sleep(dur * 1000);
  // one last frame so the final still has its full duration
  const last = await page.screenshot({ type: 'jpeg', quality: 94 });
  const f = `${String(++n).padStart(6, '0')}.jpg`;
  frames.push({ f, t: Date.now() / 1000 });
  pending.push(writeFile(join(dir, f), last));
  on = false;
  await cdp.send('Page.stopScreencast');
  await Promise.all(pending);
  const end = Date.now() / 1000;
  writeFileSync(join(dir, 'frames.json'), JSON.stringify({ frames, marks: [{ label: 'start', t: start }, { label: 'end', t: end }] }));
  console.log(id, `${frames.length} frames, ${dur.toFixed(1)}s`, JSON.stringify(Object.fromEntries(Object.entries(cues).map(([k, v]) => [k, +v.toFixed(2)]))));
  await page.close();
}
await browser.close();
