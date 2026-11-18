#!/usr/bin/env node
// Narration for the demo video: ElevenLabs TTS, one MP3 (+ character timings) per scene.
//   node demo/tts.mjs [sceneId...]      (all scenes when none given; existing files are kept)
// The key is read from ELEVENLABS_API_KEY or the one-line .env.elevenlabs and never printed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'demo', 'build', 'audio');
mkdirSync(OUT, { recursive: true });

function key() {
  const env = process.env.ELEVENLABS_API_KEY?.trim();
  if (env) return env;
  const line = readFileSync(join(ROOT, '.env.elevenlabs'), 'utf8').split('\n').find((l) => l.startsWith('ELEVENLABS_API_KEY='));
  if (!line) throw new Error('ELEVENLABS_API_KEY missing');
  return line.slice('ELEVENLABS_API_KEY='.length).trim();
}

const cfg = JSON.parse(readFileSync(join(ROOT, 'demo', 'narration.json'), 'utf8'));
const only = new Set(process.argv.slice(2));
const force = process.env.FORCE === '1';
const scenes = cfg.scenes;

for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  if (only.size && !only.has(s.id)) continue;
  const mp3 = join(OUT, `${s.id}.mp3`);
  if (existsSync(mp3) && !force && !only.size) { console.log('keep', s.id); continue; }
  const body = {
    text: s.text,
    model_id: cfg.voice.model_id,
    voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: s.speed ?? 1.0 },
    previous_text: scenes[i - 1]?.text,
    next_text: scenes[i + 1]?.text,
  };
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice.voice_id}/with-timestamps?output_format=mp3_44100_192`, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('FAIL', s.id, res.status, (await res.text()).slice(0, 300));
    process.exit(2);
  }
  const j = await res.json();
  writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
  writeFileSync(join(OUT, `${s.id}.align.json`), JSON.stringify({ alignment: j.alignment || null, normalized: j.normalized_alignment || null }));
  console.log('ok', s.id, `${s.text.length} chars`);
}
