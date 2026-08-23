# Creative Iteration Log

The permanent memory of Halyard's creative-generation evolution. Not a
changelog: a record of *what was investigated, what was decided, and what must
not be rediscovered*.

**Every creative-quality pass appends an entry.** Before changing anything, read
§0 and search this file for the problem you are about to solve. If it appears
here, determine which of these applies before writing code:

1. already considered and open
2. already fixed → **if it is back, it is a regression; find out why**
3. deliberately rejected → the reasoning is recorded; do not silently reverse it
4. blocked externally
5. never investigated

Decision entries (`docs/DECISIONS.md` §NNN) hold the full reasoning. This file
holds the *creative* thread through them and the measurements.

---

## §0 — Do Not Regress / Already Solved

Settled. Reversing any of these requires a new decision entry saying why.

| Rule | Where | Why |
|---|---|---|
| Setup steps run but are **not shown** as footage | §166 | Page loads, banner dismissals and placeholder-clearing are executed because the artifact depends on them; they are not the story. `setup: true` in flow config, read only in `shows()`. |
| `setup` and `elide` are **different semantics** | §166 | `elide` is a captioned claim about real product latency ("this took 26s"). `setup` says there is nothing to tell. A step must never carry both — a test asserts it. |
| The URL/constraint interaction is **evidence-bearing** | §166 | "Switch to Link tab" and "paste the recipe URL" look like setup and are not: together they are the product's central claim made concrete. A heuristic that cut early steps would have removed them. Judgement lives in configuration. |
| A wait following an elision is the **payoff**, not dead air | §163 | The result card appears *during* the elided wait. Cutting both showed setup then a 400ms flash. |
| Filter footage by **action, not step name** | §163 | `let the result settle` reads nothing like a wait; its action is exactly that. |
| Captions must hold **WCAG AA**, measured | §158 | `captionStyle` measures contrast against what is actually behind the words. |
| Caption treatment depends on **backdrop** | §158/§163 | Media gets a plate; a flat surface gets the surface treatment. Decided **once per plan**, never per beat — switching mid-piece reads as two videos spliced. |
| Captions are a **separate system** from card typography | §167 | Never route card type through `captionStyle` or vice versa. |
| The **planner owns** beat emphasis and timing | §160/§162/§167 | The treatment expresses emphasis; it never recomputes importance. |
| Treatment mapping is **role-based** | §162 | A creative type is a `TreatmentSet` map, not a branch inside a composition. |
| One **timing engine**: `layoutScenes` | §160/§163 | `minSeconds` is a floor; `maxSeconds` (§163) is the ceiling for footage, whose length is a fact. |
| Transformation type scale is **content-dependent** | §167 | Fixed sizes left a short card at 21% of its band. Density selects scale; emphasis selects the target fill. Bounded 0.8–2.0 with a hard band ceiling. |
| Hierarchy is the **ratios**, not the absolute sizes | §167 | after > before > reason; all three scale together so no scale can reorder them. |
| A missing reason **reserves no space** | §160/§167 | Reserving it is inventing evidence, expressed as layout. |
| Mobile/portrait capture is **intentional** | §168 | The product's own responsive layout answers "what fits in 9:16". Do not revert `adapt_and_reveal` to a desktop viewport. |
| Portrait media **preserves aspect and must not silently clip** | §168 | `BeatStage` hides overflow; footage is bounded in both dimensions. |
| A stale `focusRegion` is **worse than none** | §168 | A region measured against a desktop window crops the wrong part of a phone one. |
| Never fabricate footage, UI, progress or zoom | §159/§163 | A missing capture renders **nothing**. A synthetic progress overlay was explicitly rejected. |
| Visual tests must **observe rendered output** | §168 | A test that reimplements the production math passes while production is broken. This has happened twice; both times a tamper caught it. |
| Correction history is **append-only** | §165 | Enforced by trigger. The cascade from `content_items` is the one permitted deletion. |
| Invalidated gates cannot stay **green** | §165 | They become `skipped` with a reason; a required skipped gate blocks. |
| Correction must **claim before spending** | §165 | The unique key protects rows, not provider spend. |
| Provider failure **escalates**, it does not retry | §165 | Every attempt buys the same error. |
| Publication stays **approval-gated** | §90/§91/§165 | The correction loop improves the artifact; it authorises nothing. |
| Review is **independent of generation** | §158/§165 | Media review runs on a different provider than the writer. No model marks its own output verified. |

