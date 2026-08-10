# Halyard — round 2 status

Milestones 21 to 32, against `halyard_round2_prompts_v2.md` and
`halyard_operating_model.md`. Written 2026-08-10.

`docs/STATUS.md` covers round 1 (milestones 1 to 20) and is still accurate.

---

## 1. What exists now

| | Round 1 | Now |
|---|---|---|
| Files | 169 | **302** |
| TypeScript / TSX | 21,256 | **29,164 lines** |
| SQL | 1,241 | **1,899 lines** |
| Tables | 30 | **41** |
| Unit + integration tests | 316 | **402 passing** |
| End-to-end tests | 0 | **14 passing, 1 skipped** |
| Screens | 15 | **20** |
| Videos ever rendered | 0 | **4, all passing visual QC** |

Typecheck clean across six workspaces. ESLint clean. Migrations apply to an
empty Postgres 17. Production build succeeds. All 20 screens captured at 1440px
and 390px with no console errors and no horizontal overflow.

---

## 2. Milestone by milestone

| # | Milestone | State | Verified by |
|---|---|---|---|
| 21 | Dev environment, owned end to end | **Done** | `./scripts/halyard --reset` brings up a populated app from nothing; `./scripts/doctor` runs 20 checks; OrbStack installed and `docker ps` works |
| 22 | Live RecipeFix connection | **Code done, still unverified live** | 150s timeout, one retry, artifact cache keyed on the request, 20/hour rate limit, per-tool health. No `RECIPEFIX_MCP_URL` to call |
| 23 | Multi-product and a personal persona | **Partly done** | `products.kind`, the `founder` persona, `about_product_id`, product ordering and a switcher. **The `/products/new` wizard is not built** |
| 24 | GitHub connector | **Code done, unverified live** | Merged PRs, releases, feature summarisation, brief staleness. Internals leakage is blocked by four new slop rules with fixtures. No `GITHUB_TOKEN` |
| 25 | Worker container and first rendered video | **Done** | Four MP4s rendered by the container, probed with ffprobe, passing visual QC. Timings recorded in `.render-output/video/TIMINGS.md` |
| 26 | Assets and capture | **Not started** | Deferred. See §4 |
| 27 | Content quality and retention engineering | **Done** | 11 format specs, retention QC as enforced rules, the full hook subsystem I.1 to I.10, saves weighting, cadence ceilings, swipe file, rejection clustering. 61 new tests |
| 28 | Founder content engine | **Done** | RSS ingestion with clustering and ranking, the input-gated Daily Take with fact-check-before-draft, `/take`, `/finds`, the founder product and its mix |
| 29 | End-to-end tests | **Done** | 15 scenarios across desktop and mobile. Found two real bugs |
| 30 | Audio | **Not started** | Needs the voice clone. See §4 |
| 31 | The features every incumbent has | **Mostly done** | Best-time-from-own-data, auto-clipping, link-in-bio at `/l/[slug]`, Bluesky adapter. **Watch terms not built** |
| 32 | Production hardening | **Partly done** | Dry-run mode, adapter self-test, header and body redaction. **Sentry, the milestone 19 browsing UI and the failure rehearsals are not done** |

---

## 3. The three things worth reading the code for

**The hook subsystem** (`packages/core/src/generation/hooks.ts`). A hook is four
coordinated artifacts, not a string: on-screen text, spoken line, visual
direction, caption. Eight variants are generated across at least four named
types and filtered to five, because choice fatigue is real and this is a daily
task. A hook type cannot repeat consecutively, a pattern cools down for 30 days,
performance is recency-weighted so a winner from six months ago stops dominating,
and payoff verification fails closed — an unverifiable hook is not a verified
one. Predicted stop rate returns `null` rather than a number when n < 3.

**Retention as enforced rules** (`packages/core/src/qc/retentionQC.ts`). The
research findings are QC rules, not prompt suggestions, because a suggestion is
followed most of the time. Time-to-content is measured as the length of the
static run a video opens with, so a logo bumper, an intro card and a title slide
are all caught by the same measurement. A 30-second video with no visual state
change inside 15 seconds fails. Frame 1 is treated as the thumbnail: four to
seven words, WCAG AA contrast.

**The Daily Take** (`packages/core/src/founder/dailyTake.ts`). The canonical
input-gated workflow. `runTakeLoop` returns `needs_input` without calling a model
at all when there is no input, and stops at `needs_revision` — before drafting —
when fact-checking contradicts the central claim. The draft prompt says "sand
nothing" and is tested for it, because regression to a balanced non-statement is
the characteristic failure of AI-assisted commentary.

---

## 4. What is not done

