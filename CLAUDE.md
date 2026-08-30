# Halyard

**At the start of every session and after any compaction, read `docs/STATUS.md` before doing work, and keep the docs current.**

An autonomous social-content system that markets **RecipeFix** (and later Kinolog). It generates post ideas, writes per-platform copy, renders images and video, records a voiceover, gates everything through quality checks, and queues the result for a human to approve. It is **autonomous up to the point of publication, and never past it.**

**Stack:** pnpm workspaces + Turborepo · Next.js 15 (App Router, React 19, Tailwind v4) → Vercel · Node worker → Railway · PostgreSQL 17 / Supabase · Vitest + Playwright · Satori/resvg, Remotion 4, FFmpeg, whisper.cpp.

---

## Overview

```
apps/web       Next.js, server-rendered, single operator. All screens + server actions.
apps/worker    Poller + scheduler. Owns anything measured in minutes.
packages/core  Domain logic. 21 modules — see below.
packages/db    Schema types (generated), JOB_KINDS, job policy, test harness.
packages/audit The Halyard Auditor (@halyard/audit).
packages/render Satori image templates + Remotion compositions.
packages/ui    Shared components.
```

**Data flow.** Everything asynchronous goes through one table: `jobs`. The web tier inserts a job; the worker polls, claims it with a lock, and runs a handler from `apps/worker/src/handlers/index.ts` (`HANDLERS` map, 29 job kinds). Nothing else coordinates — no queue service, no events, no supervisor.

```
idea → generate → render/tts → review gates → queue (human approves) → publish → collect metrics → score
```

**Key files:**

| Path | What it is |
|---|---|
| `packages/db/src/index.ts` | `JOB_KINDS` + `JOB_POLICY`. The spine. |
| `apps/worker/src/handlers/index.ts` | The `HANDLERS` map — every job kind's entry point |
| `apps/worker/src/poller.ts` | Claim/lock/retry loop, `HandlerContext` |
| `apps/worker/src/scheduler.ts` | Everything periodic, each with a documented cadence |
| `apps/worker/src/handlers/publish.ts` | The only path to a real post. Three idempotency layers. |
| `packages/core/src/adapters/` | Seven platform adapters + `types.ts` (the publish contract) |
| `packages/core/src/agents/registry.ts` | All 22 agents. Declares *intent*; the Auditor decides truth. |
| `packages/core/src/qc/index.ts` | `runAllGates` — the approval gate |
| `packages/core/src/brain/` | P1 Product Brain: evidence → facts |
| `packages/core/src/platform/` | P2 capability resolution + platform strategy |
| `packages/core/src/accounts/` | Account status, identity, preflight, token refresh |

**Governing rule: _agents perceive, code decides._** Every judgement that can be made deterministically is made in code. Models are used only where perception or writing genuinely requires one. A model can never mark its own output verified.

**Phases:** P0 agent OS + Auditor, P1 Product Brain, P2 Platform Intelligence — all merged. See `docs/HALYARD_IMPLEMENTATION_PLAN.md` for the full programme.

---

## Gotchas

Landmines learned the hard way. Each one cost real time.

1. **`JOB_KINDS` (TypeScript) and `jobs_kind_check` (Postgres) are the same list written twice.** Adding to one typechecks cleanly and fails at the first insert. `handlerCoverage.test.ts` is the only thing that catches it. Migrations 0024, 0028, 0031 all exist because of this.

2. **Next reads `apps/web/.env.local`, not the repo-root `.env`.** The worker reads `apps/worker/.env` via `docker run --env-file`. Neither can see a file at the repo root, so credentials put there are invisible until you run **`./scripts/env-sync`**, which generates both from the master `.env` (and rewrites `DATABASE_URL` to `host.docker.internal` for the container). Edit the master, then sync.

3. **`.env.example` ships `KEY=` with an inline comment**, which dotenv parses to `""` — and `??` does not fall back on an empty string. This broke OAuth on every fresh clone. Use `||` or a trim-check. See `apps/web/src/lib/oauthRedirect.ts`.

4. **The worker needs `X_CLIENT_ID`/`X_CLIENT_SECRET` too, not just the web app.** X authenticates the *client* on token refresh. Without them the worker skips every account and tokens die after two hours.

5. **`capability_state = 'live'` does not mean connected.** It means "an operator marked this past platform review". An account can read `live` with no credential at all. Use `packages/core/src/accounts/status.ts`.

6. **A skipped gate is not a passed gate.** `runAllGates` computed `passed: every(status !== 'failed')`, and `skipped` is not `failed`. Callers declare `requires` to make an unrun gate fail honestly.

7. **E2E: `waitForLoadState('networkidle')` is not a committed transaction.** Reading the database straight after a server action races it. Use `expect.poll` on the value you actually need — and poll for the *threshold* the assertion needs, not for `> 0`.

8. **`createIsolatedPool` builds a separate database.** Tampering with the main schema to test a guard proves nothing.

9. **Never fabricate empirical evidence.** A publication existing ≠ it performed. A collection job running ≠ metrics collected. `null` means unmeasured; `0` means measured zero. `halyard_empirical` claims require real observations and are currently zero everywhere by design.

10. **`@halyard/render` is webpacked for the browser by Remotion.** A Node-only
    import anywhere `timing.ts` can reach — including via the `@halyard/core`
    barrel, which pulls `node:crypto` — builds, typechecks and passes every
    test, then fails at render time with `UnhandledSchemeError`. Worker-side
    preparation belongs in `apps/worker`, not in the render package. §145.

11. **X publishing is billed per post** (~$0.015 without a link, ~$0.20 with). X v2 write endpoints return **402 credits-depleted** when the developer account has no credits.

---

## Documentation habit (required, maintain without being asked)

- `docs/STATUS.md` — where we are right now. Update when a meaningful piece of work finishes, and checkpoint before stopping or when context grows long.
- `docs/DECISIONS.md` — append a numbered entry for every real decision: what was chosen, **why**, and what was rejected. 63 entries and counting; the highest-value document here.
- `docs/<feature>.md` — one file per non-trivial feature or investigation.
- `docs/DESIGN_SYSTEM.md` — the palette, the type, and the reasoning behind each
  value. Every colour was solved against measured contrast; that reasoning lived
  only in CSS comments until §381.

Keep them tight: living summaries, not logs. Prune what is stale. Reference code by path rather than pasting it. Capture the *why*, never what the code already says.
