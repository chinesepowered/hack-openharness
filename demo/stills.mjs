#!/usr/bin/env node
// README screenshots straight from the recorded footage: node demo/stills.mjs
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD, ROOT } from './lib.mjs';

const OUT = join(ROOT, 'docs');
mkdirSync(OUT, { recursive: true });
// [take, mark, seconds relative to the mark, output name]
const SHOTS = [
  ['A', 'live', -1.2, 'composer.jpg'],
  ['A', 'followup', -0.5, 'result.jpg'],
  ['B', 'end', -0.5, 'race.jpg'],
  ['A', 'result', -1.0, 'session.jpg'],
];
for (const [take, mark, off, name] of SHOTS) {
  const d = JSON.parse(readFileSync(join(BUILD, 'takes', take, 'frames.json'), 'utf8'));
  const m = d.marks.find((x) => x.label === mark);
  if (!m) { console.log('skip', name, '(no mark', mark + ')'); continue; }
  const t = m.t + off;
  const fr = d.frames.filter((f) => f.t <= t);
  const f = (fr[fr.length - 1] || d.frames[0]).f;
  copyFileSync(join(BUILD, 'takes', take, f), join(OUT, name));
  console.log(name, '<-', take, f);
}