**Milestone 26, assets and capture.** No asset library screen, no Playwright
capture flows. The flows target the live RecipeFix app (`recipefix.app/adapt`),
so they cannot be written blind — the selectors in v1 §5.4 are illustrative, and
guessing at them produces code that looks finished and works on nothing. This is
the largest deliberate gap.

**Milestone 30, audio.** Needs the ElevenLabs Professional clone, which does not
exist yet. Everything around it is built and tested: the lexicon table and its
normalisation pass, audio QC with WER, pacing, LUFS and trailing silence,
disclosure enforcement at publish time, and `transcribeWords()` against the
whisper.cpp binary now inside the container. The synthesis call itself is the
missing piece.

**The `/products/new` wizard (23).** The schema, the personal persona and the
cross-product attribution all exist. Adding a product still means a SQL insert.

**Watch terms (31 D)** and **Sentry, the milestone 19 browsing UI, and the
failure rehearsals (32)**.

**Still true from round 1:** no platform credential exists, so no adapter has
spoken to a real API; the platform reviews need a human with a screen recorder;
and RecipeFix's UTM capture is in another repo.

---

## 5. Bugs found by actually running things

Five, all fixed. Worth listing because each one was invisible to the tests that
existed at the time.

1. **whisper.cpp would not build on arm64.** ggml's CPU backend uses ARM FP16
   intrinsics GCC only accepts with an explicit `armv8.2-a+fp16` baseline. Fixed
   with `GGML_NATIVE=OFF` plus the arch flag, and built statically so the copied
   binary runs without its shared libraries.
2. **Every video rendered in Times New Roman.** Remotion had no font faces at
   all; the brand typography was simply absent. Fixed by serving the faces from
   the bundle's public directory and holding the first frame with `delayRender`
   until they load.
3. **Every scene rendered in the top-left corner.** A Remotion `Sequence`
   renders children into a bare absolute layer, so the Stage's centring never
   applied. Only a real render could show this.
4. **Adding the founder product broke every product-scoped page.** The founder
   persona is a `products` row, it sorted first by `created_at`, and "the first
   product" silently became a persona with no accounts. Caught by an E2E test,
   fixed with kind-aware ordering and a product switcher.
5. **`next build` while `next dev` is running corrupts the dev server.** The
   dev chunks 404, the stylesheet never loads, and three pages appear to overflow
   on mobile. Not an app bug, but it cost a debugging round, so: restart the dev
   server after a build.

The screenshot script now reports the failing URL rather than "a resource",
which is what made the fifth one findable.

---

## 6. Operating-model conformance

`halyard_operating_model.md` is canonical, and these are the places it is
enforced rather than described.

| Rule | Where it lives |
|---|---|
| Nothing publishes without an explicit human action | Kill switch checked first in `publishHandler`; approval is per-item; there is no "approve all" |
| Everything arrives finished | QC gates run before the queue; a failing item lands in a failure state with a reason instead |
| The system never synthesises an opinion I did not express | `runTakeLoop` returns `needs_input` without calling a model; `draftTake` throws `TakeRequiresInput` |
| No auto-reply, no auto-DM, no follow automation | No `reply()` on the adapter interface, asserted by a test across all seven adapters |
| Feedback is training signal | Rejections become anti-examples and, after ten in a category, a named cluster with a proposed rule |
| The queue stays small enough to read | Per-format weekly ceilings, not just daily caps |

The one place the operating model demands more than exists: "after ten
rejections in a category, tell me what my rejections have in common" is
implemented in `rejectionClusters.ts` and tested, but has no screen yet. It runs
and produces the sentence; nothing displays it.

---

## 7. Running it

```bash
./scripts/halyard --reset        # everything, from nothing
./scripts/doctor                 # what is missing and the command to fix it
pnpm dev:all                     # web + worker + merged logs
./scripts/halyard --worker       # the real container
```

Verification:

```bash
pnpm exec vitest run             # 402
pnpm test:e2e                    # 15, needs the app running
pnpm exec eslint .
pnpm --filter @halyard/web build
npx tsx scripts/screenshot.ts    # 20 screens, desktop and mobile

docker run --rm -v "$PWD/.render-output:/app/.render-output" halyard-worker \
  pnpm exec tsx scripts/render-demo-videos.ts
```

---

## 8. The next four things

1. **Run `/onboarding`.** Still the first thing, still thirty minutes, still the
   only guard against the real failure mode.
2. **Register the six developer apps.** X posts the same day; record the demo
   session while the flows are fresh.
3. **The RecipeFix UTM hour**, and the service-token path on its MCP server.
   Between them they unblock milestones 18 and 22.
4. **Fifteen swipe-file entries with one line each.** It is the cheapest quality
   improvement available and the copywriter is already wired to consume them.
