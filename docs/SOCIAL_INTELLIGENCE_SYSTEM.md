# Halyard Social Intelligence & Closed-Loop Creative System

**Status:** Target production architecture / implementation specification  
**Purpose:** Extend Halyard from a content generator into an account-aware, platform-native social media organization that discovers opportunities, creates professional creative, critiques and corrects its own work, publishes only after operator approval, measures outcomes, and converts those outcomes into better future decisions.

> This document is the target system specification. Existing capabilities must be reused where they already satisfy a requirement; implementation must not duplicate working pipelines merely to satisfy this document.

---

## 1. Product goal

Halyard should behave like a high-performing social media team rather than a prompt wrapper.

For every connected brand/account, Halyard should be able to answer:

- What should we make?
- Why now?
- For which platform and account?
- Which audience or community is it for?
- Should we create something new, reuse an existing asset, or adapt it?
- What should the platform-native version look and sound like?
- Is the creative actually good enough to publish?
- If not, what specifically is wrong and how should it be corrected?
- When should it be published relative to the rest of the account's schedule?
- What happened after publication?
- What did we learn, and how should that change the next decision?

The system must optimize for **useful, human, platform-native content**, not maximum posting volume.

---

## 2. Non-negotiable principles

### 2.1 Human quality over AI-looking output

Copy must sound like a thoughtful human brand voice: natural, specific, welcoming, conversational, confident without being corporate, and varied across posts. Avoid repetitive hooks, formulaic openings, robotic CTAs, keyword stuffing, fake enthusiasm, and obvious template reuse.

### 2.2 Platform-native adaptation

One idea can become multiple platform-specific executions, but Halyard must not blindly cross-post the same artifact. Each variant should account for the platform's audience, conventions, dimensions, duration, text density, CTA style, discovery mechanics, and current account behavior.

### 2.3 Professional creative is a first-class requirement

Short-form video is not a text card with motion. A production-quality video should use the strongest available combination of:

- real product footage and/or relevant visual media;
- deliberate shot sequencing;
- a strong first-second hook;
- rapid but intelligible pacing;
- meaningful visual progression;
- readable on-screen typography;
- voiceover when it improves comprehension or personality;
- appropriate music/audio when permitted and useful;
- captions and timing;
- transitions and motion used intentionally;
- product proof where relevant;
- clear brand identity;
- a satisfying payoff;
- a platform-appropriate CTA.

For RecipeFix-style content, the creative should visibly demonstrate the transformation when the concept calls for it: original recipe/problem → adaptation or insight → real product interaction → resulting recipe/food outcome. It should not merely describe the product in static text.

### 2.4 Evidence-grounded

Product claims, features, and demonstrations must continue to use Halyard's existing evidence/provenance architecture. Creative quality cannot become an excuse to invent product behavior.

### 2.5 Bounded autonomy

Agents may research, plan, generate, critique, revise, schedule recommendations, and learn. Publication remains behind the existing operator approval boundary. No autonomous public replies or engagement actions should be introduced without an explicit product decision and safety model.

### 2.6 Learning must be causal enough to be useful

Do not conclude that a hook, duration, sound, topic, or posting time "worked" from a single observation. Store experiment metadata, compare cohorts, account for platform differences, and express confidence/uncertainty. Learning should change future recommendations only when evidence is sufficient.

---

## 3. The agent organization

The system is organized as cooperating specialists with a shared memory and explicit handoffs.

### 3.1 Discovery Team

Find opportunities rather than waiting for a content brief.

Responsibilities:

- detect relevant trends and emerging topics;
- identify seasonal and calendar opportunities;
- discover platform-native formats and recurring patterns;
- analyze relevant creators, competitors, peers, and adjacent accounts;
- identify conversations and communities relevant to the brand;
- identify high-value search/discovery questions;
- surface potential collaborations or accounts worth following;
- identify content gaps;
- detect when an existing product feature or artifact creates a timely story;
- score opportunities by relevance, freshness, expected value, effort, and evidence quality.

Every discovery result should preserve its source, timestamp, platform, confidence, and expiration/freshness characteristics.

### 3.2 Account Intelligence / Social Engine

Maintain a living model of each connected account and its surrounding social graph.

Responsibilities:

- understand the account's current content mix;
- track recent posts and performance;
- identify recurring successful/weak patterns;
- understand audience and community signals available through platform APIs;
- identify relevant people, creators, brands, communities, publications, and accounts;
- recommend who to follow and why;
- recommend legitimate engagement opportunities and timing;
- identify content adjacency and collaboration opportunities;
- prevent spammy or repetitive behavior;
- maintain platform-specific account identity and voice.

The Social Engine is primarily an intelligence/recommendation layer. It must not introduce autonomous public replies or follows merely because an account is discoverable.

### 3.3 Social Strategy Team

Convert discovery and account intelligence into a prioritized content strategy.

Responsibilities:

- select content opportunities;
- define objectives and target audience;
- choose platform/account;
- choose format;
- determine whether to create, reuse, remix, or adapt;
- choose sequencing and campaign relationships;
- select timing windows;
- stagger related posts across platforms;
- avoid audience fatigue and excessive repetition;
- maintain a balanced content portfolio;
- assign an expected outcome and measurement plan.

Strategy should optimize the portfolio, not every post independently.

### 3.4 Creative Director / Concept Team

Turn a strategy brief into a distinctive creative concept.

Responsibilities:

- generate multiple concepts before selecting one when novelty is important;
- create hooks and alternative hooks;
- define narrative arc;
- define visual treatment;
- define product demonstration/proof beat;
- define voice and emotional tone;
- define music/audio direction;
- define voiceover direction;
- define pacing and edit rhythm;
- define CTA;
- identify reusable source assets;
- ensure concepts do not collapse into the same template repeatedly.

### 3.5 Copy Team

Create platform-native written content.

Outputs may include:

- post copy;
- captions;
- titles;
- descriptions;
- hooks;
- CTAs;
- comments for operator review where appropriate;
- YouTube metadata;
- hashtags/keywords only where they provide real value.

Copy must preserve brand voice while varying structure and phrasing. The system should score repetition against recent content before approval.

### 3.6 Video / Creative Production Team

Translate concepts into real media through the existing render/capture/media pipeline.

The team should be able to select among multiple production treatments rather than forcing every video into one composition.

Treatment families should include, where source material supports them:

- product transformation/demo;
- fast recipe/process montage;
- problem → solution;
- before/after;
- tutorial/how-to;
- list/countdown;
- myth/fact;
- reaction/commentary;
- story/narrative;
- comparison;
- seasonal/trend response;
- voiceover-led explainer;
- visual-first ASMR/satisfying process;
- UGC-inspired presentation when appropriate and clearly represented as such.

Music and voiceover selection must be treated as creative decisions, not afterthoughts. The system must honor platform rights/availability and never fabricate that an audio asset is licensed or available.

### 3.7 Creative QA / Critics

Critics evaluate the actual generated artifact, not just the prompt.

At minimum evaluate:

- hook strength;
- visual quality;
- pacing/retention potential;
- narrative coherence;
- product proof;
- visual hierarchy;
- text density and legibility;
- audio/music quality;
- voiceover quality and pacing;
- brand consistency;
- platform-native fit;
- originality/repetition;
- factual/product-claim correctness;
- CTA quality;
- technical validity;
- overall publish readiness.

A critic must return structured defects with severity, evidence, and a recommended correction target.

### 3.8 Correction / Revision Team

Use the existing bounded self-correction architecture. A defect should map to the smallest appropriate change, invalidate only affected gates, rebuild what is necessary, and re-run evaluation.

Examples:

- weak hook → rewrite/re-cut opening;
- slow opening → remove setup and move payoff earlier;
- excessive text → shorten overlays and shift information into narration/visuals;
- weak product proof → insert a real product capture;
- robotic copy → rewrite using brand voice and variation constraints;
- poor voiceover pacing → regenerate narration/audio only where possible;
- repetitive concept → return to concept selection and choose a materially different treatment;
- platform mismatch → regenerate the platform variant, not the underlying idea.

Bound corrections by attempts, time, and spend. A failed correction must escalate rather than silently publish.

### 3.9 Performance / Analytics Team

After publication, collect available metrics and normalize them into a platform-aware model.

Track, where available:

- impressions/reach;
- views;
- watch time;
- average view duration;
- retention/completion;
- likes;
- comments;
- shares;
- saves;
- follows/subscribers;
- clicks;
- conversions where instrumented;
- posting time;
- content format;
- duration;
- creative treatment;
- hook family;
- topic;
- CTA;
- audio/music characteristics;
- account/platform.

Metrics must remain tied to the exact content version that generated them.

### 3.10 Learning / Optimization Team

Convert performance observations into bounded, explainable knowledge.

It should learn at three levels:

1. **Global:** broad patterns across Halyard's portfolio.
2. **Platform:** patterns specific to TikTok, Instagram, YouTube, X, Threads, Pinterest, etc.
3. **Account:** patterns specific to an individual connected account.

Account-specific evidence should generally dominate generic assumptions when sample size is adequate.

Store both successful and failed patterns. Negative learning is first-class.

---

## 4. Closed-loop lifecycle

```text
PRODUCT / ACCOUNT EVIDENCE
        ↓
DISCOVERY
        ↓
ACCOUNT + SOCIAL INTELLIGENCE
        ↓
STRATEGY
        ↓
CONCEPT GENERATION
        ↓
PLATFORM-SPECIFIC CREATIVE BRIEF
        ↓
COPY + VIDEO + MEDIA PRODUCTION
        ↓
AUTOMATED QC / CREATIVE CRITIQUE
        ↓
   FAIL? ── yes ──→ DIAGNOSE → CORRECT → REBUILD
        │                               │
        └────────────── re-evaluate ←───┘
        ↓
PUBLISH-READY
        ↓
OPERATOR APPROVAL
        ↓
SCHEDULE / PUBLISH
        ↓
COLLECT PERFORMANCE
        ↓
ATTRIBUTE RESULTS TO CREATIVE DECISIONS
        ↓
LEARN / UPDATE MEMORY
        ↓
UPDATE STRATEGY + DISCOVERY PRIORS + CREATIVE RULES
        ↓
NEXT CONTENT CYCLE
```

No stage should bypass evidence, QC, or the approval boundary.

---

## 5. Creative memory

The existing creative iteration history should be extended into durable creative memory.

Each learned item should include:

- observation;
- evidence window;
- platform;
- account;
- sample size;
- content cohort;
- features considered;
- result metrics;
- confidence;
- supporting content IDs;
- contradicting evidence;
- recommendation;
- created/updated timestamp;
- expiration/review condition.

Examples:

- "Transformation-first openings outperform description-first openings for this account."
- "18–25 second videos currently have stronger completion than 35–45 second videos for this account."
- "Static recipe-card intros repeatedly underperform and should not be used as the default opening."
- "Instagram responds better to polished instructional framing than the TikTok treatment currently used."

These are hypotheses until sufficient evidence exists. The system must distinguish **observed**, **inferred**, and **validated** knowledge.

---

## 6. Content portfolio intelligence

Halyard should maintain a content portfolio rather than generating isolated posts.

Track the recent distribution of:

- topics;
- formats;
- creative treatments;
- hooks;
- CTAs;
- products/features demonstrated;
- educational vs entertaining vs promotional content;
- short vs long video;
- original vs adapted concepts;
- platform variants.

Detect overuse and undercoverage. A high-performing format should not automatically become every post.

Introduce controlled exploration so Halyard periodically tests new concepts instead of converging prematurely on one template.

A practical planning objective is:

**exploit proven patterns + explore promising new patterns + maintain brand/content diversity.**

---

## 7. Cross-platform intelligence

Cross-platform reuse is encouraged when it creates leverage, but reuse must be intentional.

For each source idea, Halyard should decide independently:

- reuse exact media;
- re-edit media;
- re-record/re-render;
- change hook;
- change narration;
- change caption;
- change duration;
- change CTA;
- change framing;
- defer the platform;
- do not publish on a platform.

The system should be able to stagger related content rather than publishing the same creative everywhere simultaneously.

Example:

- TikTok: fast transformation + energetic voiceover.
- Instagram Reels: polished transformation + stronger visual branding.
- YouTube Shorts: searchable title + concise demonstration.
- X: conversational insight + media excerpt.
- Threads: human discussion prompt or story rather than a copied caption.
- Pinterest: durable, searchable recipe/tutorial framing.

These are strategy hypotheses, not hardcoded universal rules; actual account performance should update them.

---

