## Assignment ground rules

Source: [FDE take-home brief](docs/FDE%20Take-Home%20-%20Observable%20Outfitters.pdf).

- Keep `AGENTS.md` and `README.md` in the app root. Place all other project Markdown files, including `WRITEUP.md`, in `docs/`.
- Preserve existing product behavior while adding observability. If you find bugs, expose them through telemetry and document them in `docs/WRITEUP.md`; do not fix them as part of the instrumentation work.
- Keep `npm test`, `npm run lint`, and `npm run typecheck` passing.
- Keep the app working when Grafana Cloud cannot be reached. Telemetry failures must not break product flows.
- Never commit credentials. Document the required environment variables and setup commands in `README.md` so the team can use its own Grafana Cloud stack.
- Record reasoning, trade-offs, assumptions, dead ends, and unfinished work in `docs/WRITEUP.md`. Keep the final write-up to two pages at most.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
