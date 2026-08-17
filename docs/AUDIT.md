# Halyard — full repository audit

> **Superseded as a source of current numbers.** This is a snapshot of one day,
> kept as written — its counts were true on 17 August 2026 and are not now.
> The live audit is `pnpm audit-halyard [--runtime]`, which derives the same
> facts from the TypeScript AST on every run; `docs/AGENT_REGISTRY.md` describes
> it. This hand audit was wrong twice using `grep` (it missed `factCheckTake`
> and counted `.next` build output as callers), which is why the tool exists.
>
> What remains valuable here is the reasoning — the topology, the design
> positions, and why each judgement was made.

**17 August 2026.** Audited against the code and against the production database,
not against the architecture documents — which describe several things as
working that are not.

Method: enumerate every LLM call site, then count real callers of every exported
agent function, excluding tests and `.next` build output. Query the hosted
database directly for state. Run the full suite.

---

## 1. Where it stands, in one paragraph

Halyard is an autonomous social-content system for RecipeFix. It generates post
ideas, writes per-platform copy, renders images and video, records a voiceover,
mixes and normalises audio, gates all of it through eight quality checks, and
puts the result in a queue for you to approve. It is deployed, healthy, and
running 112 jobs a day.

**It has never published a post.**

| | |
|---|---|
| Source | 293 files, 64,531 lines TypeScript/TSX |
| Tests | 998 unit (47 files), 52 E2E (10 specs), 0 skipped |
| Database | 58 tables, 24 migrations |
| Docs | 21 documents, 56 recorded decisions |
| History | 60 commits |
| Posts published | **0** |
| Accounts live | **0** of 7 connected |
| Content items | **0** |
| Publishing enabled | **false** |

Everything below is therefore *structural* quality — the code does what it says
it does. Nothing here claims an audience liked anything.

---

## 2. Topology

```
apps/web      Next.js 15, App Router, React 19, Tailwind v4   → Vercel
apps/worker   Node poller + scheduler, Playwright, FFmpeg,
              whisper.cpp, Remotion CLI                        → Railway
packages/core Domain logic: adapters, generation, qc, explorer,
              scheduling, scoring, capture, connectors, founder
packages/db   Schema types, job kinds, job policy, test harness
packages/render Satori/resvg image templates + Remotion compositions
packages/ui   Shared components
```

Postgres on Supabase, `us-east-1`. RLS **enabled and forced** on 57 tables — the
owning role is subject to policy too. Platform tokens sealed as ciphertext;
zero stored as plain text.

**Verified in production at audit time:** RLS forced, a non-admin role reads
nothing from any table, tokens sealed, and all eleven recurring jobs observed
running at their declared cadences.

---

## 3. The agentic organisation

### 3.1 The governing rule

> **Agents perceive, code decides.**

Every judgement that can be made deterministically is made in code. Models are
used only where perception or writing genuinely requires one. This is the single
most consequential architectural decision in the repository and it shows up
everywhere:

- The vision describer has **no parameter for the post's intent**. It cannot be
  told what it is supposed to see. It describes frames; `coherence.ts` compares
  the description to the intent and returns a verdict.
- The Explorer's model proposes feature claims; `checkFlowSafety` decides
  whether a proposal may run and `verdictFor` decides whether it proved
  anything. The model has no route to marking its own work verified.
- The hook model generates eight variants; the filter, the near-duplicate check
  and the scorer are pure functions.

### 3.2 There is no supervisor tree, deliberately

A supervisor agent routing between sub-agents would add a component that *can be
wrong* to a pipeline whose control flow currently cannot be. The job queue, the
gates, the retry loops, the idempotency guard and the safety denylist are all
deterministic. Putting a model in charge of them introduces a new failure mode
attached to the one part of the system that has none.

**Reverse this if you disagree** — it is a design position, not a fact. The
argument for a supervisor is flexibility; the argument against is that every
handoff here is currently inspectable, replayable and idempotent, and a
negotiated handoff is none of those.

### 3.3 The teams are stages, not hierarchies

A "team" here is a group of components sharing an input and a definition of
done. They coordinate through the job queue and the database — never through
conversation.

