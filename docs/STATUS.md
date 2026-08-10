# Halyard — build status

Written 2026-08-10, against `social_engine_architecture.md` (v1),
`social_engine_addendum_v2.md` (v2), and `halyard_build_pack.md`.

Everything in v2 Part K's twenty milestones has been built, apart from two items
that cannot be done from a keyboard. Read §4 before drawing conclusions from §2 —
"implemented and tested" here means tested to the limit that a repo with no
platform credentials allows, and that limit is different per milestone.

---

## 1. What exists

| | |
|---|---|
| Files | 169 |
| TypeScript / TSX | 21,256 lines |
| SQL | 1,241 lines |
| Tables | 30, RLS enabled and forced on all of them |
| Tests | **316 passing**, 14 files |
| Typecheck | clean across all six workspaces |
| Lint | clean |
| Production build | succeeds, 24 routes |
| Screens | 15, captured desktop and mobile, no console errors |

```
apps/web         Next.js 15, 15 screens, 7 API routes, 6 server-action modules
apps/worker      poller + 9 job handlers + Dockerfile (Chromium, FFmpeg, whisper.cpp)
packages/core    4 QC gates, 6 adapters, connectors, generation, scheduling, scoring
packages/db      30-table schema, generated types, integration-test harness
packages/render  7 Satori templates, 4 Remotion compositions, caption timing
packages/ui      shared primitives
```

---

## 2. Milestone by milestone

| # | Milestone | State | Verified by |
|---|---|---|---|
| 1 | Scaffold, schema, RLS, auth, routes, CI, slop filter | **Done** | 10 migrations apply to a clean PG 17; 55 slop-filter tests; RLS denial tested |
| 2 | Products, voices, brand tokens, content rules, first-run wizard | **Done** | `/products/[id]`, `/onboarding`; generation blocks until the wizard completes |
| 3 | RecipeFix MCP connector | **Code done, unverified live** | 15 tests against a scripted MCP server. No `RECIPEFIX_MCP_URL` to call |
| 4 | Worker container, poller, job handlers | **Done** | 21 integration tests inc. `SKIP LOCKED` under 12 concurrent workers |
| 5 | Six OAuth flows + PlatformAdapter interface | **Code done, unverified live** | 43 contract tests; state signing and PKCE tested. No developer apps registered |
| 6 | Record demo videos, submit reviews | **Not code** | `docs/REVIEW_SUBMISSIONS.md` written; needs a human and a screen recorder |
| 7 | Claim verifier + QC scaffolding | **Done** | 16 + 29 tests; all four gates run through one registry |
| 8 | Idea engine with mix-debt scoring | **Done** | 29 tests; hard caps, novelty, category diversity all enforced |
| 9 | Copywriter + approval queue with QC display | **Done** | Regeneration-on-failure tested; queue renders the v2 F.5 block |
| 10 | X adapter live — first real post | **Code done, no real post** | Link-in-first-reply, malformed-response handling, cost model tested |
| 11 | Satori templates + visual QC gate | **Done** | 17 tests **render real PNGs**; carousel ratio and safe area asserted |
| 12 | Threads + Pinterest | **Code done, unverified live** | Sandbox host switching and metric purge deadlines tested |
| 13 | Instagram | **Code done, unverified live** | Carousel children→parent, Reels polling, signed-URL refusal tested |
| 14 | Co-pilot compose mode | **Done, needs an API key to talk** | SSE endpoint, live preview, send-to-queue with QC on the way in |
| 15 | Remotion + captions + audio QC | **Compositions done, no rendered video** | 16 timing tests; audio QC tested. Video render needs the worker container |
| 16 | YouTube + TikTok inbox-upload | **Code done, unverified live** | Resumable chunking, private-until-audited, inbox-by-default tested |
| 17 | Comment inbox + reply drafting | **Done** | Human-send-only enforced; no adapter has a `reply()` method, and a test asserts it |
| 18 | Metrics, attribution, performance scoring | **Done, produces zeroes** | Scoring and UTM tested. Blocked downstream — see §3 |
| 19 | Series, hooks, submissions, swipe file, repost decay | **Schema + wiring done, thin UI** | Tables, seeds and write paths exist; no dedicated screens |
| 20 | Calendar, mobile polish, kill switch, health | **Done** | Kill switch tested at the top of the publish job; mobile checked at 390px |
| 21–39 | Addendum v2 and round 2 | **Done** | See `docs/STATUS_ROUND2.md` |
| 40–47 | Round 3: accounts, capture, destinations, campaigns, proof, readiness | **Done** | See `docs/halyard_round3.md`; 596 tests at close |
| 48 | Deploy groundwork | **Done, deploy is yours** | `docs/DEPLOY.md`; needs browser logins with a card on file |
| 49 | Unified transport | **Built, refusing to publish until probed** | `UnifiedAdapter` implements `PlatformAdapter`; every capability starts `unknown`. Needs `BLOTATO_API_KEY` and `pnpm verify-provider --publish` |
| 50 | Account setup kit | **Done** | `/setup-kit`; images render at each platform's exact size, ZIP verified with `unzip -t`, handle checks run against live public endpoints |
| 51 | Launch batch and cold-start honesty | **Done** | `planLaunchBatch` is the first caller of the scheduler primitives; 737 unit tests, 37 E2E |