## 8. Social Engine: discovery and interaction intelligence

The Social Engine should map the relevant social environment around each account.

It should discover:

- creators to study;
- creators/accounts worth following;
- brands with relevant audiences;
- communities;
- publications;
- emerging conversations;
- recurring questions;
- collaboration candidates;
- complementary products;
- content gaps.

It should produce ranked recommendations with reasons and evidence.

It should also monitor the account's social graph and recommend actions such as:

- follow;
- investigate;
- collaborate;
- reference;
- create a response-style post;
- save for trend research;
- ignore.

Public engagement automation is **not** implied by this intelligence layer. Any future automated interaction must have explicit permissions, rate limits, spam controls, approval semantics, and platform-specific policy checks.

---

## 9. Discovery freshness and trend handling

Trend information decays quickly. Every discovery item needs:

- observed_at;
- source;
- platform;
- freshness/expiry;
- relevance;
- confidence;
- evidence;
- trend velocity when measurable.

Do not reuse stale trends merely because they exist in memory.

Trend-following must also preserve brand fit. A trend with high velocity but low relevance should not outrank a smaller but highly relevant opportunity automatically.

---

## 10. Quality scoring

Every creative candidate should receive both:

- **hard gates** — must pass;
- **quality scores** — optimize and compare.

Hard failures include, as applicable:

- unsupported product claim;
- missing required proof;
- invalid media;
- platform format violation;
- unreadable critical text;
- unsafe/incorrect output;
- missing required metadata;
- prohibited or unavailable asset;
- failed technical validation.

Quality dimensions should include:

- hook;
- clarity;
- entertainment/usefulness;
- pacing;
- visual polish;
- audio;
- authenticity;
- product demonstration;
- platform fit;
- novelty;
- brand fit.

The score should never override a hard failure.

---

## 11. Agent contracts and observability

Every agent invocation should be traceable.

Record:

- run ID;
- agent role;
- input references;
- output references;
- model/provider;
- prompt/version;
- cost/tokens where available;
- latency;
- decision;
- defects;
- correction relationship;
- resulting content/version IDs.

Agent outputs should be structured wherever possible so later agents can consume them deterministically.

The system should make it possible to answer:

> "Why did Halyard make this post, why did it choose this platform, why did it reject the first video, what changed in revision two, and what did the audience teach us afterward?"

---

## 12. Data model requirements

Use the existing schema where possible. Extend it only where the current model cannot represent the required evidence.

Required conceptual entities:

- discovery opportunities;
- social/account intelligence snapshots;
- strategy decisions;
- content concepts;
- creative briefs;
- content variants;
- creative evaluations;
- correction iterations;
- publication attribution;
- performance metric snapshots;
- experiments/cohorts;
- learned insights;
- creative memory;
- social recommendations.

All relationships must preserve lineage from **source evidence → decision → creative → publication → result → learning**.

Append-only histories remain append-only where the existing architecture already guarantees that property.

---

## 13. Evaluation and self-correction acceptance tests

The implementation is not complete when agents exist. It is complete when these behaviors are demonstrated with real artifacts.

### Creative quality

- Generate a short-form video from a real product adaptation.
- Inspect the actual rendered frames.
- Verify the first seconds contain a meaningful hook/payoff.
- Verify the product interaction is visible where required.
- Verify audio/music/voiceover are intentional and coherent.
- Verify the result is materially more professional than a static text-card treatment.

### Self-correction

- Seed a known creative defect.
- Critic detects the correct defect.
- Correction chooses the smallest valid repair.
- Only affected stages rerun.
- Re-render occurs.
- Critic evaluates the new artifact.
- Defect is cleared.
- History records both versions and the reason for change.
- If the defect persists after the bound, the system escalates rather than approving.

### Learning

- Publish/measure a controlled set of content.
- Attribute metrics to exact creative versions.
- Identify a statistically/reasonably supported pattern.
- Store the insight with evidence and confidence.
- Generate a later content plan.
- Verify the plan actually uses the learned insight.
- Introduce a counterexample or conflicting result and verify confidence changes rather than blindly preserving the old rule.

### Cross-platform

- Start from one content opportunity.
- Generate platform-specific variants for at least TikTok, Instagram Reels, and YouTube Shorts.
- Verify that variants share the underlying truth but differ in execution where appropriate.
- Verify platform constraints are validated independently.

