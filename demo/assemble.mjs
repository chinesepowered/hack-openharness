#!/usr/bin/env node
// Assembles demo/build/openharness-demo.mp4 from the recorded takes, the cards and the narration.
//   node demo/assemble.mjs            (NOCAPTIONS=1 to skip burned-in captions)
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIO, BUILD, LEAD, TAIL, alignment, audioDuration, ff, narration, probeDuration } from './lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = join(BUILD, 'cut');
mkdirSync(OUT, { recursive: true });
const FPS = 30;
const FADE = 0.22;

// ── edit decision list ──────────────────────────────────────────────────────────────────────────
// Each segment plays under one narration clip. Parts: {take, from, to} with `speed` (fixed) or
// `fill` (gets whatever time is left, badge shown when sped up). `hold` adds seconds of picture.
const EDL = [
  { id: '01-hook', parts: [{ take: 'card-01-hook', from: 'start', to: 'end', speed: 1 }] },
  { id: '02-problem', parts: [{ take: 'card-02-problem', from: 'start', to: 'end', speed: 1 }] },
  { id: '03-solution', parts: [{ take: 'A', from: 'landing', to: 'compose', fill: true }] },
  { id: '04-compose', parts: [{ take: 'A', from: 'compose', to: 'live', fill: true }] },
  { id: '05-live', parts: [{ take: 'A', from: 'live', to: 'result', fill: true, badge: true }] },
  { id: '06-result', parts: [{ take: 'A', from: 'result', to: 'followup', fill: true }, { take: 'A', from: 'followup', to: 'end', speed: 1.6 }] },
  { id: '07-race', parts: [
    { take: 'B', from: 'race-compose', to: 'race-live', speed: 1.9 },
    { take: 'B', from: 'race-live', to: 'race-result', fill: true, badge: true },
    { take: 'B', from: 'race-result', to: 'end', speed: 1.5 },
  ] },
  { id: '08-arch', parts: [{ take: 'card-08-arch', from: 'start', to: 'end', speed: 1 }] },
  { id: '09-close', parts: [{ take: 'card-09-close', from: 'start', to: 'end', speed: 1 }] },
];

const takes = {};
function take(name) {
  if (!takes[name]) {
    const dir = join(BUILD, 'takes', name);
    takes[name] = { dir, ...JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8')) };
  }
  return takes[name];
}
function markTime(t, label) {
  const m = t.marks.find((x) => x.label === label);
  if (!m) throw new Error(`mark ${label} missing`);
  return m.t;
}

/** Concat-demuxer list for frames in [from, to): each frame lasts until the next one. */
function frameList(t, from, to, file) {
  const fr = t.frames;
  let i = fr.findIndex((f) => f.t >= from);
  if (i < 0) i = fr.length - 1;
  if (i > 0 && fr[i].t > from) i -= 1; // the frame on screen at `from`
  const lines = [];
  let last = null;
  for (let k = i; k < fr.length && fr[k].t < to; k++) {
    const start = Math.max(fr[k].t, from);
    const next = k + 1 < fr.length ? Math.min(fr[k + 1].t, to) : to;
    const d = Math.max(0.001, next - start);
    lines.push(`file '${join(t.dir, fr[k].f)}'`, `duration ${d.toFixed(4)}`);
    last = fr[k].f;
  }
  if (last) lines.push(`file '${join(t.dir, last)}'`);
  writeFileSync(file, lines.join('\n') + '\n');
  return to - from;
}

async function renderBadges(speeds) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 120 }, deviceScaleFactor: 1 });
  for (const s of speeds) {
    const f = join(OUT, `badge-${s}.png`);
    if (existsSync(f)) continue;
    await page.setContent(`<html><body style="margin:0;background:transparent;font-family:Inter,sans-serif">
      <div id="b" style="display:inline-flex;align-items:center;gap:12px;padding:12px 20px;border-radius:999px;background:rgba(12,14,19,.82);border:1px solid rgba(139,124,255,.55);color:#e8eaf0;font-size:24px;font-weight:600;box-shadow:0 10px 40px rgba(0,0,0,.5)">
      <span style="color:#38d0ff">▶▶</span> sped up ${s}×</div></body></html>`);
    const box = await page.locator('#b').boundingBox();
    await page.screenshot({ path: f, omitBackground: true, clip: { x: 0, y: 0, width: Math.ceil(box.width) + 2, height: Math.ceil(box.height) + 2 } });
  }
  await browser.close();
}

// ── plan ────────────────────────────────────────────────────────────────────────────────────────
const plan = [];
for (const seg of EDL) {
  const D = LEAD + audioDuration(seg.id) + TAIL + (seg.hold || 0);
  const parts = seg.parts.map((p) => {
    const t = take(p.take);
    const from = markTime(t, p.from);
    const to = markTime(t, p.to);
    return { ...p, raw: to - from, fromT: from, toT: to };
  });
  const fixed = parts.filter((p) => !p.fill).reduce((a, p) => a + p.raw / p.speed, 0);
  const fills = parts.filter((p) => p.fill);
  const left = Math.max(0, D - fixed);
  const fillRaw = fills.reduce((a, p) => a + p.raw, 0);
  for (const p of parts) {
    if (p.fill) {
      p.out = fillRaw > 0 ? left * (p.raw / fillRaw) : 0;
      p.speed = p.out > 0 ? Math.max(1, p.raw / p.out) : 1;
    } else p.out = p.raw / p.speed;
  }
  const total = parts.reduce((a, p) => a + p.out, 0);
  plan.push({ ...seg, D: Math.max(D, total), parts });
}
for (const s of plan) console.log(s.id.padEnd(12), `D=${s.D.toFixed(1)}s`, s.parts.map((p) => `${p.take}:${p.from}→${p.to} raw ${p.raw.toFixed(1)}s ×${p.speed.toFixed(2)} → ${p.out.toFixed(1)}s`).join(' | '));
const total = plan.reduce((a, s) => a + s.D, 0);
console.log('TOTAL', total.toFixed(1), 's');
if (process.env.PLAN_ONLY) process.exit(0);