```
IDEAS      ideaEngine                    [code]   mix debt + novelty scoring
             │
WRITE      copywriter                    [model]  per-platform copy, gated, retries
             ├─ hook generator           [model]  8 variants, typed taxonomy
             ├─ hook filter + scorer     [code]   near-duplicate, clickbait, stop-rate
             ├─ payoff verifier          [model]  does the body deliver the promise
             └─ vo scriptwriter          [model]  narration, spoken-slop gated
             │
MAKE       satori / remotion             [code]   7 image templates, 4 compositions
             └─ tts pipeline             [code]   voice → duck → −14 LUFS → transcribe
             │
REVIEW     vision describer              [model]  describes frames, blind to intent
             ├─ coherence                [code]   claimed vs shown
             ├─ visual slop              [code]   static open, text wall
             ├─ audio QC                 [code]   WER, pacing, silence, loudness
             ├─ delivery QC              [code]   flat pace, stumbles, rushed open
             ├─ slop filter              [code]   script AND transcript, + ceiling
             └─ claim verifier           [code]   every fact traces to the artifact
             │
DECIDE     the queue                     [you]    approve · post now · post by hand
             │
LEARN      anti-examples                 [code]   rejections feed the next run
             ├─ hook history             [code]   types, cooldowns, measured stop rate
             └─ rejection clusterer      [ORPHAN] would turn 5 rejections into 1 rule

SIDE LOOPS
  Daily Take   fact-check → verify story → strengthen → counter → risk → draft
  Explorer     crawl → propose → safety denylist → replay → verdict
```

The one genuinely agentic loop is the **Explorer**, because discovery has no
fixed shape — you cannot enumerate in advance what a product does. Even there,
code decides safety and truth.

---

## 4. Every agent, and whether it runs

Counted by real callers, excluding tests and build output.

| Agent | File | Does | Status |
|---|---|---|---|
| Copywriter | `generation/copywriter.ts` | Per-platform post copy | **wired** |
| Hook generator | `generation/hooks.ts` | 8 variants, typed taxonomy | **wired** |
| Hook filter/scorer | `generation/hooks.ts` | Near-duplicate, clickbait, stop rate | **wired** |
| Payoff verifier | `generation/hooks.ts` | Hook promise vs body delivery | **wired** |
| VO scriptwriter | `generation/copywriter.ts` | Narration for video | **wired** |
| Vision describer | `generation/vision.ts` | Describes sampled frames | **wired** |
| Fact checker | `founder/dailyTake.ts` | Your claims, *before* drafting | **wired** |
| Take drafter | `founder/dailyTake.ts` | Your opinion, preserved | **wired** |
| Take strengthener | `founder/dailyTake.ts` | Strongest honest counter | **wired** |
| Explorer discovery | `explorer/discovery.ts` | Proposes feature claims | **wired** |
| Setup kit writer | `setup/kit.ts` | Profile bios, pinned posts | **wired** |
| Co-pilot | `api/compose/stream` | The compose screen | **wired** |
| Rejection clusterer | `generation/rejectionClusters.ts` | Groups rejections into patterns | **ORPHAN** |
| Auto-clip | `generation/autoClip.ts` | Clip candidates from footage | **ORPHAN** |
| Shipped-feature summariser | `connectors/github.ts` | Reads merged PRs | **ORPHAN** |

### 4.1 The hook system — found orphaned, now fixed

`surfaceBestVariants`, the half of the hook system that *chooses* a better
opening, **had no caller**. Generation only ever recorded a hook after the fact
by classifying whichever first line the copywriter happened to write.

A module whose own header calls it *"the loop that compounds: everything else in
Halyard makes production faster, this makes the output better over time"* was
recording its results and never acting on them. Three tables (`hooks`,
`hook_variants`, `hook_experiments`), a typed taxonomy, a near-duplicate check,
a clickbait check and a stop-rate predictor, all reachable only from tests.

Now wired: eight generated, filtered, five surfaced, the top one applied, and
the payoff check run on the applied one only.

### 4.2 The remaining orphans

- **Rejection clusterer** — the one worth building. Turns five separate
  rejections into one rule the copywriter can follow. Needs a body of rejections
  to cluster, which arrives once you work the queue. *Note: the per-item loop
  **is** wired — rejecting with a reason appends to `brand_voices.anti_examples`
  and the copywriter reads them next run. It is the pattern layer that is
  missing.*