---

## Iterations

### #1 — §158/§159 · Caption legibility and selector resilience
**Objective** captions were illegible on some grounds; a capture selector was killing three production jobs a day.
**Findings** caption contrast was assumed, not measured (quality → defect). `aria-label="Choose your swap"` had moved (defect, external drift).
**Decision** `captionStyle` measures contrast and guarantees AA; selectors degrade through a documented candidate chain reporting which one answered.
**Not changed** no new caption system; the existing brand tokens drive it.

### #2 — §160/§161 · The creative plan
**Objective** nothing decided *how* a story was told; composition drove everything.
**Decision** `planBeforeAfter` produces beats (hook, held change, corroboration, evidence) from the generic `Highlight` contract; beats drive `layoutScenes`. Returns `null` when the artifact has no transformation — refusal rather than an empty stage.
**Not changed** no second timing engine; beats feed the existing one.

### #3 — §162 · Role → treatment seam
**Objective** a second creative type would have meant editing the transformation composition.
**Decision** `TreatmentSet`: role → component. Emphasis became visible as type scale, not only duration.
**Real render** two layout defects found by inspecting frames: percentage padding resolving against *width* (caption ran through the reason text), and a bottom-anchored hook leaving half the canvas empty.

### #4 — §163 · Real product footage
**Objective** the composition was type on a flat ground.
**Decision** a `demo` beat playing a real capture, cut to the spans worth watching. Multi-span (elision = two spans joined), action-based filtering, payoff rule.
**Defects found by real execution** Remotion caches bundles by code and copies `publicDir` in, so new footage was never served; `minSeconds` is a floor so a held beat froze its last frame for 4.5s; the resulting `maxSeconds` cap was dropped at the beat→scene mapping and the re-render came back byte-identical.

### #5 — §166 · Setup footage
**Objective** ~40% of the hero beat was page load, banner dismissal and a spinner.
**Measured** cut 3.80s → 3.05s; first frame blank white page → rendered product UI; payoff within the video ~6.5s → ~4.0s.
**Decision** `setup?: boolean` on `FlowStep`, read only in `shows()`. Classified in flow configuration, never by heuristic.
**Deliberately kept** the Link tab and URL paste — evidence-bearing.

### #6 — §167 · Transformation density
**Objective** cards used ~21% of their band; the hook headline (96px) was larger than the transformation it introduced (66px).
**Root cause** fixed type sizes, not position. Positioning can only move a fixed-size block around.
**Measured on real frames** ink in band 21% → 51%; `after` type 66px → 109px; hold 55%, no-reason card 42% with no reserved gap.
**Two mistakes caught mid-pass** multiplying emphasis onto a fitted scale overflows the band; height is not linear in scale because bigger type rewraps — a closed-form target overshot 62% → 85%.
**Defect exposed** the strike was one rule at `top: 50%` — an underline on a two-line before. Now a clipped `line-through` copy.

### #7 — §168 · Capture at the publishing shape
**Objective** the demo left ~28% of its band unusable and the product UI was unreadable.
**Root cause** aspect mismatch at the source: a 1280×900 desktop recording is 1.20:1 against a 0.81:1 band. No fitting rule reconciles that.
**Rejected** cropping harder — a portrait crop of the desktop layout cuts the second ingredient column, which is evidence.
**Decision** viewport → 430×932, matching `cook_mode_timer`; stale desktop `focusRegion` removed; footage bounded in both dimensions.
**Verified before spending** every selector was confirmed to resolve at the new viewport by walking the flow up to but not including submit — no adaptation credit consumed.
**Measured** band occupancy 65% → 100%; CSS→device scale 0.94× → 1.13×; no evidence cropped.
**Defect found** the media container was full-width, so the hairline traced a box around 55% empty ground. `alignSelf` did nothing — `Rise` is a plain block, not a flex parent.

