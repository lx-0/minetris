# CLAUDE.md — Minetris Development Guide

## Project

Minetris is a 3D first-person Minecraft/Tetris mashup. Vanilla JS frontend (Three.js, Tone.js), Cloudflare Workers backend (Durable Objects, KV). PWA, zero build step.

## Repository Layout

```
js/           Frontend modules (vanilla JS, loaded via <script> tags in index.html)
css/          Stylesheets
worker/       Cloudflare Workers backend (wrangler)
tools/        Dev tools (smoke tests, validation, hooks)
docs/         Design docs, roadmap, feature map
assets/       Release assets (itch.io)
```

## Development Workflow

### Branching

- Branch from `main` using: `feat/{description}-MINAA-{number}` or `fix/{description}-MINAA-{number}`
- One branch per issue. One PR per branch.
- Never push directly to `main`.

### Before Pushing

- Run `node tools/smoke-test.js` (syntax, DOM, cross-file checks)
- Run `bash tools/scan-secrets.sh` (gitleaks)
- Git hooks enforce both, but run them manually if hooks fail.

### Pull Requests

- Every PR must reference its Paperclip issue (e.g., "Closes MINAA-XXX")
- Fill out the PR template: summary, testing done, checklist
- CI must pass (smoke tests + secrets scan) before merge
- At least one review required before merge

### Testing

- `node tools/smoke-test.js` — pre-push validation (syntax, DOM IDs, script refs, global conflicts)
- `npm test` — unit tests (Vitest, when configured)
- `npm run test:coverage` — coverage report

## Agent Handoff Policy

When completing work on an issue:

1. **Push your branch and open a PR** linking the Paperclip issue.
2. **Post a comment on the issue** with:
   - What was done and why
   - Link to the PR
   - Any risks or things to watch for
3. **Set the issue to `in_review`** and reassign to the reviewing agent or the issue creator.
4. **Do not mark the issue `done` yourself** unless it's a trivial fix with no review needed.

When reviewing someone else's work:

1. **Check out the PR** and verify the changes match the issue requirements.
2. **Approve** → mark the issue `done` with a closing comment.
3. **Request changes** → set the issue back to `in_progress`, reassign to the original agent, and comment with specific feedback.

### Merge Gate

- CI must pass (GitHub Actions: smoke tests + secrets scan)
- At least one reviewer must approve the PR
- No force-pushes to `main`

## Code Conventions

- Vanilla JS, no TypeScript, no build step. Keep it that way unless explicitly decided otherwise.
- No npm dependencies on the frontend — libraries loaded from CDN via `<script>` tags.
- New JS modules: add `<script>` tag to `index.html`, register any DOM IDs in smoke test expected list.
- Service worker cache version: bump `CACHE_VERSION` in `sw.js` on every release.
- Backend: all Cloudflare Worker code lives in `worker/src/index.js`. Deploy with `npm run deploy` from `worker/`.

## Common Pitfalls

- Adding a new `const` or `let` at file scope can conflict with another script's global. The smoke test's cross-file check catches this.
- The smoke test expects specific DOM element IDs. If you add/remove UI elements, update the expected ID list in `tools/smoke-test.js`.
- `worker/src/index.js` is a 345KB monolith. Be surgical with changes and test the specific Durable Object you touched.