- **Auto-clip** — needs long-form footage to clip from. None exists.
- **Shipped-feature summariser** — reads merged pull requests. RecipeFix ships
  through Lovable and has none. The Explorer supersedes it by looking at the
  product rather than its history.

---

## 5. Quality gates

Eight gates in `packages/core/src/qc/`. The rule throughout: **a gate that
cannot measure something reports `skipped` or `not_measured`, never `passed`.**

| Gate | Measures |
|---|---|
| `slopFilter` | Banned phrases, em-dashes, sentence rhythm, emoji, hashtag counts, **platform character ceiling**, and a `spoken` mode for voiceover scripts (hashtags, URLs, fractions, parentheticals, sentences too long to hold by ear) |
| `claimVerifier` | Every factual claim resolves to a path in the product artifact. A claim with no source is refused |
| `visualQC` | Contrast, safe area, aspect ratio against the platform |
| `audioQC` | Word error rate vs script, pacing (140–175 wpm), trailing silence, numeral pronunciation, loudness |
| `deliveryQC` | Flat pace, sentences run together, laboured words, rushed opening — from whisper word timings |
| `coherence` | What the copy claims vs what the frames show; hook-window text; static open; brandmark-only open; narration describing something never shown |
| `retentionQC` | Retention-shape rules |
| `destinationQC` | Where the link goes, decided at click time |

Plus `visual_slop` rules inside coherence: `entirely_static`, `text_wall`,
`text_never_changes`.

---

## 6. Subsystems implemented

### 6.1 Publishing

- **Seven direct adapters**: X, Instagram, TikTok, Pinterest, YouTube, Threads,
  Bluesky. Each declares `supportedFormats`, `maxChars`, media constraints and
  link strategy.
- **One unified transport**: Blotato, verified against the real API rather than
  its documentation.
- **Idempotency**: a publish never retries a malformed response. Publications
  are keyed by content item and account.
- **Kill switch**: `settings.publishing_enabled`, checked first in the handler.
- **Cross-product routing blocked structurally** — a schema constraint, plus a
  second assertion in the handler.
- **Manual handover**: a `draft_only` account routes to
  `awaiting_manual_publish` rather than failing. The UI hands you the caption
  pre-joined to its hashtags, the media one click from disk, and the platform's
  composer one click away. The URL back is required.

### 6.2 Generation

- **Eleven per-platform format specs** — X insight and thread, Instagram
  carousel/single/reel script, TikTok script, Pinterest pin, YouTube short,
  Threads post, founder take and tip. Selection on the platform **and** format
  pair.
- **Format choice from declared capability** — `chooseFormat` reads each
  adapter's `supportedFormats` and throws rather than defaulting.
- **Retry loop with feedback** — a failed draft is regenerated with the gate's
  own findings as revision notes.
- **Voiceover scripts gated the same way** as body copy, including the product's
  forbidden-claims list.

### 6.3 Media

- **7 image templates** (Satori + resvg), with required-prop validation that
  refuses to render a partial card.
- **4 Remotion compositions** at 1080×1920, audio-first timing — the video's
  length comes from the measured read, not a template default.
- **Audio pipeline**: ElevenLabs voice → music bed side-chained under the
  narration → two-pass loudnorm to −14 LUFS → muxed with FFmpeg → transcribed
  for captions and QC.
- **Burned-in captions** grouped into whole clauses, not two-word karaoke.

### 6.4 Product understanding — the Explorer

- `feature_claims` rows carry `replay`: the steps that demonstrate a feature and
  what must be observable when they run.
- Four statuses: `unverified`, `verified`, `refuted`, **`unverifiable`** — the
  last meaning the flow ran cleanly and asserted nothing.
- `checkFlowSafety` is deterministic code, re-checked on every run: allowed
  action vocabulary, destructive/transactional/identity term matching on label
  *and* selector, no typing into credential fields, host-comparison origin
  scoping.
- Verification expires at 14 days; a sweep re-verifies one stale claim every six
  hours.

### 6.5 Operations

