# Halyard

An autonomous product-marketing system for builders. Connect a product and
Halyard learns what it does, writes and renders content grounded in that
product's own output, gates it, corrects its own mistakes, and holds the result
for one operator's approval.

It starts from the **product**, not from a brief someone writes about their
business. That is the difference worth knowing: most tools ask you to describe
your company, and every prompt downstream inherits whatever you typed. Halyard
reads the product — website, store listing, code, UI, captures, and an MCP
server if there is one — and stores facts that cite the evidence behind them.

Four things follow from that:

1. **Content is built from real product artifacts.** A connector returns actual
   product output and the copy is written from that JSON, never from
   imagination. MCP makes this richer where a product offers one; it is
   optional, and a product with only a website works.
2. **Eight QC gates run before anything reaches the queue** — copy, claims,
   destination, proof, audio, visual, retention and coherence. A claim is
   verified against the artifact it came from, and media is reviewed by a
   different provider than the one that wrote it. A skipped gate is not a
   passed gate.
3. **Halyard corrects its own work.** A failing verdict is diagnosed, mapped to
   the smallest correction that addresses it, and rebuilt — bounded at three
   attempts and a spend ceiling, with an append-only history of what changed
   and why.
4. **A human approves everything.** Autonomous up to the point of publication
   and never past it. No auto-posting, and no `reply()` method anywhere on the
   adapter interface.

Seven platform adapters: X, Instagram, TikTok, YouTube, Pinterest, Threads and
Bluesky. Product-agnostic throughout — RecipeFix is the product it runs for
today, not an assumption in the architecture.

Positioning, and what is genuinely built versus intended, is in
[`docs/POSITIONING.md`](docs/POSITIONING.md).

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
