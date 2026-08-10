# Halyard

An AI-assisted social content system. It generates content from **real product
output**, renders it to images and video, holds it for one operator's approval,
publishes through official platform APIs, and measures which content produces
activated users.

Serves RecipeFix now, Kinolog later, without rework.

It is not a scheduler with an LLM attached. Three things make it different:

1. **Content is built from real product artifacts.** Halyard calls RecipeFix's
   MCP server for an actual recipe adaptation and builds content from that JSON.
   Never from imagination.
2. **Four QC gates run before anything reaches the queue.** Copy lint, claim
   verification against the artifact, visual QC, audio QC. Content that fails
   never appears.
3. **A human approves everything.** No auto-posting of unreviewed content, and
   no `reply()` method anywhere on the adapter interface.

---

## Getting it running

```bash
pnpm install

# Postgres. Any 17 instance; a Supabase connection string works too.
export DATABASE_URL=postgres://postgres@localhost:5432/halyard
pnpm db:reset -- --fresh --seed

# Optional: demo content, so the UI has something to show before anything is live
psql "$DATABASE_URL" -f supabase/seed-demo.sql

cp .env.example apps/web/.env.local     # fill in what you have
echo 'HALYARD_DEV_UNAUTHENTICATED=1' >> apps/web/.env.local   # local only

pnpm --filter @halyard/web dev          # http://localhost:3200
pnpm --filter @halyard/worker start     # the long-running half
```

Nothing above needs a platform credential. The app runs, the queue works, the
templates render. Credentials only gate actual publishing.

## Verifying it

```bash
pnpm exec vitest run          # 316 tests
pnpm exec eslint .
pnpm --filter @halyard/web build

npx tsx scripts/screenshot.ts # every screen, desktop and mobile
```

The database tests need a reachable Postgres and skip cleanly without one. They
are the ones worth caring about: publish idempotency under concurrency,
`FOR UPDATE SKIP LOCKED`, RLS denial, and the AI-disclosure constraint all live
in the database, so they are tested against a real one.

## Layout

```
apps/web         Next.js 15, App Router. Every page is a server component.
apps/worker      Node container. Renders, publishes, polls. Ships Chromium.
packages/core    QC gates, adapters, connectors, generation, scheduling, scoring.
packages/db      Schema types, generated from the live schema without Docker.
packages/render   Satori image templates, Remotion compositions, caption timing.
packages/ui      Shared primitives.
supabase/        Migrations, seed, demo seed.
prompts/         Versioned prompt text.
docs/            The three specs, plus DECISIONS.md and STATUS.md.
```

`packages/core` imports from neither app, so both can use it.

## Where to look first

| Question | File |
|---|---|
| Why was this copy rejected? | `packages/core/src/qc/slopFilter.ts` |
| How is a claim verified? | `packages/core/src/qc/claimVerifier.ts` |
| How is a double-post prevented? | `apps/worker/src/handlers/publish.ts` |
| What does each platform actually allow? | `packages/core/src/adapters/` |
| Why 18:00 and not 17:00 after a DST change? | `packages/core/src/scheduling/timezone.ts` |
| What did we do differently from the spec? | `docs/DECISIONS.md` |
| What is finished and what is not? | `docs/STATUS.md` |

## The riskiest failure mode

It is not a bug. It is Halyard working perfectly and producing content nobody
wants.

The first-run wizard at `/onboarding` is the guard: twenty drafts you review and
reject with reasons before anything goes live. It takes about thirty minutes.
Daily generation refuses to run until it is done, and says so rather than
producing generic content silently.
