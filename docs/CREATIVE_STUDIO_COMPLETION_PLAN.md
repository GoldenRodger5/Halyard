# Halyard Creative Studio — Completion Plan

**Status:** Implementation specification  
**Date:** 2026-08-28  
**Priority:** Product-critical

## 1. Purpose

This document defines the remaining implementation required to make Halyard's creative system a production-grade, intelligent content studio rather than a collection of individually working generators.

The target is a closed system that can discover opportunities, understand each connected account, generate several materially different creative directions, select and produce professional media, adapt it independently for every destination, critique and revise its own work, present the result in Studio for human approval, publish only after approval, measure the outcome, learn from it, and use that learning to improve the next decision.

The system must remain deterministic where correctness, safety, provenance, scheduling, licensing, budgets, platform constraints, and approval boundaries are involved. Models provide judgement, perception, ideation, writing, and creative alternatives; deterministic services validate, rank where arithmetic is sufficient, enforce policy, and execute.

Do not replace the existing jobs architecture, approval boundary, correction controller, capture system, adapter capability model, QC gates, timing engine, or lineage model. Extend them.

---

# 2. Target operating loop

Halyard must implement this complete loop:

```text
external signals + platform observations + account history + product evidence
        ↓
Discovery Team
        ↓
trend / conversation / creator / competitor / content-gap opportunities
        ↓
Social Intelligence + Account Intelligence
        ↓
opportunity score + audience fit + platform fit + timing + saturation
        ↓
Strategy
        ↓
creative brief
        ↓
Concept Generator
        ↓
3–5 materially different concepts
        ↓
Creative Director
        ↓
concept selection / remix / rejection reasons
        ↓
Visual Director + Story Architect + Motion Director + Voice Director + Sound Designer
        ↓
platform-specific creative plans
        ↓
real product capture / owned imagery / licensed audio / permitted generated atmosphere
        ↓
script + storyboard + assets + timeline
        ↓
platform render variants
        ↓
Creative Critic + technical QC + evidence/licence/provenance checks
        ↓
Self-correction loop
        ↓
final approved candidates
        ↓
Studio preview
        ↓
human approve / reject / revise
        ↓
intelligent scheduling + platform-native publishing
        ↓
performance collection
        ↓
performance analysis + creative attribution
        ↓
learned insights
        ↓
Discovery / Strategy / Concept / Creative decisions improve
        ↺
```

Every stage must have lineage so an operator can answer: **why was this made, why this concept, why this visual treatment, why this audio, why this platform variant, why this time, and what did Halyard learn afterward?**

---

# 3. Creative quality is the primary product requirement

Halyard must not optimize for merely valid or technically compliant media. The generated result must look and sound like professionally produced social content.

Short-form output must support, dynamically selected per piece:

- strong hook in the opening frame and opening seconds
- real product demonstration when product evidence exists
- real owned/operator imagery when available
- permitted generated atmosphere only for illustrative roles
- kinetic typography
- multiple entrance/exit grammars
- multiple camera movements
- zooms and reframes
- layered composition and depth
- parallax where appropriate
- transitions appropriate to the treatment
- visual emphasis changes
- b-roll where legitimate media exists
- fast, intentional pacing
- varied shot durations
- beat-synchronised motion
- captions that are part of the composition, not an afterthought
- voiceover with deliberate delivery direction
- music selected for the individual piece
- ducking around narration
- sound effects selected for actual visual events
- varied typography and font systems
- varied visual languages
- varied openings
- varied treatments
- platform-specific aspect, density, pacing, copy, audio, and composition
- natural, human copy
- no repetitive AI phrasing or generic filler
- a clear payoff
- a useful or entertaining reason to continue watching

No single visual language, font pairing, opening, transition, music bed, or motion pattern may become the de facto default simply because it is easiest to render.

The system should deliberately maintain controlled creative variety while learning which varieties work for each account and audience.

---

# 4. Creative team

Implement the creative organization as a coordinated team. Existing roles should be reused and extended rather than duplicated.

## Creative Director

Owns the overall creative decision.

Inputs:
- objective
- audience
- opportunity
- account identity
- platform requirements
- learned insights
- available assets
- previous creative fatigue
- concept candidates

Outputs:
- selected concept or remix
- creative brief
- treatment
- visual language
- emotional angle
- pacing target
- intended viewer response