### Social Engine

- Discover relevant accounts/topics.
- Produce ranked recommendations with reasons and evidence.
- Avoid recommending irrelevant/high-volume accounts merely because they are popular.
- Verify recommendations are account-specific.

---

## 14. Production safety

The existing safety model remains mandatory:

- `publishing_enabled` remains a global kill switch.
- Operator approval remains the publication boundary.
- Tests must default to non-public/draft/private/sandbox behavior where supported.
- Public test posts must never be used merely to prove that an adapter works when a rehearsal path is possible.
- Platform credentials and secrets must never enter logs, prompts, generated artifacts, or agent memory.
- Agents must not infer permission to publish, reply, follow, or message from the existence of an account connection.
- Rate limits, duplicate protection, idempotency, routing/account identity checks, and platform capability checks remain authoritative.

---

## 15. Implementation strategy

Implement incrementally while preserving the existing production pipeline.

### Phase 1 — Intelligence foundations

- inventory current agent/generation/QC/creative-memory capabilities;
- create explicit agent contracts;
- create lineage IDs across strategy → creative → publication → metrics;
- add discovery opportunity storage and freshness;
- add account intelligence snapshots;
- add strategy decision records;
- expose structured telemetry.

### Phase 2 — Creative director and production orchestration

- add concept generation and diversity controls;
- add platform-specific creative briefs;
- connect briefs to the existing render/capture pipeline;
- expand production treatments;
- make music and voiceover first-class creative inputs;
- ensure real product demonstrations are preferred over decorative placeholders;
- add artifact-level creative critics.

### Phase 3 — Closed-loop correction

- connect critics to the existing correction engine;
- map defects to bounded correction policies;
- preserve version lineage;
- re-evaluate actual rendered artifacts;
- add regression tests for solved creative failures;
- enforce publish-readiness only after the full gate chain passes.

### Phase 4 — Performance learning

- normalize platform metrics;
- build content cohorts and experiments;
- compute account/platform/global insights;
- maintain confidence and contradiction handling;
- feed validated insights into strategy and creative planning;
- show why a recommendation changed.

### Phase 5 — Social Engine

- build social graph/account intelligence;
- discovery of relevant creators, communities, and opportunities;
- ranked follow/research/collaboration recommendations;
- trend and conversation monitoring;
- strict non-spam and non-autonomous-engagement boundaries.

### Phase 6 — End-to-end proving

Run real, bounded production scenarios for connected accounts and verify:

1. discovery creates an opportunity;
2. strategy selects it;
3. concept team produces alternatives;
4. creative production renders a professional artifact;
5. critics identify intentionally seeded defects;
6. correction fixes them;
7. operator approves;
8. platform adapter publishes safely when explicitly authorized;
9. metrics are collected;
10. learning is recorded;
11. the next plan uses the learning;
12. a conflicting result updates/reduces the prior belief.

Only after these scenarios pass should the feature set be described as a production-ready closed learning loop.

---

## 16. Definition of done

Halyard's social intelligence system is production-ready when:

- every connected account has an account-aware strategy model;
- discovery continuously supplies relevant opportunities with evidence and freshness;
- content decisions are explainable;
- content can be created as genuinely different concepts, not one repeated template;
- written posts sound human and brand-appropriate;
- short-form videos look and sound professionally produced;
- music, voiceover, pacing, captions, visuals, and product proof are deliberate;
- each platform receives an appropriate variant;
- automated critics evaluate the actual artifact;
- failed creative is automatically diagnosed and corrected within bounds;
- solved defects are not repeatedly reintroduced without a deliberate experiment;
- publication remains operator-controlled;
- performance is tied to exact creative versions;
- the system learns from both successes and failures;
- insights have evidence, confidence, scope, and freshness;
- future strategy demonstrably changes from validated learning;
- discovery and the Social Engine understand the surrounding ecosystem;
- the system can recommend who/what to follow, study, collaborate with, or respond to without turning intelligence into uncontrolled automation;
- end-to-end tests prove the complete loop using real rendered artifacts and platform-safe test modes.

The final standard is not **"the agents ran."**

The final standard is **"Halyard made a better decision because it learned something, and we can prove why."**