- **23 job kinds, 22 handlers.** Only `digest_email` has none, documented and
  unscheduled.
- **12 scheduled jobs**, enqueued by the worker's own scheduler:

  | Job | Cadence |
  |---|---|
  | `refresh_tokens` | hourly |
  | `reconcile_schedule` | hourly |
  | `detect_release` | 30 min |
  | `collect_signals` | 6 h |
  | `verify_feature` | 6 h |
  | `collect_reviews` | 12 h |
  | `mark_stale_assets`, `collect_app_store`, `collect_watch_terms`, `score_performance` | daily |
  | `capture`, `draft_newsletter` | weekly |

- Stale locks reaped every 5 minutes with a 30-minute threshold — safely longer
  than the longest job timeout (20 min).
- Worker heartbeat in `worker_heartbeats`.
- `handlerCoverage.test.ts` fails if a scheduled kind has no handler, a handler
  lacks a timeout policy, a declared kind is unhandled without a written reason,
  a documented-as-missing kind turns out to exist, or a declared kind is rejected
  by the database's own check constraint.

### 6.6 Interface

23 dashboard screens: queue, calendar, analytics, accounts, assets, campaigns,
compose, finds, first-30-days, hooks, ideas, inbox, launch, library, products,
series, settings, setup-kit, social-proof, submissions, swipe, take, templates.

12 API routes including the cron entrypoint, OAuth start/callback, the click
router, compose streaming and setup-kit downloads.

---

## 7. What is not implemented

### 7.1 Deliberate

| Gap | Why |
|---|---|
| **Per-platform strategist** | Needs measured per-platform results. Without them it is a model asserting best practices from training data — the exact thing this project keeps removing |
| **Outreach, DMs, auto-reply** | A standing rule, and the one most likely to keep these accounts alive. Drafted replies you send with a click would honour it; automated engagement would not |
| **Supervisor agent** | See §3.2 |

### 7.2 Blocked by a licence

| Gap | Why |
|---|---|
| **Music beds** | ElevenLabs' music terms carve advertising out of the standard commercial grant, and Halyard's entire output is product marketing. Beds come from a library you own, tagged `music_bed`, rotated least-recently-used. The shelf is empty, so videos ship narration-only and record the reason. Synthesising a drone instead was rejected: it would be indistinguishable *inside the pipeline* from a real bed, and every gate would pass it |

### 7.3 Partial

| Gap | What is and is not measured |
|---|---|
| **Delivery judgement** | Flat pace, missing pauses, laboured words and rushed openings **are** measured. Whether a voice sounds *right* is not — that needs a human ear or an audio-native model. All delivery findings are warnings, because no real synthesised speech has been measured against these thresholds yet |
| **Image composition** | Contrast, safe area and ratio measured; whether a card looks good is not. `pnpm render-templates` exists so a person can look — which is how a "heading over empty space" bug was found *after* every gate passed it |

### 7.4 Absent

| Gap | Note |
|---|---|
| **Facebook** | Not in the `social_accounts.platform` check constraint at all. It cannot currently be represented, let alone posted to |
| **`digest_email`** | The one declared job kind with no handler. Nothing enqueues it |
| **Format extra outputs** | Specs declare thread arrays and carousel slide structures; the copywriter's JSON contract does not yet return them. Next on the list |
| **Rejection clustering** | See §4.2 |

---

## 8. Blocked on you

Roughly forty minutes in a browser unblocks the first three.

| | What | Why it needs you |
|---|---|---|
| **Taste** | `/onboarding` calibration | It shows you sample posts and you say which sound like you. Genuinely cannot be automated — it is the input the whole voice is built from |
| **Identity** | `/accounts` — connect them | Seven exist in the database; none is live. Interactive OAuth |
| **Consent** | `/settings` — enable publishing | Off by design so nothing goes out by accident |
| **Key** | `ELEVENLABS_API_KEY` | Voiceover. Without it the `tts` job refuses loudly rather than shipping a silent video that looks finished |
| **Key** | `EXPLORE_ACCOUNT_EMAIL` / `_PASSWORD` | A **throwaway** RecipeFix account for the crawler. No card on it — the denylist is a heuristic and text matching has gaps; an account with nothing to lose is the guarantee that does not depend on guessing what a button means |
| **Decision** | Music, and outreach | Either buy beds under a commercial licence or accept narration-only. And say which parts of "outreach" you meant |

