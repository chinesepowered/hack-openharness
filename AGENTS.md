<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- harnessrouter:begin -->
Agent features run on HarnessRouter Cloud. The setups are in harnessrouter.json (harness_id, name,
base, model, instructions); one harness per agent base, all sharing harness/instructions.md. Reuse them
before creating new Harnesses (`npm run hr:ensure` reuses by exact name). To change one, edit
harness/setups.json or harness/instructions.md and run `npm run hr:sync`: it fetches the live harness
with its ETag, PUTs the whole Harness with If-Match, and reads it back. Every task sends the signed-in
end user's id as `user`. The API key is HR_API_KEY in the server environment (.env.harnessrouter
locally); never ask for it in chat, never send it or a harness_id to the browser.
<!-- harnessrouter:end -->