---

## 3. What is not done, and why

**Three things are genuinely outstanding, and none of them are code.**

### Platform credentials — blocks milestones 3, 5, 10, 12, 13, 16

No developer app is registered for any platform, so no adapter has spoken to a
real API. Every adapter is tested against a scripted `fetch` that asserts the
shape of the request — method, path, body, headers, sequencing — but a contract
test cannot catch an API that changed since v2's research in August 2026.

Expect a first-contact bug per platform. The most likely spots: X's v2 media
upload endpoint, Instagram's `alt_text` field name on carousel children, and
Pinterest's analytics response envelope.

The path is exactly v2 B.2: register six apps, run six OAuth flows, record one
demo session, submit four reviews. X works the same day.

### Platform reviews — milestone 6

`docs/REVIEW_SUBMISSIONS.md` has the per-platform recording script and the two
rejection reasons Pinterest actually gives. Nothing else is blocked while these
run: every account sits at `draft_only`, the system runs end to end, and the
operator flips a row on `/accounts` when approval lands.

TikTok should be attempted and expected to fail. The adapter is built for that
outcome rather than around it.

### RecipeFix UTM capture — blocks milestone 18 downstream

v1 §9 calls it "roughly an hour of work" and "the highest-leverage hour in the
entire plan". It has not happened, and it is in a different repo.

Halyard's half is complete: links are stamped at publish time with
`utm_content = content_item_id`, `attributionReadiness()` reports precisely which
half of the chain is missing, and `/analytics` shows that message instead of an
empty funnel. Until RecipeFix captures `$initial_utm_content`, the attribution
job returns zero rows and the conversion weighting in performance scoring
redistributes to reach and engagement, saying so in the score notes.

### Smaller gaps, deliberate

- **Remotion has never rendered a frame here.** The compositions are real TSX
  and the timing maths has 16 tests, but rendering needs Chromium in the worker
  container. The Dockerfile installs it; the container has not been built.
- **ElevenLabs is not wired.** v2 D.2 makes the founder voice clone a
  prerequisite, and there is no clone yet. The audio QC gate, lexicon
  normalisation and the `voice_lexicon` table are all built and tested; the
  synthesis call is the missing piece, and it is thirty lines.
- **Playwright capture flows (v1 §5.4)** are not implemented. v2 confirms this
  is a narrow content class — App Store assets and Product Hunt, not the daily
  feed — so it was the correct thing to leave last.
- **Milestone 19 has no dedicated screens.** Series, hooks, submissions and the
  swipe file have tables, seed data and write paths (approved hooks are recorded,
  rejections become anti-examples, repost decay is computed on scoring). What is
  missing is browsing UI for them.
