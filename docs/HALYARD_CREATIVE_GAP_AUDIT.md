# Halyard Creative Gap Audit

**Audit date:** 2026-08-28  
**Scope:** 129 test files, 22 agents, 50 migrations  
**Method:** source, schema, live production DB, and job history  
**Audit mode:** read-only; this document records the baseline and does not itself modify implementation.

## Executive finding

Halyard's creative pipeline is substantially built but has not been exercised end-to-end in production. Production history shows:

- `generate`: 7 jobs → 1 content item
- `render`: 0 jobs
- `tts`: 0 jobs
- `review_media`: 0 jobs
- `publish`: 0 jobs
- Production renders: **0**
- Production creative QA runs: **0**
- Production music beds: **0**
- Production content items: **1**
- Registered agents: **22**
- Tests passing at audit: **2307**

Therefore local tests and local renders prove implementation paths, not production operation or production creative quality. This is the first priority: run the real pipeline against real data and make the complete loop observable.

## 1. Current architecture

| Component | State | Evidence / location | Gap |
|---|---|---|---|
| Discovery | Partial | `handlers/{signals,watch,reviews,appStore,detectRelease}.ts`, `discovery/freshness.ts` | Five collectors; no trend velocity, competitor or creator scouting |
| Social intelligence | Partial | `social/{portfolio,recommendations}.ts`, `handlers/accountIntelligence.ts` | Distribution/recommendations exist but job is not scheduled; zero rows |
| Strategy | Partial | `strategy/decide.ts`, `strategy_decisions` | Deterministic objective/timing/metric/refusal logic; zero rows because generation barely ran |
| Copy generation | Real | `generation/{copywriter,prompts,formatPrompts}.ts` | Strongest part; 12 format specs and per-platform drafts |
| Hook generation | Real | `generation/hooks.ts`, `hook_variants` | Eight hook families, scored and payoff-verified |
| Image generation | Partial | `imagery/{types,openai}.ts` | Provider seam and provenance/licence rules exist but pipeline never calls it |
| Video render | Partial | `render/src/video/*`, `worker/video.ts` | Remotion and four compositions; real capture; still card-based with limited motion |
| Voiceover | Real | `generation/speech.ts`, `handlers/tts.ts` | ElevenLabs, normalization, Whisper WER verification, pronunciation lexicon |
| Music | Missing | `worker/bed.ts`, `LibraryBedClient` | Mixer/ducking tested but library contains zero beds |
| Sound design | Missing | — | No SFX concept |
| Product capture | Real | `capture/flows.ts`, `capture_runs` | Playwright captures real product; 89 runs, 2 usable clips |
| Long-form YouTube | Missing | `youtube/variant.ts` | Adapter/validation/copy spec exist but no 16:9 template |
| Creative QA | Partial | `qc/*` | Nine real gates; never executed in production |
| Self-correction | Partial | `correction/*`, `content_iterations` | Complete bounded loop locally; one production run but no production renders |
| Learning loop | Partial | `learning/insights.ts`, `learned_insights` | Built and consumed but jobs are never scheduled |
| Scheduling | Real | `scheduling/{cadence,stagger,timezone}.ts` | Slots, jitter, density warnings and timezone handling exist |
| Approval boundary | Real | `handlers/publish.ts`, `approvalBoundary.test.ts` | Idempotency, kill switch and per-item human approval are well tested |

## 2. Agent inventory

There are 22 registered agents, all with implementations and callers. There are no documentation-only stubs. The registry covers words much better than visuals.

| Team | Agents | Coverage |
|---|---|---|
| content | 6 | copywriter, vo-scriptwriter, hook-generator, copilot, idea-generator, auto-clip |
| product_intelligence | 6 | product-discovery, store-listing, code-intelligence, visual-brand, product-reconciler, shipped-feature-summariser |
| founder | 4 | take-drafter, take-strengthener, take-fact-checker, find-drafter |
| quality | 2 | payoff-verifier, vision-describer |
| learning | 1 | rejection-clusterer |
| engagement / setup / explorer | 3 | reply-drafter, setup-kit-writer, explorer-discovery |

Structural gap: every registered agent is `kind: model`; deterministic services such as treatment selection, portfolio analysis, strategy and copy budgeting are outside the registry. No registered role owns visual direction, concept selection, editing, sound, or long-form production.

Overlap: hook-generator/copywriter both produce opening lines; take-drafter/take-strengthener/find-drafter overlap heavily.

## 3. Creative Studio target vs current state

