# Halyard

**At the start of every session and after any compaction, read `docs/STATUS.md` before doing work, and keep the docs current.**

An autonomous social-content system that markets **RecipeFix** (and later Kinolog). It generates post ideas, writes per-platform copy, renders images and video, records a voiceover, gates everything through quality checks, and queues the result for a human to approve. It is **autonomous up to the point of publication, and never past it.**

**Stack:** pnpm workspaces + Turborepo · Next.js 15 (App Router, React 19, Tailwind v4) → Vercel · Node worker → Railway · PostgreSQL 17 / Supabase · Vitest + Playwright · Satori/resvg, Remotion 4, FFmpeg, whisper.cpp.

---

## Overview

```
apps/web       Next.js, server-rendered, single operator. All screens + server actions.
apps/worker    Poller + scheduler. Owns anything measured in minutes.
packages/core  Domain logic. 37 modules — see below.
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
| `packages/core/src/agents/registry.ts` | All 41 agents. Declares *intent*; the Auditor decides truth. |
| `packages/core/src/qc/index.ts` | `runAllGates` — the approval gate |
| `packages/core/src/brain/` | P1 Product Brain: evidence → facts |
| `packages/core/src/platform/` | P2 capability resolution + platform strategy |
| `packages/core/src/accounts/` | Account status, identity, preflight, token refresh |

**Governing rule: _agents perceive, code decides._** Every judgement that can be made deterministically is made in code. Models are used only where perception or writing genuinely requires one. A model can never mark its own output verified.

**Phases:** P0 agent OS + Auditor, P1 Product Brain, P2 Platform Intelligence — all merged. See `docs/HALYARD_IMPLEMENTATION_PLAN.md` for the full programme.

**Direction (§438-§453).** How long a piece runs, and what happens when, are now
decided rather than discovered. The platform owns a length band and a primary
signal; the format owns a pace; the budget reaches the writer as a word count
before it writes; and the screenplay finally drives the frames it has always
described. `docs/DIRECTION_SPEC.md` is the plan of record — read it before
touching `creative/length.ts`, `creative/editor.ts`, or the screenplay join in
`formatVideo.ts`.

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

11. **Running the worker locally takes two things that are not obvious.** It
    reads `apps/worker/.env` only because `docker run --env-file` passes it —
    `pnpm --filter @halyard/worker start` loads nothing, and fails on
    `SUPABASE_DB_URL is not set` while `DATABASE_URL` sits in that file
    unread. Source it first, and override `DATABASE_URL` to the `localhost`
    form, since env-sync rewrites it to `host.docker.internal` for the
    container. Second: a worker backgrounded from a shell dies when that shell
    exits, silently, mid-job — leaving a `generate` row stuck in `running`
    until the poller reclaims it. Use `nohup ... < /dev/null &` with a script
    that `cd`s and `exec`s. `pkill -f "tsx src/index.ts"` does not match it;
    find it with `ps -eo pid,command | grep halyard`.

12. **A third of the suite skips silently unless a database is reachable.**
    `pnpm vitest run` reports "3,060 passed, 471 skipped" and the skips are
    forty-three suites that call `createIsolatedPool` — `databaseAvailable()`
    returns false because nothing puts `DATABASE_URL` in the shell (gotcha 2
    again: Next reads `.env.local`, the worker gets `--env-file`, neither
    reaches vitest). Run them with the environment sourced:

    ```
    set -a; . ./apps/web/.env.local; set +a
    TEST_DATABASE_URL="$DATABASE_URL" pnpm vitest run --maxWorkers=6
    ```

    `--maxWorkers=6` is not optional. Forty-three suites each **create and
    migrate a database** and open up to four connections against a
    `max_connections` of 100; at the default worker count this killed local
    Postgres outright, and it died without releasing `postmaster.pid` — after
    which brew refused to restart it because an unrelated process had reused
    the recorded PID. Clear it with
    `rm /opt/homebrew/var/postgresql@17/postmaster.pid`.

    Three tests in `generate.test.ts` additionally need `ANTHROPIC_API_KEY`,
    which sourcing the env file supplies. This is *not* wired into
    `vitest.config.ts` on purpose: a default that can take down the database
    you are developing against, and that fails on a fresh clone with no API
    key, is worse than the skip it fixes. §456.

13. **Two workers will happily race each other, and only one has your fixes.**
    A container from `./scripts/halyard` and a worker started by hand both poll
    the same `jobs` table, and jobs land on whichever claims first. Cost real
    time: images were written to `dev-assets` and the *audio for the same piece*
    was not, because one worker had `HALYARD_LOCAL_ASSET_DIR` and the other did
    not — which reads as a bug in the storage code and is not. Check with
    `docker ps --filter name=halyard-worker` **and**
    `ps -eo pid,command | grep "filter @halyard/worker"`; `pkill -f "tsx
    src/index.ts"` matches neither. §465.

14. **X publishing is billed per post** (~$0.015 without a link, ~$0.20 with). X v2 write endpoints return **402 credits-depleted** when the developer account has no credits.

---

## Documentation habit (required, maintain without being asked)

- `docs/STATUS.md` — where we are right now. Update when a meaningful piece of work finishes, and checkpoint before stopping or when context grows long.
- `docs/DECISIONS.md` — append a numbered entry for every real decision: what was chosen, **why**, and what was rejected. Approaching 400 entries; the highest-value document here.
- `docs/<feature>.md` — one file per non-trivial feature or investigation.
- `docs/DESIGN_SYSTEM.md` — the palette, the type, and the reasoning behind each
  value. Every colour was solved against measured contrast; that reasoning lived
  only in CSS comments until §381.

Keep them tight: living summaries, not logs. Prune what is stale. Reference code by path rather than pasting it. Capture the *why*, never what the code already says.