## Concept Generator

Generate 3–5 genuinely different concepts, not five rewrites of one premise.

Each concept must contain:
- premise
- hook direction
- story/payoff
- product role
- visual idea
- motion idea
- audio idea
- platform suitability
- required assets
- risks
- expected objective

Concept diversity must be measurable by premise, structure, hook family, treatment, visual language, and emotional angle.

## Visual Director

Choose:
- visual language
- composition
- imagery role
- framing
- typography system
- font family
- contrast strategy
- safe-area treatment
- depth/layering
- color/palette within brand constraints
- product-evidence placement

It must never fabricate product UI or product evidence.

## Story Architect

Turn the concept into a beat-level narrative.

Support different structures such as:
- problem → reveal → solution
- before → change → after
- listicle
- tutorial
- myth → correction
- comparison
- feature demonstration
- story/payoff
- curiosity loop
- long-form chapter narrative

Every beat must define purpose, expected duration, visual state, narration, caption, product evidence, motion, and audio event.

## Motion Director

Choose motion grammar rather than applying one global animation.

Support:
- push
- pull
- pan
- zoom
- crop/reframe
- kinetic word emphasis
- staggered text entrances
- exits
- wipes
- match transitions
- directional transitions
- depth/parallax
- beat-synchronised changes
- speed ramps where appropriate

Motion must be purposeful and constrained by platform and treatment.

## Voice Director

Select voice characteristics and delivery direction per piece:
- voice
- pace
- energy
- warmth
- authority
- conversational quality
- emphasis
- pauses
- pronunciation

The system must support multiple available voices and learn which voice characteristics perform well for each account/content type.

## Sound Designer

Choose:
- music
- SFX
- music entry/exit
- ducking
- event synchronisation
- audio intensity

All production audio must have provenance and licence metadata.

## Platform Creative Director

Convert the canonical concept into independent platform variants.

A platform variant is a creative adaptation, not simply a different caption.

---

# 5. Professional short-form renderer

Extend the existing Remotion system into a real editing grammar.

## Required capabilities

- portrait 9:16
- square where useful
- landscape 16:9
- layered media
- multiple media tracks
- compositing
- motion primitives
- kinetic typography
- transitions
- b-roll sequencing
- beat-level timing
- caption animation
- product-demo framing
- image treatment
- depth effects
- controlled texture/atmosphere
- dynamic cropping
- safe-area awareness
- platform-specific typography scale
- audio synchronisation

The renderer must consume a first-class creative brief/storyboard rather than inferring all creative structure from opaque render props.

## Dynamic variety

Creative selection must avoid immediate repetition using recent account history. Rotation must consider:

- visual language
- font family
- typography system
- opening family
- treatment
- motion grammar
- transition family
- music
- SFX palette
- voice
- duration bucket
- composition

Variation must remain coherent with account identity. Randomness alone is not acceptable.

---

# 6. Imagery and provenance

Image roles must remain explicit:

- `owned_evidence`
- `owned_atmosphere`
- `operator_supplied`
- `licensed_attribution_required`
- `generated_atmosphere`
- `generated_evidence_forbidden`

Third-party publisher images must never silently become RecipeFix assets. Attribution-required images may only be used where the licence and composition explicitly support that use.

Generated imagery may illustrate mood, ingredients, texture, or atmosphere, but must never represent an actual RecipeFix UI state, result, product action, or other evidentiary claim.

Every media asset must retain provenance/licence/source metadata.

---

# 7. Music and sound

The music system must be content-aware and learning-aware.

Track metadata must include at minimum:

- provenance
- licence proof
- licensor/source
- allowed platforms
- vocals/instrumental
- BPM
- energy
- mood
- genre/style
- instrumentation
- duration
- loopability
- account restrictions
- usage count
- recent usage
- last-used time

Selection should consider:

- concept emotional angle
- visual language
- motion intensity
- cut rhythm
- narration presence
- narration density
- platform
- recent account usage
- track fatigue
- platform restrictions
- learned performance

SFX must similarly support role, intensity, timing, licence/provenance, platform restrictions, and usage history.

The final mixed artifact is the source of truth for audio QC.

Production audio must never be represented by an unlicensed fixture.

---

# 8. YouTube long-form

Implement a complete long-form production chain.

Required stages:

1. topic/opportunity
2. research/evidence collection
3. concept candidates
4. selected premise
5. long-form narrative architecture
6. chapter plan
7. script
8. storyboard
9. product demonstrations
10. supporting legitimate imagery/B-roll
11. voiceover
12. music
13. SFX
14. landscape render
15. thumbnail candidates
16. title/description/chapter metadata
17. creative/technical QC
18. self-correction
19. Studio preview
20. approval
21. publishing
22. Shorts extraction
23. cross-platform derivative creation

Long-form must not simply stretch a Short into 16:9.

Support multiple narrative structures and sufficient visual changes to avoid long static sections.

## Thumbnails

Generate multiple candidates with materially different compositions.

Score:
- readability at small size
- focal clarity
- curiosity
- contrast
- title/thumbnail complementarity
- brand fit
- originality
- repetition against recent thumbnails

The selected thumbnail must have its own provenance and creative lineage.

---

# 9. Cross-platform creative adaptation

For every selected concept, produce independent platform plans.

### TikTok
Optimize for:
- immediate hook
- fast visual change
- trend/context fit
- native-feeling pacing
- concise captions

### Instagram Reels
Optimize for:
- visual polish
- saves/shares
- clean composition
- product demonstration

### YouTube Shorts
Optimize for:
- retention
- clear premise
- discovery/search context
- strong payoff

### Pinterest
Optimize for:
- instructional/search intent
- evergreen value
- visual clarity
- carousel/static derivatives where appropriate

### X
Optimize for:
- concise thought
- conversation
- reply potential
- platform-native text structure

### Threads
Optimize for:
- conversational voice
- discussion
- relatable framing
- reply potential

### YouTube long-form
Use the dedicated landscape narrative pipeline.

Do not reuse identical media when a platform-specific creative treatment materially improves expected performance.

---

# 10. Discovery Team

Build discovery as a persistent opportunity engine.

## Trend Scout

Collect and normalize:
- trending topics
- emerging topics
- accelerating terms
- format trends
- relevant sounds/music signals where platform data permits
- recurring questions
- seasonal opportunities

Track velocity, not merely presence.

## Creator Scout

Discover relevant creators and accounts by:
- niche
- topic
- audience overlap
- content style
- growth
- engagement quality
- recurring formats

## Competitor Scout

Track relevant competitors and identify:
- topics
- formats
- hooks
- posting cadence
- creative patterns
- gaps
- opportunities to differentiate

Do not copy content. Detect patterns and opportunities.

## Community Scout

Find:
- recurring questions
- pain points
- comments
- conversations
- unmet requests
- misconceptions
- language people actually use

## Content Gap Analyst

Compare discovered demand against RecipeFix's:
- product capabilities
- existing content
- audience
- account performance
- available assets

Output ranked opportunities.

---

# 11. Social Intelligence Engine

Build a persistent account intelligence model.

For every connected account, maintain:

- audience profile signals
- content mix
- posting cadence
- best/worst formats
- best/worst hooks
- visual styles
- audio patterns
- voice characteristics
- duration patterns
- posting windows
- engagement patterns
- follower growth
- content fatigue
- creator/community relationships
- platform-specific behavior

The engine must distinguish correlation from confidence and expose uncertainty.

## Opportunity ranking

Rank opportunities using:

```text
relevance
× audience fit
× product fit
× platform fit
× timing
× trend velocity
× expected value
× asset readiness
× learned performance
÷ saturation/fatigue/risk
```

Use deterministic scoring where inputs are measurable; use models for semantic relevance and creative interpretation.

---

# 12. Social Engine actions

The Social Engine should recommend and prepare actions, not autonomously perform unsafe external actions.

Supported recommendations:

- who to follow
- who to engage with
- relevant conversations
- comments worth responding to
- creator/community opportunities
- competitor observations
- content opportunities
- collaboration opportunities

Recommendations must retain evidence and reasoning.

No executable autonomous engagement verb may bypass the approval/safety boundary.

---

# 13. Trend → content workflow

Implement an end-to-end path where a discovered opportunity can become content.

Example:

```text
trend detected
→ validate velocity/relevance
→ identify RecipeFix content gap
→ inspect account history
→ generate concepts
→ choose concept
→ create platform-specific creative plans
→ gather required assets
→ generate
→ critique
→ correct
→ Studio
→ approve
→ schedule
→ publish
→ collect performance
→ learn
```