| Target role | Current | Required end state |
|---|---|---|
| Trend Scout / Validator | Partial | Discovery service + model relevance scoring |
| Competitor / Creator / Community Scout | Missing | Agent + platform search tools |
| Content Gap Analyst | Partial | Deterministic portfolio analysis |
| Account / Audience / Pattern Analyst | Partial | Deterministic distribution/cohort analysis |
| Performance Analyst | Partial | Deterministic metrics/learning service |
| Campaign / Content / Platform Strategist | Partial | Deterministic strategy with refusal rules |
| Portfolio Manager | Real | Retain |
| Creative Director | Partial | Agent choosing creative direction/concept |
| Concept Generator | Missing | Agent producing multiple materially different concepts |
| Hook Specialist | Real | Retain and connect to visual opening |
| Story Architect | Partial | Per-piece story/beat structure |
| Visual Director | Missing | Agent selecting imagery, framing, palette and visual treatment |
| Motion Designer | Missing | Motion/transition/kinetic-type service |
| Video Editor | Missing | Sequence, cut, transition and timeline composition service |
| Music / Sound Director | Missing | Licensed library selection + SFX/audio treatment |
| Voice Director | Partial | Per-piece voice/style/direction |
| Humanization Editor | Partial | Deterministic slop filter |
| Long-form producer chain | Missing | Full landscape YouTube chain |
| Thumbnail Director | Missing | Thumbnail generation/validation |
| Creative / Retention / Technical Critic | Partial | Production artifact inspection |
| Originality Critic | Partial | Cross-account treatment/repetition checks |
| Self-Correction Agent | Partial | Keep bounded policy-driven controller |
| Creative Memory | Partial | Learned insights + iteration history |

The key architectural principle is that not every role should be an LLM. Arithmetic, policy, metrics, portfolio analysis, strategy, self-correction, and QC should remain deterministic services. Judgement-heavy roles should use agents.

## 4. Content quality baseline

### Static posts

Brand tokens, safe areas, contrast checking, aspect consistency, and typography are strong. The missing ingredient is legitimate photography/imagery; current artifacts are often type on flat ground.

### Short-form video

**Real:** hook in frame 1 after recent fix; seven treatments; pacing; product capture; voiceover; captions.  
**Missing/partial:** rich opening imagery, multiple camera movements, kinetic typography, transitions, layered depth/parallax, b-roll concept, music, SFX, and platform-specific render variants.

Current motion is essentially one Ken Burns push on media beats. That is why output can read as a slideshow rather than a professional edit.

### Long-form YouTube

Effectively absent. Adapter, validation, and copy distinction exist, but there is no 16:9 rendering surface, chapter production, long-form research/story pipeline, thumbnail pipeline, or Shorts extraction.

## 5. Content creation UX

The compose surface is a 203-line streaming chat with a 480p preview pane.

Works: open compose, describe intent, request ideas, generate, progress, preview, approve/reject/schedule.  
Missing: multiple genuinely different concepts, concept selection, creative-direction configuration, side-by-side platform previews, and first-class targeted revision controls.

The highest-value UX gap is a proper concept-selection studio: Halyard should propose several materially different directions and let the operator choose before generation.

## 6. Multi-platform intelligence

Copy is already platform-native: separate model calls, 12 format specs, per-platform briefs, hashtag ranges, link strategy, destination routing, and length budgets/overflow.

Media is not platform-native. `publish.ts` currently reuses the same `render_ids` across destinations. TikTok, Reels and Shorts therefore receive the same file rather than distinct edits.

Required end state: one strategic creative idea with platform-specific executions for TikTok, Instagram Reels, YouTube Shorts, Pinterest, X, and YouTube long-form where appropriate.

## 7. Real media pipeline

Current path:

`idea → strategy → script → beats → assets → voice → timeline → render → QA → revision → final`

The missing structural layers are concept, storyboard, music/sound, rich visual direction, and platform-specific editing. Beats currently live inside `renders.input_props`; concepts and creative briefs are not first-class entities.

Required end state:

`signal/discovery → idea → strategy → concepts → selected concept → creative brief/storyboard → platform creative plans → assets → voice/music/SFX → timeline → platform render variants → QA → correction → approval → scheduling/publish → metrics → learning`

## 8. AI-generated media and evidence

The evidence rule is intentionally strict:

- Generated imagery may illustrate; it may never be evidence of the real product.
- Product-shaped generated imagery is refused before provider invocation.
- Generated stills cannot occupy demo/proof/before/after/change roles.
- Artifact-level QC fails fabricated evidence and escalates rather than pretending it can correct provenance.

RecipeFix's Discover API provides publisher photographs with an explicit restriction against re-hosting/presenting them as RecipeFix assets. Therefore legitimate image sources are owned product captures, operator-supplied/licensed assets, generated atmosphere used only illustratively, and attributed inset usage where explicitly permitted.

## 9. Self-correction

The correction path is real: diagnose → smallest permitted change → render → review → record iteration → regress/escalate. `content_iterations` records defects, snapshots, actions, reasons, invalidated gates, regressions, cost and outcome.

There are 19 local iterations across 5 items and one production correction run, but production rendering has never actually exercised the full loop.

## 10. Learning loop