const badgeSpeeds = [...new Set(plan.flatMap((s) => s.parts.filter((p) => p.badge && p.speed >= 1.8).map((p) => Math.round(p.speed))))];
await renderBadges(badgeSpeeds);

// ── render segments ─────────────────────────────────────────────────────────────────────────────
const segFiles = [];
for (const s of plan) {
  const partFiles = [];
  s.parts.forEach((p, i) => {
    const list = join(OUT, `${s.id}-p${i}.txt`);
    frameList(take(p.take), p.fromT, p.toT, list);
    const out = join(OUT, `${s.id}-p${i}.mp4`);
    const played = p.raw / p.speed;
    const pad = Math.max(0, p.out - played);
    const vf = [`setpts=(PTS-STARTPTS)/${p.speed.toFixed(5)}`, `fps=${FPS}`, 'scale=1920:1080:flags=lanczos', 'format=yuv420p'];
    if (pad > 0.01) vf.push(`tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}`);
    const sp = Math.round(p.speed);
    if (p.badge && p.speed >= 1.8) {
      ff(['-f', 'concat', '-safe', '0', '-i', list, '-i', join(OUT, `badge-${sp}.png`), '-filter_complex', `[0:v]${vf.join(',')}[v];[v][1:v]overlay=W-w-36:92[o]`, '-map', '[o]', '-t', p.out.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', out]);
    } else {
      ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', vf.join(','), '-t', p.out.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', out]);
    }
    partFiles.push(out);
  });
  // segment = parts + pad to D + fades
  const segOut = join(OUT, `${s.id}.mp4`);
  const sum = s.parts.reduce((a, p) => a + p.out, 0);
  const inputs = partFiles.flatMap((f) => ['-i', f]);
  const chain = `${partFiles.map((_, i) => `[${i}:v]`).join('')}concat=n=${partFiles.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${Math.max(0, s.D - sum).toFixed(3)},fade=t=in:st=0:d=${FADE},fade=t=out:st=${(s.D - FADE).toFixed(3)}:d=${FADE}[v]`;
  ff([...inputs, '-filter_complex', chain, '-map', '[v]', '-t', s.D.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', segOut]);
  // narration, padded to the segment
  const wav = join(OUT, `${s.id}.wav`);
  ff(['-i', join(AUDIO, `${s.id}.mp3`), '-af', `adelay=${Math.round(LEAD * 1000)}:all=1,apad,atrim=0:${s.D.toFixed(3)}`, '-ar', '48000', '-ac', '2', wav]);
  segFiles.push({ video: segOut, audio: wav, D: s.D, id: s.id });
  console.log('rendered', s.id, probeDuration(segOut).toFixed(2), 's');
}

// ── captions (ASS) from the narration's character timings ──────────────────────────────────────
function assTime(x) {
  const h = Math.floor(x / 3600); const m = Math.floor((x % 3600) / 60); const sec = x % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}
const events = [];
let offset = 0;
for (const s of segFiles) {
  const a = alignment(s.id);
  const text = a.text;
  // chunks: sentences, long ones split at commas/colons
  const chunks = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const end = i === text.length - 1;
    const len = i - start + 1;
    if (end || ('.!?'.includes(c) && text[i + 1] === ' ') || ((c === ',' || c === ':') && len > 44 && text[i + 1] === ' ')) {
      chunks.push([start, i]);
      start = i + 2;
    }
  }
  chunks.forEach(([i0, i1], k) => {
    const t0 = offset + LEAD + a.starts[i0];
    const nextStart = chunks[k + 1] ? offset + LEAD + a.starts[chunks[k + 1][0]] : offset + s.D - 0.1;
    const t1 = Math.min(offset + LEAD + a.ends[i1] + 0.35, nextStart - 0.02);
    const line = text.slice(i0, i1 + 1).trim().replace(/\s+/g, ' ');
    events.push(`Dialogue: 0,${assTime(t0)},${assTime(t1)},Cap,,0,0,0,,${line}`);
  });
  offset += s.D;
}
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter,36,&H00FFFFFF,&H00FFFFFF,&H50080A0E,&H00000000,0,0,0,0,100,100,0.2,0,3,14,0,2,220,220,46,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
writeFileSync(join(OUT, 'captions.ass'), ass);

// ── final mux ───────────────────────────────────────────────────────────────────────────────────
const vlist = join(OUT, 'video.txt');
writeFileSync(vlist, segFiles.map((s) => `file '${s.video}'`).join('\n') + '\n');
const alist = join(OUT, 'audio.txt');
writeFileSync(alist, segFiles.map((s) => `file '${s.audio}'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', alist, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', join(OUT, 'narration.wav')]);
const vf = process.env.NOCAPTIONS ? 'null' : `subtitles=${join(OUT, 'captions.ass')}:fontsdir=/usr/share/fonts/opentype/inter`;
const final = join(BUILD, 'openharness-demo.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', vlist, '-i', join(OUT, 'narration.wav'), '-vf', vf, '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', final]);
console.log('wrote', final, probeDuration(final).toFixed(2), 's');
const narr = narration();
writeFileSync(join(BUILD, 'script.txt'), narr.scenes.map((s) => `[${s.id}] ${s.text}`).join('\n\n') + '\n');
