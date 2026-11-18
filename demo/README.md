# Demo video pipeline

`openharness-demo.mp4` is built from **real footage of the app running real HarnessRouter tasks**
(nothing is mocked), animated title cards, and an ElevenLabs voiceover.

| Step | Command | Output |
|---|---|---|
| Narration | `node demo/tts.mjs [sceneId…]` | `build/audio/<scene>.mp3` + character timings (voice: ElevenLabs "Jessica", model `eleven_v4`) |
| App footage | `APP=http://localhost:3001 node demo/record.mjs` (`TAKES=A,B`, `TAKES=C`, `TAKES=C2`) | `build/takes/A` (Qwen Code session), `B` (Qwen Code vs Codex side by side), `C` (new landing + four agents + Usage), `C2` (re-shoot of C's result and Usage screens): timestamped frames + scene marks |
| Title cards | `node demo/cards.mjs [sceneId…]` | `build/takes/card-*`: the HTML scenes in `scenes/`, with reveals timed to the narration |
| Assembly | `node demo/assemble.mjs` (`PLAN_ONLY=1` to preview timings; `CUT=v1` for the first cut) | `build/openharness-demo.mp4`: speed-ramped segments, "sped up N×" badges, captions, loudness-normalized audio |

The script lives in `narration.json`. The ElevenLabs key is read from `ELEVENLABS_API_KEY` or a one-line,
git-ignored `.env.elevenlabs`, and is never printed.

Recording drives a production build (`next build && next start`). Use `OPENHARNESS_DATA_DIR` and
`NEXT_DIST_DIR` to keep a recording server's data and build separate from your dev server. Long
agent runs are captured at 1 frame/s and time-lapsed; the badge in the corner shows the factor.
