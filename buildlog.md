# OpenHarness build log

**Built on November 18, 2026 for the HarnessRouter hackathon.** Everything below comes from our own records: git history, the app's task store, and HarnessRouter's own session data. Times are UTC.

## TL;DR

| | |
|---|---|
| **Build time** | About 2¼ hours from an empty repo (~18:08) to the shipped demo (20:24) |
| **What we shipped** | A harness- and model-agnostic coding platform: 10 HarnessRouter harnesses, 65 models, live sessions, follow-ups, side-by-side runs, Usage & budgets, a judge-facing README and a 2:53 demo made from real footage |
| **HarnessRouter usage** | 10 harnesses created, 19 sessions, 21 tasks (incl. 2 follow-ups and 3 we cancelled), about 89 agent-minutes |
| **Total spend** | **$5.33**. Our per-task metering matches HarnessRouter's session `spend_usd` to the cent. |
| **Code** | 3,768 lines of TypeScript in 54 files, 17 unit tests, 281 lines of harness admin scripts, 1,173 lines of video pipeline |
| **How we built it** | With an AI coding agent (Claude Code) following HarnessRouter's `agents.md` → Skill flow, the workflow HarnessRouter designed for agents, plus our own product and design decisions on top |

## Timeline

| Time (UTC) | Milestone | Notes |
|---|---|---|
| ~18:08 | Empty repo | Idea: "OpenCode made the model swappable; let's make the harness swappable too." |
| ~18:15 | Read `harnessrouter.ai/agents.md` | It points to the Skill in `HarnessRouter/plugins` (v0.3.0-dev.2). We read `SKILL.md` and all references, starting with the API reference, runtime integration and harness config. |
| ~18:16 | Key stored server-side | One-line `.env.harnessrouter`, owner-only (0600) and git-ignored. Never in the browser, logs or commits. |
| ~18:17 | Discovery and catalog | `GET /v1/uhp` lists `2026-09-28` (the Skill's verified version) and reports `memories: false`. `GET /v1/me` names the Default Workspace. `GET /v1/bases` lists **29 bases**, most running 50–68 models. |
| ~18:19 | **10 harnesses created** | One per agent base: Claude Code, Codex, Qwen Code, MiniMax, Gemini CLI, OpenCode, Kimi, Grok Build, Aider, OpenHands. Reused by exact name, with an `Idempotency-Key` on each create. The workspace's two existing harnesses were left untouched. |
| ~18:21 | First probe task | Claude Code on `claude-haiku-5.5` (a per-task `model` override) cloned `developit/mitt`, installed dependencies, ran the tests and wrote a patch: **110 s, $0.022**. This proved sandbox networking, the override and our output contract. |
| ~18:23 | First instruction fix | The probe showed `out/` didn't exist before the first write, so we added `mkdir -p out` to the instructions and rolled it to all 10 harnesses: GET with ETag → full PUT with `If-Match` → readback. Zero conflicts. |
| ~18:25–18:40 | Server and UI | Adapter (from the Skill's Node template), streaming runner, SSE fan-out, routes, composer, session view, side-by-side view. |
| 18:41 | **First real task through the app** | Qwen Code + `qwen3.8-max`: "Add a `once()` method with tests and docs." |
| ~18:58 | Unplanned crash test | Editing `next.config.ts` restarted our dev server mid-task. On the next request, recovery found the `running` turn's saved `response.id`, polled `GET /v1/responses/{id}`, and collected the outputs. Nothing was re-sent. |
| 19:05 | First task complete | **23.5 min, $1.47**, 31 tests passing, 4 files changed, `verified: true`. |
| 19:06 | Follow-up with a model switch | Same session (`previous_response_id` + `session_id`), switched to `qwen3.8-flash`. It answered from context in **20 s, $0.016**. |
| ~19:05 | Security pass | A second user gets 404 on every route. We also found and fixed a real leak: Turbopack was tracing `.env.harnessrouter` into the server build (see Feedback 1). |
| 19:08 | Recording starts | Real tasks recorded through the production build. The first side-by-side attempt picked the wrong harnesses (our UI bug); we cancelled all three runs within a minute ($0.08). |
| 19:15 | Side-by-side re-run | Qwen Code + `qwen3.8-max` vs Codex + `gpt-6-luna` on the same task. |
| ~19:16 | Smoke test of the other 7 harnesses | MiniMax, Gemini CLI, OpenCode, Kimi, Grok Build, Aider and OpenHands, all in parallel: **all 7 completed** in 37–57 s for $0.01–$0.13 each. All 10 harnesses are now verified. |
| 19:28 | Side-by-side results | Codex: **4m 48s, $0.03**. Qwen Code: **12m 44s, $0.90**, 28 tests passing. A **27× price spread** on one task. |
| 19:39 | Demo v1 (2:59) | A product demo with real footage. |
| 19:54 | README for judges | |
| 19:58 | **Usage & budgets** | Shows metered spend per harness × model, with a monthly budget enforced server-side (HTTP 402). New footage: four agents on one task. |
| 20:19 | Demo v2 (2:53) | The business cut: market pain, the 27× savings proof, Usage & budgets, why HarnessRouter, and the business model. |
| 20:24 | Shipped | Video on YouTube, merged to `main`. |

## Key decisions, and why

1. **One HarnessRouter harness per agent base.** A harness's `base` can't change, but `model` can be overridden per task. So the product owns ten harnesses that share one set of instructions, and the user's model choice travels as `model` on each task. That gives 10 harnesses × up to 63 models = 453 combinations with just 10 resources.
2. **One output contract for every harness.** The shared instructions require `out/changes.patch` (the cumulative diff against a `git tag` taken at the start), `out/SUMMARY.md` and `out/manifest.json` (title, summary, changed files, tests). Ten very different agents then return comparable, reviewable artifacts. That's what makes side-by-side runs and the Usage page possible.
3. **Server-only integration, per the Skill's rules.**
   * The browser sends a harness *key* (`"qwen"`); the server maps it to a `harness_id` and validates the model against `GET /v1/harnesses/{id}/models`.
   * The key, harness ids, session and response ids, and download URLs never reach the browser. We checked every payload for `chrn_`, `hsess`, `resp_` and `download_url`.
4. **The stream is consumed server-side, never tied to the browser.** We save `response.id` and `session_id` at `response.created` and turn tool calls into sanitized steps fanned out over SSE. The task keeps running if the tab closes, and recovery polls instead of re-sending.
5. **Cost comes from `spend_usd`.** Each turn's cost is the change in the session's cumulative spend. That one number powers the result card, the side-by-side Fastest/Cheapest badges, the Usage page, and budget enforcement.
6. **Repos.** The agent clones public repos inside the sandbox, which worked out of the box. For private repos, the server downloads the tarball with the user's GitHub token and uploads it with `POST /v1/files`, so the agent never sees a token. That path is implemented, but we didn't exercise it live because there was no OAuth app during the hackathon.
7. **Instructions as code.** `harness/setups.json` plus `harness/instructions.md` are the source of truth. `npm run hr:ensure` creates or reuses harnesses; `npm run hr:sync` rolls changes out with ETag/If-Match. We synced 3 times across 10 harnesses: 30 PUTs, 0 conflicts, every readback matched.

## HarnessRouter features we used

| Feature | Endpoint(s) | Where in our code | Verified live |
|---|---|---|---|
| Discovery | `GET /v1/uhp` | build step | ✅ version and capabilities |
| Identity | `GET /v1/me` | `scripts/hr-admin.mjs me` | ✅ |
| Catalog | `GET /v1/bases`, `GET /v1/harnesses/{id}/models` | `src/lib/server/catalog.ts` | ✅ live model menus for 10 harnesses |
| Harness lifecycle | `GET/POST /v1/harnesses`, `GET/PUT /v1/harnesses/{id}` (ETag, `If-Match`), `Idempotency-Key` on create | `scripts/hr-admin.mjs ensure / sync` | ✅ 10 creates, 30 PUTs |
| Tasks (streaming) | `POST /v1/responses` with `stream`, `user`, `model`, `metadata.harness_id`, `Idempotency-Key` | `src/lib/server/runner.ts` | ✅ 21 tasks on 10 harnesses |
| Follow-ups | `previous_response_id` + `metadata.session_id` | `src/lib/server/sessions.ts` | ✅ 2 follow-ups, one with a model switch |
| Recovery | `GET /v1/responses/{id}` polling | `runner.ts` `recoverOnce` | ✅ after a real mid-task restart |
| Cancel | `POST /v1/responses/{id}/cancel` | `runner.ts`, `hr-admin.mjs cancel-running` | ✅ 3 tasks, instantly |
| Session files | `GET /v1/sessions/{id}/files`, `GET /v1/containers/{sid}/files/{fid}/content` | `runner.ts`, download route | ✅ patch, summary and manifest for every task |
| Metering | `GET /v1/sessions/{id}` (`spend_usd`) | `runner.ts`, `usage.ts` | ✅ reconciles with `GET /v1/sessions?harness=` to the cent |
| Session listing | `GET /v1/sessions?harness=` | `hr-admin.mjs spend` | ✅ |
| File upload | `POST /v1/files` → `input_file` | `runner.ts` (private repos) | ⚠️ implemented, not exercised live |

## What worked really well

* **The Skill is excellent onboarding.** `agents.md` → Skill → API reference was accurate to the live service: every shape we relied on matched. The Node adapter template saved hours, and its rules (server-only key, `user` on every task, never take `harness_id` from the browser, consume the stream independently) are exactly the guardrails a product needs. We kept all of them.
* **One API, 29 harnesses.** Going from 1 to 10 harnesses cost us zero integration work. It was literally a config list. That's the core of our pitch and it's HarnessRouter's doing.
* **Model override per task works across bases,** including cross-provider: Qwen Code ran `gpt-6-luna` (by accident, in our cancelled run) and `qwen3.8-flash`; Claude Code ran `claude-haiku-5.5`.
* **Streaming is clean.** The first frame arrived about 2 s after the POST. Events follow the Responses-API style and `response.created` carries `session_id`, so we could persist immediately.
* **Durability primitives held up for real.** Recovery by polling survived an actual server restart mid-task. Cancel was instant. ETag/If-Match updates never conflicted and always read back exactly.
* **Sandboxes are practical.** `git clone`, `npm install` and the project's own tests all worked out of the box, and `node_modules` was sensibly left out of the session file listing.
* **Cheap to build on.** The whole build, including demo footage, cost $5.33. A code question on MiniMax cost $0.013.
* **Spend data is trustworthy.** Our per-task metering matched HarnessRouter's session totals exactly, which made it safe to build budgets on.

## Feedback for HarnessRouter

Ordered by how much each would have helped us. Every item is something we actually ran into.

1. **The Skill's Next.js key loader can leak the key into build output.** `key-setup.md` recommends `readFileSync(join(process.cwd(), '.env.harnessrouter'))`. With Next.js 16 / Turbopack, that made the server build trace `.env.harnessrouter` (and our data folder) into `.next/**.nft.json`. Any tracing-based deploy (`output: 'standalone'`, Vercel) would then ship the key file. We confirmed it in the traces and fixed it with `/*turbopackIgnore: true*/` on the path expressions.
   **Ask:** update the snippet (`readFileSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ process.cwd(), '.env.harnessrouter'))`), and add "check `.nft.json` traces" to the acceptance list.
2. **Put the per-task cost on the response.** `usage` has tokens but no dollars. Cost is only on `GET /v1/sessions/{id}` as cumulative `spend_usd`, a string there but a number in the list. We diff cumulative spend after each turn to get per-task cost.
   **Ask:** add `cost_usd` (a number) to the response object and the `response.completed` event.
3. **Model pricing in the catalog.** `/v1/bases` gives `available` and `reasoning` per model, but no price. Products can't estimate cost before running, which blocks budget pre-checks and our planned Auto mode routing by budget.
   **Ask:** per-model price metadata (input/output $/Mtok, or a typical-task estimate) in `/v1/bases` and `/v1/harnesses/{id}/models`.
4. **Multi-base products need shared instructions.** Because `base` is fixed, a product offering N harnesses maintains N copies of the same instructions. We wrote a sync script (10 PUTs per change). And because `PUT` is a full replace, one wrong body silently clears fields.
   **Ask:** any of: a `PATCH` for partial updates, shared instruction sets across harnesses, or a per-task `base` override for harnesses that opt in.
5. **Normalized tool activity.** Tool names and argument shapes differ per base (`Bash`/`bash`/`shell`, `Write`/`write`, `apply_patch`…). To show one activity feed across 10 harnesses we wrote a normalizer (`src/lib/server/steps.ts`).
   **Ask:** an optional normalized `tool_kind` (run/edit/read/search) and a short `summary` on `function_call` items. Every multi-harness UI would use it.
6. **Sandbox paths leak into tool output.** Outputs include `/workspace/...` and `.harness/home/.../persisted-output` paths, which we scrub before showing them.
   **Ask:** workspace-relative paths, or a flag to request them.
7. **Inconsistent session-list semantics.** In `GET /v1/sessions?harness=`, `spend_usd` is cumulative for the session, but `elapsed` covers only the latest turn. We confirmed this by reconciling our Qwen sessions.
   **Ask:** add `total_elapsed`, or document the difference.
8. **`served_model` formats vary.** We saw provider-qualified ids (`alibaba/qwen3.8-max`, `moonshotai/kimi-k3`, `openai/gpt-5.4`), an unprefixed one on Gemini CLI (`gemini-3.8-flash`), and `null` on OpenCode.
   **Ask:** consistent, always-present, provider-qualified ids. They matter for auditing and for routing on recorded outcomes.
9. **Runtime control for coding tasks.** The sandbox runs Node 22, and `mitt`'s legacy `esm` test loader crashes on it. Codex reported "tests failed" for that reason; Qwen Code worked around it. `takesEnvironments: true` suggests this is solvable, but we didn't find a quick recipe.
   **Ask:** a documented example of pinning runtimes (for example a Node version) per harness or per task.
10. **A per-task effort control.** `qwen3.8-max` took 17–23 minutes on a moderate task, doing very thorough verification (bundle sizes, regenerated docs). An efficiency line in the instructions cut the same task from 23.5 to 17 minutes. `reasoning_effort` exists on the harness, but not per task.
    **Ask:** per-task `reasoning_effort` (or an effort hint), so products can offer "quick" vs "thorough" without separate harnesses.
11. **Skill helpers inside sandboxed coding agents.** Our agent's sandbox (reasonably) refused to run downloaded scripts that read the API key, so we re-implemented the needed calls (~200 lines). Also, the hidden-prompt key setup is macOS-only (`INPUT_UNAVAILABLE` on Linux and in containers).
    **Ask:** ship the helpers as a versioned package (e.g. `npx @harnessrouter/cli harness ensure`), and offer a device-code login for cloud and Linux agents.
12. **Small things.**
    * A prefix filter on `GET /v1/sessions/{id}/files` (we only want `out/`, and big repos list every file).
    * A heartbeat frame during long silent tool runs, to keep proxies happy (we saw no drops, but our longest stream was 23 minutes).
    * Agent-specific final messages: Aider's final message pointed to `SUMMARY.md` instead of answering.
    * Per-repo memory: once `memories` is offered, it would be a natural fit for coding agents (learned conventions per codebase). We already send `user` on every task.

## Bugs we hit (ours), and the fixes

| Bug | How we found it | Fix |
|---|---|---|
| The agent's first patch write failed: no `out/` directory | First probe task | `mkdir -p out` in the instructions, rolled out with ETag/If-Match |
| Our CLI watcher dropped HttpOnly cookies (curl writes them as `#HttpOnly_` lines) | The watcher printed nothing | Parse `#HttpOnly_` lines |
| Editing `next.config.ts` restarted the dev server mid-task | Unplanned | The recovery path handled it exactly as designed |
| Secrets and user data traced into the server build | Build warning, then we inspected `.nft.json` | `turbopackIgnore` on dynamic paths; re-verified the traces were clean (Feedback 1) |
| Side-by-side picked the wrong harnesses: deselecting the last harness re-selected the default | Live footage showed 3 harnesses | Default selection now applies once; `data-selected` attributes and recorder assertions added; the bad runs were cancelled within 1 minute |
| `qwen3.8-max` runs much longer than demos allow | 23-minute first task | Efficiency rule in the instructions; timeout raised to 50 minutes with a $3 cap per task |
| Durations showed "10m 60s" | Spotted in demo footage | Round before splitting minutes; unit test added; that scene re-shot |

## Task ledger

Every task we ran, by harness × model, from the app's store plus our smoke and probe scripts. Total: **$5.33**, matching HarnessRouter's `spend_usd`.

| Time | Harness | Model | Task | Status | Time taken | Cost | Tests |
|---|---|---|---|---|---|---|---|
| ~18:21 | Claude Code | `claude-haiku-5.5` | Probe: README sentence | completed | 1m 50s | $0.022 | failed (repo's Node 22 issue) |
| 18:41 | Qwen Code | `qwen3.8-max` | Add `once()` + tests + docs | completed | 23m 33s | $1.468 | passed (31) |
| 19:06 | Qwen Code | `qwen3.8-flash` | Follow-up question | completed | 20s | $0.016 | passed |
| 19:08 | Qwen Code | `qwen3.8-max` | Add `once()` (demo take) | completed | 16m 57s | $1.205 | passed (10 new) |
| 19:08 | Claude Code | `claude-sonnet-5.5` | Side-by-side (wrong pick) | cancelled | 59s | $0.021 | |
| 19:08 | Codex | `gpt-6.1-sol` | Side-by-side (wrong pick) | cancelled | 1m 02s | $0.046 | |
| 19:08 | Qwen Code | `gpt-6-luna` | Side-by-side (wrong pick) | cancelled | 1m 00s | $0.012 | |
| 19:15 | Qwen Code | `qwen3.8-max` | Add `clear()` (side by side) | completed | 12m 44s | $0.905 | passed (28) |
| 19:15 | Codex | `gpt-6-luna` | Add `clear()` (side by side) | completed | 4m 48s | $0.034 | failed (legacy `esm` loader on Node 22) |
| ~19:16 | MiniMax Code | `minimax-m3` | Code question (smoke) | completed | 40s | $0.013 | |
| ~19:16 | Gemini CLI | `gemini-3.8-flash` | Code question (smoke) | completed | 43s | $0.033 | |
| ~19:16 | OpenCode | `gpt-6.1-sol` | Code question (smoke) | completed | 57s | $0.037 | |
| ~19:16 | Kimi Code | `kimi-k3` | Code question (smoke) | completed | 38s | $0.129 | |
| ~19:16 | Grok Build | `grok-4.6` | Code question (smoke) | completed | 37s | $0.090 | |
| ~19:16 | Aider | `gpt-6.1-sol` | Code question (smoke) | completed | 38s | $0.032 | |
| ~19:16 | OpenHands | `gpt-5.4` | Code question (smoke) | completed | 54s | $0.058 | |
| 19:26 | Qwen Code | `qwen3.8-max` | Follow-up question (demo) | completed | 1m 03s | $0.148 | |
| 19:58 | Claude Code | `claude-sonnet-5.5` | JSDoc for `emit` (four agents) | completed | 1m 48s | $0.077 | not run (docs-only) |
| 19:58 | MiniMax Code | `minimax-m3` | JSDoc for `emit` (four agents) | completed | 4m 45s | $0.089 | passed |
| 19:58 | Kimi Code | `kimi-k3` | JSDoc for `emit` (four agents) | completed | 2m 05s | $0.254 | passed |
| 19:58 | Gemini CLI | `gemini-3.8-flash` | JSDoc for `emit` (four agents) | completed | 11m 00s | $0.645 | passed |

What the ledger says about the product: on the same task, harness × model choice moved cost by **8× to 27×** and time by up to 6×. The best choice depended on what you wanted. That's the case for a platform that makes the choice easy and visible, and for HarnessRouter as the layer that makes it possible.

## What's next

* **Auto mode:** route each task to the best harness × model for its budget, learned from the time, cost and test outcomes we already record. Feedback items 2, 3 and 8 would make this much easier.
* **Open a GitHub PR** from the reviewed patch (GitHub App flow: issue → PR).
* **Billing** with pay-per-task credits; team plans with harness and model policies.
* **Postgres** in place of the JSON store, and the private-repo upload path exercised end to end.