This must be runnable using deterministic fixtures/mocks for external platform search while preserving the same production interfaces used by real connectors.

---

# 14. Learning system

Expand performance learning to capture creative features, not only generic post metrics.

Capture at minimum:

- concept
- concept family
- objective
- hook family
- hook text characteristics
- treatment
- visual language
- typography system
- font family
- opening
- motion grammar
- transition family
- duration
- pacing characteristics
- voice
- voice direction
- music
- music attributes
- SFX usage
- imagery role
- product-demo presence
- product-demo timing
- platform
- posting window
- CTA
- caption structure

Join these features to:

- impressions
- reach
- views
- watch time
- completion
- retention where available
- likes
- comments
- shares
- saves
- follows
- profile visits
- link clicks

Create learned insights with:
- sample size
- effect
- confidence
- status
- supporting observations
- contradictions
- decay
- affected decisions

Contradictory evidence must reduce confidence rather than being silently ignored.

---

# 15. Self-improving creative loop

Every generated asset must pass through a bounded correction controller.

The controller must:

1. inspect the finished artifact
2. identify defects
3. classify defects by severity
4. identify the smallest useful correction
5. regenerate only what is necessary
6. re-render
7. re-run all affected gates
8. compare against the previous artifact
9. detect regressions
10. repeat within a bounded budget
11. escalate to Studio when quality cannot be established

Creative defects include:

- weak hook
- poor first frame
- static opening
- excessive text
- bad hierarchy
- awkward crop
- poor composition
- insufficient visual change
- repetitive motion
- weak product evidence
- bad pacing
- poor voice delivery
- music conflict
- excessive SFX
- silence
- caption drift
- contrast failure
- licence/provenance violation
- platform mismatch
- repetition/fatigue
- generic/AI-sounding copy

The system must never auto-correct evidence/provenance/licence violations into an apparently valid artifact. Those require escalation or a legitimate asset substitution.

---

# 16. Creative Studio product

The `/studio` experience becomes the operator's creative control center.

## Creation flow

### Step 1 — Intent

Operator can:
- describe what they want
- choose a product/feature
- select an opportunity
- choose platforms
- ask Halyard for ideas

### Step 2 — Ideas

Show 3–5 materially different concept cards.

Each card shows:
- title
- premise
- hook
- format
- visual direction
- expected duration
- platforms
- required assets
- why Halyard recommends it
- relevant learned insight

### Step 3 — Creative direction

Allow controlled pins/overrides for:
- tone
- energy
- visual language
- font direction
- voice
- music direction
- pacing
- length
- product emphasis
- CTA

The system must preserve intelligent defaults.

### Step 4 — Generate

Show stage progress:

```text
concept
→ brief
→ assets
→ script
→ voice
→ music
→ edit
→ variants
→ quality
→ ready
```

### Step 5 — Review

Provide side-by-side platform previews.

Allow:
- approve
- reject with reason
- regenerate
- regenerate hook
- change concept
- make faster
- make more playful
- increase product demonstration
- change voice
- change music
- change visual direction

Targeted edits must preserve unaffected decisions where possible.

### Step 6 — Schedule

Show recommended staggered times and explain the reasoning.

Allow human override.

---

# 17. Studio intelligence

Studio should surface why Halyard made each decision.

Examples:

> "Recommended because feature demonstrations outperform listicles on this account and this feature has not been used in the last 18 days."

> "This music bed was selected because its 118 BPM matches the cut rhythm and it has not been used by this account in the last 30 posts."

> "This hook was selected because question-led openings have the highest validated completion lift for this account."

> "Pinterest received an attributed image treatment because the source licence permits attribution-linked use but not re-hosting."

Every explanation must be backed by stored evidence or explicitly labelled as model judgement.

---

# 18. Content relationships

Extend the data model so these are first-class entities:

```text
signal
  ↓
opportunity
  ↓
idea
  ↓
strategy_decision
  ↓
concept
  ↓
creative_brief
  ↓
platform_variant
  ↓
asset_plan
  ↓
render
  ↓
content_iteration
  ↓
publication
  ↓
post_metrics
  ↓
performance_score
  ↓
learned_insight
```

Maintain explicit relationships between:

- concept and source opportunity
- brief and concept
- brief and account
- variant and platform
- variant and render
- render and assets
- asset and provenance/licence
- creative features and performance
- learned insight and decisions it influenced

Do not hide core creative structure exclusively inside render JSON.

---

# 19. Production execution

All new capabilities must execute through the existing persistent jobs system.

Required reachable job kinds include, as applicable:

- discovery collection
- trend validation
- creator/community discovery
- account intelligence
- performance learning
- concept generation
- strategy
- creative direction
- asset preparation
- capture
- TTS
- music/SFX selection
- render
- media review
- correction
- platform variant generation
- thumbnail generation
- scheduling

Maintain bidirectional reachability checks:

1. every registered job has a handler
2. every production handler/job kind is registered and reachable

Dead job kinds must be removed or intentionally documented rather than silently retained.

---

# 20. Production media persistence

Captured product footage must survive deploys and worker restarts.

Do not rely on ephemeral worker/container public directories for production media.

All production assets must have durable storage and stable URLs compatible with platform publishing requirements.

Every asset should be retrievable from its lineage record and independently verified before rendering.

---

# 21. Platform publishing readiness

Maintain existing safety requirements:

- `publishing_enabled=false` during implementation
- human approval required
- per-item approval boundary
- idempotent publication
- platform capability checks
- credential scope checks
- licence checks
- provenance checks
- media readiness checks
- no accidental public test publication

Rehearsal mode must build and inspect the exact outbound request without sending it.

---

# 22. Provider and external-data architecture

Discovery connectors must use provider interfaces so tests can use realistic fixtures without weakening production behavior.

Each provider fixture should represent realistic:

- trending data
- creator results
- competitor posts
- community conversations
- platform metrics
- account history
- API pagination
- rate limits
- stale data
- missing fields
- duplicate results
- conflicting signals

Production and fixture paths must share normalization and ranking logic.

---

# 23. Creative acceptance system

Build a repeatable artifact acceptance suite around actual rendered media.

Maintain recorded baselines per:

- treatment
- visual language
- platform
- portrait/landscape
- duration bucket
- audio configuration

Measure at minimum:

- opening hook presence
- opening motion
- tonal change
- text density
- frame usage
- product evidence
- visual state changes
- pacing
- audio loudness
- true peak
- silence
- caption drift
- contrast
- aspect ratio
- originality/repetition
- licence/provenance

Quality regressions must fail the build or mark the artifact for correction.

---

# 24. End-to-end scenarios that must work

Implement realistic fixture-backed scenarios for all major workflows.

## Scenario A — Trend to Short

A trend accelerates → discovery validates it → RecipeFix opportunity is identified → concepts are generated → one is selected → TikTok/Reels/Shorts variants are produced → self-correction runs → Studio receives finished candidates.

## Scenario B — Product feature launch

A verified RecipeFix capability becomes a content opportunity → product capture is selected → footage is incorporated as evidence → voice/music/SFX are selected → professional short-form video is produced.

## Scenario C — YouTube long-form

Topic → research → concepts → narrative → storyboard → product demonstration → landscape render → thumbnail candidates → metadata → Shorts extraction → platform derivatives.

## Scenario D — Cross-platform adaptation

One concept produces visibly and semantically distinct TikTok, Reels, Shorts, Pinterest, X and Threads outputs while preserving one underlying strategic objective.

## Scenario E — Self-correction

A deliberately weak artifact fails creative gates → correction chooses the appropriate intervention → new artifact renders → affected gates rerun → regression detection prevents a worse result.

## Scenario F — Learning

Historical performance is ingested → creative features are attributed → an insight reaches validated confidence → later concept/creative selection changes because of it.

## Scenario G — Discovery/social engine

Mock trend + creator + competitor + community data → opportunity ranking → recommended content opportunity + relevant social actions with evidence and no unauthorized execution.

## Scenario H — Studio manual creation

Operator chooses platforms → asks for ideas → selects concept → pins creative direction → generates → reviews side-by-side variants → requests targeted change → approves → receives staggered schedule recommendation.

---

# 25. Implementation rules