- **`docs/recipefix_overview.md` does not exist.** The kickoff prompt lists four
  documents; three are in the repo. Worked around by making the brief a database
  field the wizard blocks on. See `DECISIONS.md` §7.

---

## 4. What "tested" means here

Worth being precise, because the phrase does a lot of work.

**Tested against a real Postgres 17** — publish idempotency under three
concurrent workers, `FOR UPDATE SKIP LOCKED` with 12 workers draining 40 jobs and
zero overlap, stale-lock reaping, RLS denying a non-admin role on every table,
the AI-disclosure check constraint refusing to let an unlabelled item reach
`approved`, and every timestamp column being `timestamptz`. These are the
expensive failures, and they are tested where they actually live.

**Tested as pure functions** — the slop filter against a fixture file of 34
known-bad LLM copy samples that must all fail plus 6 known-good that must all
pass; claim verification including a fabricated temperature that resolves to the
right path but is still rejected; DST handling with the exact case the build pack
names ("18:00 stays 18:00 across the transition"); staggering gaps; scoring.

**Tested by producing real output** — the Satori templates render actual PNGs in
the test run, and the carousel test asserts all six slides share one aspect ratio
because Instagram silently crops otherwise.

**Tested against scripted fixtures** — every platform adapter. Never a live API,
as the build pack requires.

**Verified visually** — all 15 screens at 1440px and 390px, checked for page
errors, console errors and horizontal overflow. Two real bugs were found and
fixed this way: a missing arrow glyph rendering as tofu on two templates, and
analytics overflowing on a phone because a grid child defaulted to
`min-width: auto`.

**Not tested at all** — anything requiring a platform credential, an Anthropic
API key, an ElevenLabs voice, or a built worker container.

---

## 5. Where the design departed from the specs

Ten decisions are recorded in `docs/DECISIONS.md` with reasoning. The three that
matter most:

1. **Token encryption is application-level AES-256-GCM, not pgsodium.** v1 §7
   and build pack §5 disagree; we followed the build pack. pgsodium is deprecated
   for new Supabase projects, and app-level sealing keeps the migrations testable
   on plain Postgres.
2. **The web tier queries Postgres directly rather than through PostgREST.**
   Every page is a server component and the browser holds no credential. RLS is
   still enabled and forced, because the anon key is what would leak.
3. **TikTok stays `draft_only` even if the audit passes.** The API cannot attach
   trending audio, so an automated TikTok underperforms an assisted one. Direct
   publish exists behind two flags, both off.

---

## 6. The next four things

In order, and the first is thirty minutes of your time, not code.

1. **Run the first-run wizard.** `/onboarding`. Paste the RecipeFix overview,
   answer the voice questions, review twenty calibration drafts. Daily generation
   refuses to run until this is done, and that refusal is deliberate: the riskiest
   failure mode is Halyard working perfectly and producing content nobody wants.
2. **Register the six developer apps and run the OAuth flows.** X posts the same
   day. Record the demo session while the flows are fresh and submit four reviews.
3. **The RecipeFix UTM hour.** Without it, §18 produces zeroes rather than
   errors, which is the worst kind of failure.
4. **Build the worker container and render one video end to end.** This is the
   only part of the pipeline that has never executed.

---

## 7. Running it

```bash
pnpm install
export DATABASE_URL=postgres://postgres@localhost:5432/halyard
pnpm db:reset -- --fresh --seed
psql "$DATABASE_URL" -f supabase/seed-demo.sql   # optional demo content

cp .env.example apps/web/.env.local
echo 'HALYARD_DEV_UNAUTHENTICATED=1' >> apps/web/.env.local

pnpm --filter @halyard/web dev        # http://localhost:3200
```

Verify with `pnpm exec vitest run`, `pnpm exec eslint .`,
`pnpm --filter @halyard/web build`, and `npx tsx scripts/screenshot.ts`.