---

## 9. Goals and value

The goal was never "post more". It was to run a real marketing account for
RecipeFix at a cadence one person could not sustain, **without saying anything
untrue and without sounding generated**.

Where the value actually sits:

- **Nothing publishes without you.** Approval and posting are separate
  decisions, both yours. Where the API cannot post, you get everything needed to
  do it by hand in one visit.
- **Every factual claim traces to the product.** The claim verifier resolves
  each one against a real artifact from the RecipeFix API. A claim with no
  source is refused, not softened.
- **The system says what it does not know.** A gate with no input reports
  `skipped`. A feature claim that ran and asserted nothing is `unverifiable`.
  Uncalibrated thresholds emit warnings, never blocks.
- **Cost**: roughly $0.02 per post in generation, plus a few cents when the
  critic examines finished media.

### 9.1 The pattern this codebase kept producing

Fifty-six recorded decisions, and a clear majority describe the same failure:
**a component that exists, reads as coverage, and never runs.**

- A scheduled job with no handler, silently requeued for 75 hours
- Gates whose optional inputs no production path ever supplied
- Four video templates marked `enabled` that no code path could render
- `maxChars` declared on every adapter and read by nothing
- A hook system recording results it never acted on
- Story expiry measured from fetch rather than publication, offering a 2015 post
  as today's news
- Source `weight` seeded with careful editorial judgement and wired to nothing
- Five E2E tests that skipped themselves in any shell without `CRON_SECRET` —
  the same tests that catch a cron mismatch that would have 405'd every job

None of these fail. They all report success. That is what makes them expensive,
and it is why this audit counts callers rather than reading documentation.

---

## 10. Recommended order

1. **Publish something.** Twenty posts. Everything below is unmeasurable without
   it, and every quality judgement so far is structural rather than observed.
2. **Format extra outputs.** Thread arrays and carousel slides — declared, not
   yet returned. Small, and it completes the per-platform work.
3. **Point the Explorer at RecipeFix.** The one substantial piece that does not
   need published posts. Its acceptance test is honest: does its verified list
   match what you would have written by hand?
4. **Rejection clustering**, once there is a body of rejections to cluster.
5. **Per-platform strategy**, last, once there is data for it to read.

The thing to resist is building the strategist before the first post. It would
produce a system that sounds authoritative about what works on TikTok, having
never posted to TikTok.

---

## 11. Reference

### Commands

```
pnpm dev / dev:all       run web (3200) and worker
pnpm typecheck lint test typecheck, lint, 998 unit tests
pnpm test:e2e            52 Playwright tests
pnpm render-templates    render every image template to disk, to look at
pnpm critic-check        run the coherence gate against a real render
pnpm verify-provider     check the unified transport against the live API
pnpm first-contact       one real post to one platform
pnpm doctor              environment readiness
```

### Environment

Required in production: `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`,
`OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`), `BLOTATO_API_KEY`,
`OAUTH_REDIRECT_BASE_URL`, `HALYARD_PUBLIC_URL`.

Currently unset: `ELEVENLABS_API_KEY`, `ELEVENLABS_MUSIC_LICENSED`,
`EXPLORE_ACCOUNT_EMAIL`, `EXPLORE_ACCOUNT_PASSWORD`.

### Documents

| File | What it is |
|---|---|
| `AUDIT.md` | This document |
| `AGENTS.md` | Agent inventory and the organisation |
| `DECISIONS.md` | 56 numbered decisions, each with its reasoning |
| `AGENTIC_PLAN.md` | The phased plan, both sides argued |
| `PLATFORM_COVERAGE.md` | Per-platform assessment and the outreach conflict |
| `STRATEGY.md` | Content strategy grounding |
| `DEPLOY.md` | Deployment topology and hosted verification |
| `OPERATING.md` | Day-to-day operation |
| `TRANSPORT_DEFAULTS.md` | Direct vs unified transport, per platform |
| `UNIFIED_PROVIDER.md` | Blotato, as the API actually behaves |