1. **Do not stop at interfaces or schemas.** Every new capability must have a production caller.
2. **Do not create dead modules.** Every service/agent must have a traced caller.
3. **Do not create LLM agents for arithmetic that deterministic code handles better.**
4. **Do create model-driven roles where judgement, ideation, semantic interpretation, or creative perception is genuinely required.**
5. **Do not let generated media represent product evidence.**
6. **Do not silently use unlicensed production audio.**
7. **Do not silently reuse identical creative across platforms when adaptation is required.**
8. **Do not treat technical QC as creative quality.**
9. **Do not accept the first technically valid render when the creative critic identifies a meaningful quality problem.**
10. **Do not allow infinite self-correction.** Use bounded iterations and escalation.
11. **Do not hide creative structure inside opaque JSON when it needs lineage or learning.**
12. **Do not make publishing autonomous merely to prove a workflow.**
13. **Do not spend production credits repeatedly when one representative run establishes the integration.**
14. **Prefer real production execution over claims based solely on unit tests.**
15. **When an external dependency cannot be legitimately automated, implement the complete code path and clearly surface the exact operator action required.**
16. **Do not weaken production behavior to make mocks pass.**
17. **Every learning feature must have provenance back to the creative decision that generated it.**
18. **Every generated asset must be attributable to a concept and brief.**
19. **Every platform variant must be independently inspectable.**
20. **The final user experience is the quality of the generated content, not the sophistication of the backend.**

---

# 26. Definition of complete

Halyard is complete for this creative system when all of the following are true:

- Discovery can find and validate relevant opportunities.
- Social intelligence understands connected accounts.
- The system can identify what to make and why.
- Concept generation produces genuinely different options.
- Creative direction is selected intelligently.
- Short-form videos look and sound professionally produced.
- Product demonstrations use real evidence.
- Music and SFX are legitimately sourced and intelligently selected.
- Creative variety is deliberate and account-aware.
- Long-form YouTube can be produced as a real long-form narrative.
- Thumbnails are generated and scored.
- Every platform receives an appropriate creative variant.
- Studio provides concept selection, creative controls, generation, review, revision, approval, and scheduling.
- The system can generate from a discovered trend without manual engineering intervention.
- Creative QC inspects actual artifacts.
- Weak creative causes revision rather than automatic approval.
- Revisions are bounded and regression-aware.
- Performance is attributed to actual creative features.
- Learning changes later creative decisions.
- Discovery uses learned performance.
- Social recommendations use evidence and respect the approval boundary.
- Production workers execute every required job kind.
- Assets persist durably.
- Provider failures, missing assets, stale signals, rate limits, and partial jobs recover safely.
- No production path depends on fixtures.
- No required module is unreachable.
- No required table is write-only or read-only without an intentional reason.
- No important creative decision exists without lineage.
- No publishing occurs without the existing human approval boundary.

---

# 27. Final implementation sequence

Build in this order, but continue through the sequence rather than stopping after each architectural layer:

### Stage 1 — Complete creative production

Finish professional short-form rendering, dynamic motion, composition, imagery, typography, voice, music, SFX, pacing, and creative variation.

### Stage 2 — Complete long-form

Finish landscape narrative production, chapters, thumbnails, metadata, and derivative Shorts.

### Stage 3 — Complete cross-platform variants

Make platform variants materially different in media, pacing, composition, audio, and copy where appropriate.

### Stage 4 — Complete Discovery Team

Implement trend, creator, competitor, community, and content-gap discovery with provider-backed normalization.

### Stage 5 — Complete Social Intelligence

Build account intelligence, opportunity ranking, social recommendations, and evidence-backed reasoning.

### Stage 6 — Complete learning

Capture creative features, performance attribution, confidence, contradictions, and downstream decision influence.

### Stage 7 — Complete self-improvement

Connect creative criticism, correction, learning, and subsequent creative selection into one closed loop.

### Stage 8 — Complete Studio

Build the full concept → direction → generate → preview → revise → approve → schedule experience.

### Stage 9 — Production hardening

Ensure every path is reachable, persistent, recoverable, observable, idempotent, provenance-safe, licence-safe, and platform-safe.

### Stage 10 — Final verification

Run the complete fixture-backed scenarios, real production generation paths that are safe to execute, artifact-level media inspection, worker execution, database checks, and build/type/lint suites. Record exact results, remaining operator actions, external-provider dependencies, and any intentionally disabled capabilities.

The final report must distinguish **implemented and exercised**, **implemented but externally blocked**, and **not implemented**. The target is zero items in the last category.
