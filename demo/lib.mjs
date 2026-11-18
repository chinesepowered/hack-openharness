// Shared helpers for the demo pipeline (narration timing, ffmpeg).
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BUILD = join(ROOT, 'demo', 'build');
export const AUDIO = join(BUILD, 'audio');
export const LEAD = 0.35; // silence before narration in each segment
export const TAIL = 0.5; // silence after

export function narration() { return JSON.parse(readFileSync(join(ROOT, 'demo', 'narration.json'), 'utf8')); }

export function audioDuration(id) {
  const f = join(AUDIO, `${id}.mp3`);
  if (!existsSync(f)) throw new Error(`missing narration audio ${f} (run demo/tts.mjs)`);
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();
  return Number(out);
}

/** Character timings for a scene: { chars, starts, ends, text } on the ORIGINAL text. */
export function alignment(id) {
  const j = JSON.parse(readFileSync(join(AUDIO, `${id}.align.json`), 'utf8'));
  const a = j.alignment || j.normalized || j;
  return { chars: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds, text: a.characters.join('') };
}

/** Seconds (from narration start) at which `phrase` is spoken, n-th occurrence. */
export function wordTime(id, phrase, nth = 0) {
  const a = alignment(id);
  let idx = -1;
  for (let k = 0; k <= nth; k++) idx = a.text.indexOf(phrase, idx + 1);
  if (idx < 0) throw new Error(`"${phrase}" not found in ${id}`);
  return a.starts[idx];
}

export function ff(args, opts = {}) {
  return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: opts.quiet ? 'pipe' : 'inherit', maxBuffer: 1 << 26 });
}

export function probeDuration(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}