### #8 — §169 · Evidence beat, provenance boundary, and a systems audit
**Date** 2026-08-23 · **Artifact** RecipeFix *1 Bowl Vegan Baked Oatmeal* (real MCP adaptation) · **Type** before_after · **Platform** 9:16 / 1080×1920

**Objective** finish the proof beat, then audit the whole creative and correction system rather than making another isolated fix.

#### Baseline (measured on a real render, band = 1152px)
HOOK 20% · DEMO 100% · CARD-1 56% · CARD-2 60% · **PROOF 21%**

#### Findings

| # | Finding | Class | Root cause | Outcome |
|---|---|---|---|---|
| 1 | Provenance died at the render boundary | **Defect** | `generate.ts` mapped plan beats into `input_props` as an object literal and never copied `sourcePath`. The plan-level test asserted provenance, so nothing failed. | Fixed. Mapping extracted to `beatsForRender` and guarded by tests. |
| 2 | Proof beat at 21% of its band | **Quality** | §167's problem in a different treatment: fixed type sizes (54px body). | Fixed. 21% → **50%**. |
| 3 | `EvidenceNote` rendered "WHY" over nothing when text was absent | **Defect** | No guard; the planner only emits the beat with a reason, so it was unreachable — until something upstream changes. | Fixed: renders nothing. |
| 4 | Note measured at the card's base, rendered at its own | **Defect (mine, same pass)** | Reused `cardDensityScale`, which measures against `CARD_TYPE.after` (66px), then drew at `NOTE_TYPE.body` (54px). Aimed at 62%, landed at 35%. | Fixed by extracting `fitScale`: the search is shared, **the measurement is not**. |
| 5 | Zero test coverage on every correction applier | **Defect (coverage)** | Controller decisions were tested since §165; the code that actually mutates artifacts was not. | Fixed: 18 tests, 3 tampers. |
| 6 | 13 dead production capture jobs | **Verified fixed** | `swap_toggle` selector drift killed the whole chain. §163's per-flow gate fixed it. | **13 dead before the fix deployed, 0 after; 10 captures succeeded since.** |
| 7 | `swap_toggle` selectors all dead in the live product | **Product limitation / external drift** | All five declared candidates return 0 on the live page — and the idle `/adapt` has no swap UI at all, so it cannot be re-derived without an adaptation. | Left alone; handled correctly by the per-flow gate + notification. |
| 8 | `SubstitutionExplainer` unreachable when `TransformationDiff` is enabled | **Architectural, benign** | Its condition (a reasoned swap) is a strict subset, and selection is fixed-priority. Reachable only via per-account composition enablement. | Documented, not changed. |

#### Creative-type selection — VERIFIED, unchanged
Audited across seven artifact shapes. It **refuses** (`null`) on an empty artifact, a null artifact and a note without text; it does **not** force everything into before_after — an artifact with no transformations correctly selects `ChefNoteCard`; `TransformationDiff` requires a real swap with both sides. The extension point for a second creative type is `CREATIVE_TYPES` + a sibling planner + a `TreatmentSet`. No change was warranted.