Learning uses sample size × effect size for confidence; contradictions reduce confidence/status. Learned insights influence treatment selection and are named in strategy decisions.

The blocker is orchestration: `learn_from_performance` and `build_account_intelligence` have handlers/policies/job kinds but are absent from `scheduler.ts`, so both tables remain empty.

Current metrics include impressions, reach, likes, comments, shares, saves, views, watch time, profile visits, link clicks and follows. Current feature coverage includes creative type, format, posting hour and duration; hook family, audio characteristics, voice style and imagery usage should be added.

## 11. Social engine

The current ranking model is appropriately evidence-bound: relevance beats raw reach, recommendations require evidence, and autonomous executable actions are prohibited by `assertNoAutonomousAction`.

Missing: platform search endpoints and broad creator/community/competitor discovery. The social graph is currently inward-facing.

## 12. Data/schema gaps

Lineage is strong from signals through publication and learning. Missing first-class creative structures are:

- `concepts`
- `creative_briefs`
- per-platform render variant links
- experiments beyond hooks
- asset-level licence/provenance metadata matching the image contract

## 13. Testing baseline

At audit time: **129 suites / 2307 tests**, including 36 DB-backed integration suites and 26 Playwright suites. Quality-gate assertions exist. Only one real-render acceptance script exercises actual creative output, with no per-treatment/per-platform baselines.

Untested in production/entirely: music selection, long-form rendering, platform render variants, and scheduler coverage for the unscheduled learning/intelligence jobs.

## 14. Quality benchmark

| Dimension | Target | Auto-reject |
|---|---|---|
| Hook | ≤8 words, frame 1, contrast ≥4.5:1, hook-writer source | Empty/absent opening hook |
| Opening motion | Tonal-range delta >0.02 in first 2s | Static qualified window |
| Pacing | No static stretch >15s; state change per beat | Gap beyond interrupt ceiling |
| Text density | ≤14 words/beat in punch register | >2× ceiling |
| Frame usage | ≥80% band usage | >40% empty ground |
| Product evidence | Footage/owned imagery on demo beat when capture exists | Card-only while footage exists |
| Fabrication | No generated evidence | Always reject/escalate |
| Audio | −14 LUFS ±1, true peak <−1 dBTP, WER <2% | Silent or WER failure |
| Originality | Treatment differs from last 2 account posts | Same treatment 3 in a row |
| Accessibility | Alt text; caption drift <150ms; contrast ≥4.5:1 | Missing alt text |
| Platform fit | Caption/hashtag/aspect constraints satisfied | Ceiling/aspect failure |

## 15. Gap matrix

### P0
- Production pipeline execution
- Learning/intelligence jobs scheduled
- Music library populated and music used in video
- Legitimate imagery/visual asset pipeline
- Concept generation and selection
- Professional motion beyond one push

### P1
- Per-platform render variants
- Creative-quality regression suite with baselines
- Long-form YouTube
- Thumbnails
- Visual Director role

### P2
- Creator/community discovery
- Sound design

### P3
- Experiments beyond hooks

## 16. Architectural recommendations

### Keep
Approval/idempotency, correction controller, QC architecture, timing/beat model, capture pipeline, adapters/capability model, scheduling, and lineage.

### Extend
`creative/treatments.ts` with concepts; `render/video` with transitions, kinetic type and landscape composition; learning with hook/audio/imagery features; scheduler with the missing jobs.

### Refactor
Make creative briefs first-class instead of hiding beats inside render props. Consolidate overlapping founder drafting agents where safe.

### Build
Visual Director, Concept Generator, Music Director/library, motion system, video editor/compositor, long-form chain, thumbnail system, production creative baseline suite.

### Service vs agent boundary
Use agents for taste/judgement: concept generation, creative direction, visual direction, voice direction, trend/creator relevance. Use deterministic services for arithmetic/policy: portfolio, strategy, performance analysis, treatment selection mechanics, self-correction, humanization, QC and scheduling.

### Orchestration
Continue using the durable `jobs` system as coordinator. New creative stages should be explicit job kinds with idempotency, retry policy and observability.

## 17. Final baseline conclusion

Halyard already has unusually strong foundations: platform-native copy, hooks, evidence/provenance rules, bounded self-correction, artifact-level QC, capture infrastructure, lineage, scheduling and approval safety.

The professional-grade gap is the layer between a beat plan and a finished edit: concept selection, visual direction, imagery, motion, music, sound, platform-specific editing, long-form production and thumbnails. The learning and discovery loops also exist structurally but need orchestration and richer inputs.

**Definition of completion for this audit:** no creative capability remains `Partial` or `Missing`; every production path is executed against real data; every generated artifact is rendered and QA'd; correction is exercised; platform variants are verified; learning/intelligence jobs populate and affect later decisions; and the Creative Studio can take an operator request or generate ideas, produce professional platform-specific creative, obtain human approval, schedule/publish safely, and learn from results.
