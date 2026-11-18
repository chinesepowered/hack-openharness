# OpenHarness

See AGENTS.md for the Next.js and HarnessRouter rules (the HarnessRouter block is the source of truth
for how this app talks to HarnessRouter). Quick facts:

- `npm run dev`, `npm test`, `npm run build`. Server-only code lives in `src/lib/server/` (imports `server-only`).
- The browser sends harness *keys* (e.g. `qwen`); `src/lib/server/harnesses.ts` maps them to harness ids.
- Never commit `.env*` files or `.data*/`; never log the HarnessRouter key.
