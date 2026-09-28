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

## 2026-09-28 live finished-creative review

The first real calibration pack proved the architecture boundary and also proved that **the current outputs are not yet automation-approved**. No public post was sent.

### What the actual outputs showed

- **Pinterest:** the generated lemon-oats photograph was believable and usable as source imagery, but too generic to carry the Pin by itself. Pinterest now routes search-utility work to a designed 2:3 utility composition (`pin_stack` / `pinterest_tall`) instead of treating a raw photo as the finished creative.
- **Threads:** the text was technically grounded but read like an internal QA report ("this check kept..."). The text critic now has an explicit `text.internal_work_log` defect and can recover the exact slot when the critic quotes a line but misses its slot id.
- **TikTok:** the rendered 28.9s quiz was visually polished frame-by-frame but used essentially one static energy-ball background. Root cause: the selected CreativePackage was `comparison` / motion-first, while the legacy category mapping silently replaced it with `quiz`. Comparison already had a real Narrative video builder; Halyard now keeps the selected treatment, advertises comparison as a short-video format, promotes static/text media modes into a real moving-media mode on video destinations, and blocks finished work that promises motion but collapses into cards.
- **YouTube Short:** this was the strongest first render: multiple shot types, useful text moments and real visual progression. It still failed the publish bar because the close showed **oranges** while the beat/copy said **lemon**, and one oats-pour visual repeated. Finished-media coherence now compares sampled frames against the subject expected at that exact beat; hook/payoff/close subject mismatches are blocking errors.
- **X:** the candidate was refused rather than shipped because the copy/claim gates did not pass. That is a successful refusal, not a missing deliverable.
- **Instagram:** the artifact-backed transformation path initially failed its own asset dependency because `transformation` does not use the generic format writer. That execution boundary was repaired and proven live, but the next full calibration attempt was stopped by the spend guard before another paid run. Instagram remains **uncalibrated**, not silently accepted.

### Spend outcome

The hard operator ceiling remained **$5 total**. No paid Higgsfield generation was submitted. During the final Instagram retry the budget guard measured about **$4.32** of paid calls and refused a job capped at $0.75 because it would knowingly cross $5. The guard was not overridden.

### What is accepted now

Accepted as architecture/quality rules:

- CreativePackage treatment controls downstream format selection.
- Video destinations cannot remain in `text_native`, `designed_static` or `search_utility` execution modes.
- Motion promises are checked against the finished beat/media structure.
- Beat-level subject fidelity is checked against actual sampled frames.
- Pinterest utility creative is designed information, not a naked generated photo.
- Internal system/QA language is a named copy defect.
- One bad component should be repaired in isolation; a technically valid render is not a reason to regenerate or approve the whole post.

**No RecipeFix production recipe from this first visual pack is accepted for unattended automation yet.**

### Next calibration run

Spend only on the failed component, in this order:

1. regenerate TikTok as the intended moving comparison, not a quiz;
2. replace only the wrong/repeated YouTube visual beats using existing or correctly sourced lemon/oats media;
3. render the designed Pinterest utility Pin from the already-written information;
4. rewrite Threads from the audience point of view without system-report language;
5. finish and visually inspect the Instagram carousel when the next budget window opens;
6. rewrite X shorter and claim-safe.

Only after these actual finished exports pass visual review should a production recipe be accepted or a first-contact Blotato post be attempted.

## 2026-09-28 merged-main integration checkpoint

The V2 calibration branch was merged locally with current `main` before release rather than relying on GitHub's synthetic merge alone. This pulled in the current MomentCircuit cloud-render / Content Rewards work and exposed several repository integration defects that were unrelated to the creative engine but would have made the merge red.

Repairs made on the combined tree:

- reserved no-op migrations **0088** and **0089** make the already-shared 0090+ MomentCircuit lineage contiguous without renumbering history;
- migration **0096** forces RLS on the two private MomentCircuit queue tables and becomes the current schema marker;
- `EXPECTED_SCHEMA_VERSION` is **0096** and generated database types now cover **83 tables**, including both MomentCircuit queue tables;
- the V2 QC rules `text.internal_work_log`, `creative.motion_plan_not_honoured` and `coherence.beat_subject_mismatch` now have explicit correction policies rather than accidental namespace inheritance;
- MomentCircuit's internal render secret is documented in `.env.example`;
- the design-token audit no longer mistakes SVG `text-anchor` markup for a Tailwind text-colour utility;
- the MomentCircuit Content Rewards bootstrap script has zero lint errors.

Exact merged-tree verification:

- migrations apply cleanly through **0096**;
- generated DB types match the migrated schema;
- all packages typecheck;
- lint has **0 errors**;
- **302 test files / 4,019 tests pass**;
- the real Remotion/Chromium render tests pass;
- the production Next.js build passes.

### Second-pass visual review

**Pinterest utility recipe — visual recipe accepted.** The new deterministic `pin_stack` render was inspected at 1000×1500. It is clean, native to a save/search surface, immediately scannable, and materially better than the first generic AI-food-photo finish. This accepts the *production visual shape*, not every piece of copy placed into it; claims still pass their normal evidence/copy gates.

**YouTube repair — improved but not yet an unattended recipe.** The orange-for-lemon closing beat was removed without buying a new asset. A second deterministic render closes on an existing oatmeal + lemon image and is semantically much stronger. Review also exposed that the opening stock clip is labeled as lemon-over-oats while its pixels show lemon being squeezed into a metal bottle. The new beat-level coherence rule is specifically intended to block that kind of mislabeled stock. The recipe remains unaccepted until the opening ground is replaced with semantically correct existing motion or the screenplay is restaged.

**TikTok / Threads first-pass recipes remain rejected for automation.** TikTok's first render was the wrong static quiz treatment for a motion-first comparison; Threads read like an internal QA note. The source fixes that caused those failures are now implemented and release-green, but the recipes must earn acceptance on fresh finished exports.

### Spend discipline

The complete Sept 27→28 calibration cycle has recorded **$4.319496** in paid agent calls against the operator's **$5 total ceiling**. Midnight does not reset that operator cap for this exercise. Remaining calibration work therefore defaults to already-paid assets, deterministic Halyard rendering, existing product capture, and text/render repair. No paid Higgsfield generation has been submitted.