#### QC → correction coverage — VERIFIED
**92 gate rules → 11 distinct correction paths, zero unmapped.** Five escalate by design: `proof.empty`, `proof.no_consent`, `proof.no_source`, `proof.not_verbatim`, `visual.vision_rubric` (a model's overall impression is not a licence to rewrite a post).

#### Real renders
Four renders of the same artifact through the real pipeline. Final progression:
**HOOK 20% · DEMO 100% · CARD-1 56% · CARD-2 60% · PROOF 50%.**
HOOK at 20% is a centred 96px title and reads as deliberate — inspected, not a defect.

#### Tests
+23 (5 provenance boundary, 6 evidence note, 18 appliers − overlap). Tampers: note stops scaling (3 fail), empty-evidence refusal removed (1), note outgrows its transformation (1), provenance dropped again (2), `rebalanceBeats` invents a beat (2), `strongerBackdrop` loops (1), `correctionNote` drops the do-not-regress list (1). All restored.

#### Deployment / safety
Worker deployed, clean start. `publishing_enabled = false`, publications 0, publish jobs 0, items past approval 0. RLS enabled+forced on every production table. Append-only triggers present. No Anthropic spend; one RecipeFix credit was **not** spent this pass (the selector probe deliberately stopped short of submit).

---

### #9 — §170 · The loop closed, on OpenAI

**Date** 2026-08-23 · **Artifact** RecipeFix *Chewy Fudgy Frosted Brownies* item `0685510a` · **Provider** OpenAI `gpt-5.5` (explicit, Anthropic credit-blocked)

**Objective** platform + provider readiness audit, then prove the one disposition that had never executed.

#### The correction loop closed end to end

The previously-unproven case — *a correction that clears its targeted defect and
is accepted on the following pass* — **ran for real**, using the provider seam
that already existed (`LLM_PROVIDER=openai`). No new AI architecture.

| iteration | outcome | action | result |
|---|---|---|---|
| 0 | corrected | `remeasure` | visual/coherence were skipped-and-required |
| 1 | corrected | `rewrite_vo_script` | gpt-5.5, 1 attempt → **183 wpm → 172 wpm**, WER 1.6%, audio gate **passed** |
| 2 | **accepted** | — | all required gates pass |
| 4 | accepted | — | *"Iteration 2 is the best valid result; iteration 4 also passes but was not an improvement"* — best-iteration selection working |

#### Two defects, both only reachable by actually succeeding

1. **An accepted item never reached the approval queue.** `review_media` sets a
   failing item to `failed`; the correct branch moves it to `draft` during a
   rebuild; the accept branch promoted only `where status = 'failed'`. So a
   corrected-then-accepted item stayed in `draft` — out of the queue, with a
   history saying it passed. Fixed, narrowed to drafts *this loop* created (a
   prior `corrected` iteration is the evidence), so an operator's own draft is
   never pushed into the queue behind their back.
2. **A malformed history snapshot crashed the controller permanently** for that
   item: the regression check builds `previous` inline and bypassed the
   coercion in `toRecord`. Now one conversion, one place.

#### Verified, unchanged
- **Provider abstraction** — `resolveLlmProvider` / `modelsFor` / `createLlmClient` already support OpenAI as a first-class path; `describeLlmProvider` reports "chosen explicitly"; `agent_runs` records the real model (`gpt-5.5`, cost). Rule-11 recording is satisfied by existing telemetry. **No fallback was added** — selection is explicit, which is safer than silently retrying a second vendor.
- **Empirical chain** — `publish` → `publications` → `collect_metrics` (+1h, decay) → `post_metrics` → `score_performance` → `performance_scores`, with `historicalConversion` wired into idea scoring and `scorePerformance` excluding unmeasured posts. **No missing link.** The first real publication becomes the first empirical observation.
- **X capability** — one real `GET /users/me` probe (~$0.005): `live`, @Recipe_Fix, formats text/image/video. Recorded to `last_self_test_*`.

#### Real provider calls this pass
| call | provider | cost |
|---|---|---|
| liveness probe | OpenAI | ~$0.00001 |
| narration rewrite ×1 | OpenAI gpt-5.5 | ~$0.01 |
| vision review ×2 | OpenAI | ~$0.04 |
| voiceover ×2 | ElevenLabs | plan quota |
| capability probe ×1 | X | ~$0.005 |
| Anthropic | — | **none — credit-blocked, not called** |


### #10 — §171 · Platform readiness audit, and swap_toggle recovered

**Date** 2026-08-23 · **Spend** ~$0 (no Anthropic, no publish, no adaptation credit)

**Objective** production account readiness, then fix only real blockers.

#### Production account readiness — the honest matrix

| Platform | Adapter | Connect flow | Prod client creds | Verdict |
|---|---|---|---|---|
| **X** | ✅ full | OAuth | ✅ both tiers | **ready** — verified live |
| **Instagram** | ✅ full | OAuth | ✅ both tiers | **ready to connect** |
| **Threads** | ✅ full | OAuth | ✅ both tiers | **ready to connect** |
| **Bluesky** | ✅ full | app password | n/a by design | **ready** — needs only an app password |
| TikTok | ✅ full | OAuth | ✗ missing | operator: register app |
| Pinterest | ✅ full | OAuth | ✗ missing | operator: register app |
| YouTube | ✅ full | OAuth | ✗ missing | operator: register app |

All seven implement `publish`, `verifyCapabilities`, `collectMetrics`,
`fetchIdentity` and `refresh`; five implement `listComments` (not TikTok,
Pinterest). **Facebook is not a platform** — only Instagram's Graph host.

**No code defects in the account path.** `confirmConnection` sets
`capability_state` from the adapter's own report, so connecting X lands `live`
and publishes immediately once enabled; `draft_only` hands to manual publish
rather than pretending; `pending_auth`/`error`/`disabled` refuse.

**I nearly rebuilt Bluesky.** Its adapter expects a pasted app password and the
OAuth start route would emit a nonsense `BLUESKY_UNUSED` error — but the UI
branches to a real app-password form at `accounts/page.tsx:520` with a complete
server action. Already built; the nonsense error is unreachable. **VERIFIED.**

#### swap_toggle recovered — the diagnosis was wrong twice

Not selector drift (§159's read), not product removal (§170's read). The control
is where it always was, on `/` rather than `/adapt`, and **`flow.path` does not
navigate** — it is `sourceUrl` metadata. The flow inherited its page from
`adapt_and_reveal`, so as a root flow it searched `about:blank`. The failure
screenshot was blank white, which reads as "markup moved" rather than "page
never opened". Full reasoning in §171.

Verified the toggle does real work before filming it: jackfruit → "150g soy
curls, rehydrated in warm broth". Real capture: **1.29s at 1080×2340, zero
credits.**

#### Verified without changes
- **Empirical loop** — `publications` carries unique `(content_item_id, account_id)` *and* `(account_id, platform_post_id)` plus FKs to both parents; scoring reads `order by collected_at desc limit 1`, so repeated collection cannot inflate a score; `left join lateral` + §68 keeps unmeasured posts out. `collectionLifecycle.test.ts` already pins provenance, cross-account isolation, null-not-zero and empty-collection safety. **No new tests warranted.**
- **X publish path** — dry-run through `first-contact --dry-run`: exact request `POST https://api.x.com/2/tweets`, 244/280 chars, **$0.015**, kill switch correctly reported paused. **$0 spent.**
- **`historicalConversion` grain** — scoped by `product_id`, grouped by category, pooling across platforms within a product. A deliberate grain choice with zero data behind it; revisit when real scores exist, not before.


## NEXT RUN MUST READ THIS

**Just solved — do not rediscover:**
- **swap_toggle is fixed** (§171). It was never a selector problem. `flow.path` is metadata and does not navigate; a root flow needs its own `goto`. A test now pins that for every independent flow.
- **Bluesky is already connectable** — app-password form + server action exist. Do not build it.
- The account path has **no code defects**. TikTok/Pinterest/YouTube need developer apps registered; that is operator work, not engineering.
- The empirical loop is verified and already tested. Do not add tests to it without a specific new failure in mind.
- The correction loop is proven end to end (§170). Use `LLM_PROVIDER=openai`; do not build failover.

**Blocking for production, in order:**
1. **Production has zero connected accounts.** X, Instagram, Threads and Bluesky can all be connected today — credentials are in place for the first three, Bluesky needs only an app password. Until then the deployed worker cannot publish anything.
2. **`OAUTH_REDIRECT_BASE_URL` is unset in both tiers.** OAuth falls back to request origin, which on Vercel differs between the stable alias and per-deployment URLs. Set it to whatever is registered in the X/Meta developer apps — I did not set it because a wrong value breaks OAuth that currently works.
3. **The X post is still pre-flighted and unpublished** — `260769d6`, $0.015, dry-run verified. Needs `publishing_enabled=true` + approval, both operator acts.

**Known quality issue:** a sign-in modal overlays the lower third of the new
swap_toggle footage. The swap and its reason are above it and legible. Fixing it
wants an optional `setup` dismiss step like `adapt_and_reveal` has for the App
Store banner — selector not yet verified, and this pass does not guess.

**Blocked by Anthropic:** nothing.
