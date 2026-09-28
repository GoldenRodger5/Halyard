# Halyard v2 creative variety + calibration checkpoint — 2026-09-27

**Purpose:** move from “the publishing plumbing works” to “Halyard reliably produces varied, platform-native creative worth publishing,” without turning RecipeFix into the architecture.

## Governing principle

RecipeFix is the first proof product, not the design center. The same contracts must work when any product is connected: its Product Brain supplies truth, audience, brand, capabilities and evidence; Halyard supplies product-neutral creative strategy, production routing, review, publishing and learning.

No product name, food assumption or RecipeFix-specific vocabulary belongs in the shared creative machinery.

## What changed in this pass

1. Opening-run variety is now explicit instead of category → one permanent treatment.
2. Empty editorial configuration uses a transparent product-neutral cold-start prior instead of becoming 100% education.
3. A cold product stages its whole launch plan but queues only a small representative calibration set.
4. One CreativePackage locks one real product artifact so cross-platform variants stay about the same evidence.
5. Missing product identity fails closed instead of silently borrowing RecipeFix.
6. Paid-job budget preflight can reserve a quoted/capped job before execution.
7. Platform strategy language was tightened around current platform-native behavior rather than universal “viral” rules.

## Creative variety contract

A creative package now carries a reusable product-neutral shape across five axes:

- treatment;
- opening style;
- media mode;
- audio mode;
- caption job.

Examples of opening styles include result-first, motion-first, question-first, contrarian, search-answer, side-by-side, mechanism-first and proof-first.

Examples of media modes include real-product proof, mixed B-roll + capture, motion editorial, designed static, text-native and search utility.

The package keeps its underlying premise/evidence, while each destination adapts the execution:

- TikTok: native motion/curiosity and conversational close;
- Instagram: saveable visual payoff and strong first frame;
- YouTube Shorts: packaging/promise alignment and search/satisfaction;
- Pinterest: search/save utility, vertical design, explicit context;
- X / Threads: genuinely text-native conversation rather than pasted video captions.

This is not a list of product topics. Product topics still come from that product’s Brain.

## Cold-start calibration policy

Halyard still plans the full rolling launch, but expensive production should not fan out across every planned placement before any recipe has earned trust.

The initial selector therefore chooses at most six regular placements that maximize:

1. distinct media formats;
2. distinct platforms;
3. distinct content categories;
4. distinct treatments;
5. earliest useful scheduled work as the tie-breaker.

Account-introduction posts are fallback-only calibration candidates. Calibration dollars should first prove reusable editorial shapes, not six versions of “hello.”

The current product-neutral default mix, used only when a product has no configured/learned mix, is:

- education 35%;
- transformation 25%;
- community 20%;
- product proof 20%.

Measured performance or explicit product strategy should replace this prior as soon as evidence exists.

## Production ownership

Halyard remains the creative operating system.

- **Product Brain / evidence** — tells Halyard what is true and what the audience/product actually is.
- **Halyard strategy + CreativePackage** — decides why the post exists and the native executions.
- **Halyard Capture** — truth-critical product proof.
- **Higgsfield** — bounded premium illustrative source footage when it materially improves a beat; never fake product UI/proof.
- **Canva** — curated designed statics/carousels when configured; Halyard native render remains the deterministic fallback.
- **ElevenLabs** — narration only when the creative intentionally needs it.
- **Halyard Render / Remotion** — final assembly, overlays, captions, motion and mixed real/synthetic sources.
- **Blotato visual** — legacy/fallback producer, manual during calibration.
- **Blotato transport** — unified publishing/scheduling after finished-asset approval.

No provider is the creative director.

## Spend policy

The operator ceiling for this calibration cycle is **$5 total**.

This pass spent **$0 on paid visual generation**. Higgsfield has not been invoked for a paid job.

The correct sequence is:

1. prove premise/copy/real capture/native render cheaply;
2. identify the exact beat where generated source footage would materially improve the finished creative;
3. cost-preflight it;
4. spend only if the remaining run budget covers it;
5. inspect the actual output before accepting the provider/capability recipe.

## Quality standard for the first real calibration pack

The first pack should not be six variations of an ad. It should deliberately cover materially different audience experiences:

1. **Proof / transformation short** — real product capture is the proof; generated B-roll is optional support only.
2. **Teach short** — useful even without installing the product; motion/editorial or real-world visuals.
3. **Instagram carousel/static** — one idea per slide, saveable reference value, no PowerPoint density.
4. **Pinterest utility Pin** — vertical, searchable, durable, destination-intact, useful enough to save.
5. **X / Threads native post** — conversation/insight written for text, not a transcript.
6. **Exploration slot** — a materially different treatment/opening/audio mode that gives the learner new information.

Each finished artifact is judged on the actual file/post: first frame/line, first seconds, progression, proof, pacing, composition, captions, audio, payoff, product truth, native fit, repetition and AI-slop signals.

A render that is technically valid but creatively weak is rejected.

## Verification

On this checkpoint:

- fresh migrations through schema 0087 apply successfully;
- generated database types are current;
- all packages typecheck;
- lint has zero errors;
- 302 test files / 4,005 tests pass;
- production web build passes;
- focused creative-variety / launch / budget tests pass 45/45.

No public social post was sent by this implementation pass.

## Live calibration finding: workflow skips must be execution boundaries

The first live Pinterest calibration completed its text/copy loop and correctly rejected an overstated claim plus a weak payoff before revising only the defective copy. The next selected Threads piece exposed a separate production bug: its resolved `caption_only` workflow explicitly skipped assets, but legacy downstream code still opened the asset lane and bought/generated an illustrative image.

The worker was stopped immediately. The defective run is retained as failed calibration history and its stray media was detached from the social item.

`generate.ts` now makes the resolved workflow authoritative: when `assets` is absent, Halyard does not call photographic-subject, image generation, still/story/carousel rendering, or record an image-agent consumption. This rule is product- and platform-neutral; a text-native post for any future connected product gets the same protection.

At discovery, recorded Halyard spend for the day was **$0.3683**, still below the $5 calibration ceiling.
