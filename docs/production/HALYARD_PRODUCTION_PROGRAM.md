# Halyard Production Completion Program

**Purpose:** finish Halyard as a production-grade, multi-product social creative operating system that an operator can use end to end without developer rescue.

**Reviewed baseline:** `bb2fb61306a747c28f021d82d79b70c0d71742ba`. Re-resolve `main` before every work package.

## Definition of done

A finished Halyard lets an operator:

1. create/sign in to an account;
2. add a product/app;
3. let Halyard collect evidence about the product;
4. review and edit what Halyard believes about the product, audience, brand, goals, workflows, claims, destinations, and visual identity;
5. connect social accounts;
6. ask for ideas or request a specific piece of content;
7. see several materially different concepts with reasons and required evidence;
8. select/pin creative direction or let Halyard decide;
9. watch the real creative team work with live stage/artifact handoffs;
10. receive actual finished platform-specific posts/media;
11. play/watch/listen/swipe through the exact output;
12. request targeted changes without losing unaffected work;
13. approve the exact revision that may be scheduled/published;
14. schedule using account-aware, platform-aware timing and explicit heuristics/learned evidence;
15. publish through the declared permitted delivery route;
16. reconcile the remote outcome;
17. collect platform and product-acquisition outcomes;
18. learn from results without fabricating certainty;
19. improve later strategy, creative, scheduling, and engagement recommendations.

The same shared engine must work for **RecipeFix, Kinolog, and a third real app available in the operator's `PROJECT_2025` workspace**. Product-specific adapters are allowed only at explicit product integration boundaries. The shared creative, strategy, review, scheduling, learning, and Studio layers must not contain RecipeFix-only or food-only assumptions.

---

# H0 — Release truth, repository health, and production observability

## Goal

Establish one trustworthy release state before building on top of the current system.

## Backend / data

- Repair stale generated database types and make type generation reproducible.
- Ensure all migrations apply cleanly to a fresh real Postgres instance.
- Make all production worker heartbeats expose commit SHA, schema/migration version, registered job kinds, environment name, and build time.
- Make web deployment expose the corresponding commit/build identity.
- Add explicit production-version compatibility checks between web, worker, and schema.
- Preserve the jobs table as the durable orchestration backbone.
- Ensure paid-provider clients cannot be called accidentally from ordinary test paths.
- Ensure production credentials cannot be used from isolated test suites.
- Keep `publishing_enabled=false` throughout implementation unless a separately authorized controlled publish step is being performed.

## Frontend

- Add an operator-visible System/Release status surface that shows web SHA, worker SHA, worker last-seen, schema version, queue health, and provider readiness.
- Never show a green capability when the production worker handling it is stale or missing the job kind.

## Verification

- Fresh checkout → install → generate types → migrate isolated Postgres → typecheck → lint → unit/integration → production build → E2E.
- Required suites must fail when prerequisites are absent rather than silently reporting misleading green.
- Tamper verification for stale types, missing job kind, stale worker SHA, and incompatible schema.

## Exit gate

The exact revision under implementation has a reproducible green release path and the UI can identify what code is actually running.

---

# H1 — Correctness, isolation, evidence, and safety

## Goal

Prevent Halyard from confidently creating or sending the wrong thing.

## Backend / data

### Exact-subject handling

When the requested subject/artifact cannot be satisfied:

- do not silently substitute an unrelated catalogue item;
- mark the requested subject, available alternatives, and reason;
- require an explicit choice: provide/source the requested input, use a relevant alternative, or change the brief;
- prevent downstream creative generation from treating an unrelated fallback as the requested subject.

### Claim/source correspondence

- Keep cheap URL/source screening.
- Strengthen claim verification beyond shared numbers/proper nouns/word overlap.
- Represent negation, qualifiers, quantities, comparisons, and causal claims.
- Require the cited passage/fact to support the actual sentence the writer will use.
- Persist the supporting claim/source relationship so later corrections can re-check it.

### Product/account isolation

- Scope product, accounts, platform choices, learned insights, creative history, assets, destinations, and recommendations by explicit product/account identity.
- Prevent platform/global learning rows from overwriting another product's evidence.
- Prevent account pickers from showing unrelated products' accounts as valid targets.
- Prevent asset reuse across products unless explicitly marked reusable and safe.

### Review truth

- A malformed or unavailable model critic result must never be interpreted as a positive creative verdict.
- Represent reviewer states explicitly: passed, failed, unavailable, malformed, skipped, not measured.
- Critical review requirements must fail closed or escalate to the operator.

### Approval integrity

- Approval binds to a content revision hash/ID and target account/destination.
- Any material edit invalidates affected approval.
- Reapproval is required before publish.

## Frontend

- Show requested-subject mismatches before spend.
- Show evidence and source for factual claims on review/detail surfaces.
- Show product/account scope everywhere a target can be selected.
- Show reviewer unavailable/malformed as a warning/blocker, never as a clean pass.

## Verification

Exercise wrong-subject, wrong-product, wrong-account, contradictory-source, malformed-reviewer, changed-after-approval, and cross-product-leakage scenarios across RecipeFix, Kinolog, and the third app fixture.

## Exit gate

Halyard cannot quietly produce, learn from, approve, or publish the wrong product, wrong subject, unsupported claim, or stale revision.

---

# H2 — Generic product onboarding and Product Brain

## Goal

Make "connect any app" a real product capability rather than a RecipeFix abstraction.

## ProductPack contract

Create/version a generic `ProductPack` containing:

- product name and category;
- purpose/value proposition;
- core user jobs;
- target audiences/personas;
- goals/business outcomes;
- key workflows;
- features/capabilities;
- differentiators;
- limitations/non-claims;
- pricing/monetization when supplied;
- conversion funnel and activation event;
- destinations/deep links;
- claims and evidence;
- brand voice;
- visual identity;
- typography/color/logo assets;
- imagery/footage permissions;
- supported capture/demo workflows;
- competitors/reference set;
- current campaigns/priorities;
- operator overrides and review state;
- provenance/confidence for every machine-derived field.

## Product connectors

Support explicit source adapters for:

- website and public documentation;
- uploaded docs/assets;
- generic MCP surface discovery;
- REST/OpenAPI where configured;
- GitHub/release activity;
- store listing;
- operator-supplied product brief;
- browser capture workflow where authorized;
- uploaded native-app screen recordings for native-only products.

Generic MCP evidence discovery must remain generic. Product-output adapters are product-specific and must be registered explicitly.

## Product Brain pipeline

Evidence → extracted facts → reconciled ProductPack → operator review → approved product understanding.

No model conversation is the source of truth; persisted evidence is.

## Frontend: onboarding flow

### Public/entry

- production landing page;
- sign up/sign in/password recovery/session expiry;
- clear product positioning and privacy expectations;
- responsive mobile/laptop layout.

### Add product wizard

1. Product identity and URL.
2. Evidence-source connection/upload.
3. Halyard scans/collects.
4. Live progress with source-by-source status.
5. Product Brain review.
6. Brand/visual review.
7. Audience/goals review.
8. Conversion/activation destination review.
9. Social account connection.
10. Ready state with first suggested actions.

### Product Brain UI

Use organized editable categories rather than a raw JSON/info wall:

- Overview
- Purpose & goals
- Audience
- Jobs / use cases
- Features
- Workflows
- Differentiators
- Claims & evidence
- Brand voice
- Visual identity
- Assets
- Destinations & conversion
- Competitors/reference set
- Product activity
- Integrations

For each item show value, evidence/provenance, confidence, last updated, machine/operator source, and Edit/Confirm controls.

### Visual identity

Display actual:

- logo/icon assets;
- extracted colors with contrast-safe usage roles;
- font families and fallback status;
- type scale/style examples;
- image/illustration treatment;
- voice/personality descriptors;
- do/don't examples.

Allow operator edits and lock/pin approved decisions.

## Cross-app validation

Every generic Product Brain change runs against RecipeFix, Kinolog, the selected third real app, and an unfamiliar synthetic app fixture.

## Exit gate

A non-food product can be connected and understood without adding shared-code branches keyed to its name, and the operator can review/edit the full understanding from the UI.

---

# H3 — Platform capability and account layer

## Goal

Make every connected social account an explicit capability contract.

## Backend

For Instagram, TikTok, YouTube, X, Threads, Pinterest, Facebook Pages, Bluesky, and any supported unified transport:

- authentication state;
- granted scopes;
- review/audit state;
- media/post surfaces;
- public/direct/draft/manual delivery modes;
- comments/replies/mentions capabilities;
- analytics/metrics capabilities;
- deletion/editing capability;
- scheduling capability;
- music/native-sound constraints;
- rate limits;
- destination/link behavior;
- API/provider/manual path;
- last successful live self-test.

Keep provider policy/review limitations distinct from code support.

## Frontend

One clear Connections surface:

- product/account identity;
- platform icon/handle;
- connection status;
- capability state;
- exact missing setup;
- Connect/Reconnect/Test/Disconnect;
- review/manual fallback explanation;
- callback/registration information when applicable.

Product pickers must show only accounts valid for that product unless cross-product routing is intentionally enabled.

## Verification

Exercise capability resolution, stale/revoked tokens, review-gated modes, wrong account identity, and direct-vs-manual delivery contracts.

## Exit gate

The operator and publishing engine agree on exactly what each account can do.

---

# H4 — Discovery, trends, creators, competitors, communities, and social opportunities

## Goal

Build an evidence-backed social research team that continuously finds things worth creating or responding to.

## Discovery sources

Use permitted APIs/search/web sources and normalized provider interfaces. Store:

- source/provider;
- URL/remote identifier;
- platform;
- author/account;
- observed timestamp;
- region/language when available;
- text/topic;
- engagement metrics with collection timestamp;
- trend/search context;
- rights/reuse state;
- confidence and freshness.

## Discovery roles

- Trend Scout: rising topics, queries, formats, seasonal moments, and velocity.
- Trend Validator: relevance, freshness, evidence quality, saturation, and product fit.
- Creator Scout: relevant creators/accounts and content patterns.
- Competitor Scout: competitor topics/formats/cadence/gaps without copying creative expression.
- Community Scout: recurring questions, pain points, misconceptions, requests, and language people use.
- Content Gap Analyst: compare external demand against the product's capabilities, current portfolio, and recent history.

## Opportunity model

Rank opportunities using measurable inputs such as relevance, audience fit, product fit, platform fit, timing/freshness, asset readiness, prior evidence, saturation/fatigue, and risk. Semantic judgement can be model-assisted; final deterministic policy remains inspectable.

Each opportunity must explain why it matters and what Halyard could contribute that is original/useful.

## Engagement generator

For permitted contexts:

conversation → context fetch → usefulness/relevance check → reply draft → exact target/account preview → operator approval → eligibility/context recheck → send → remote confirmation.

Handle deleted/changed conversations, duplicate prevention, revoked permissions, uncertain sends, and no-action recommendations.

Do not fabricate personal experience, relationships, testimonials, or current trends.

## Frontend

Intelligence workspace:

- Opportunities
- Trends
- Creators
- Competitors
- Communities
- Conversations
- Saved/monitored topics

Filters by product, platform, objective, freshness, and opportunity type. Every card links to evidence and offers appropriate actions: Make content, Draft reply, Monitor, Ignore, Save.

## Verification

Use realistic provider fixtures plus authorized live reads. Prove trend → opportunity → content and conversation → approved reply. Include irrelevant/stale/duplicate/off-brand cases.

## Exit gate

Halyard can ground a content/reply opportunity in current evidence and say "do nothing" when that is the better answer.

---

# H5 — Strategy, campaigns, diversity, and creative briefs

## Goal

Turn product/audience/platform/opportunity evidence into a purposeful content portfolio rather than isolated posts.

## Strategy inputs

- product goal;
- audience problem/desire;
- current product capability/evidence;
- platform/account capability;
- opportunity/trend/community signal;
- business/acquisition objective;
- campaign/series context;
- recent content history;
- learned evidence;
- operator constraints;
- asset readiness.

## Content roles

Allow intentional roles such as:

- attract relevant attention;
- teach/help;
- demonstrate product value;
- build trust/brand personality;
- answer an objection/question;
- convert an interested viewer;
- participate in a relevant conversation;
- recurring series/retention.

Not every post requires a CTA or product mention.

## Concept generation

Generate 3–5 materially different concepts when appropriate. Diversity is measured by premise, audience problem, information/proof, story structure, creative approach, and payoff—not merely words, fonts, or colors.

Allow recognizable recurring series when they remain useful and not fatigued.

## Canonical creative brief

Persist one resolved brief per production containing:

- objective and success definition;
- audience;
- product truth/evidence;
- concept/premise;
- hook promise;
- narrative/payoff;
- target platforms;
- format/media type;
- platform-specific adaptations;
- asset requirements;
- product-demo requirements;
- visual direction;
- typography direction;
- motion direction;
- voice direction;
- music/SFX direction;
- caption/CTA/destination;
- length/pacing;
- brand voice;
- research facts;
- learned insights/heuristics used;
- operator pins/overrides;
- provenance for strategic claims.

Resolve conflicting instructions before writing.

## Frontend

Create flow:

- "Tell Halyard what to make" or "Give me ideas";
- platform selection;
- goal/intent;
- optional advanced creative controls;
- concept cards showing hook, premise, format, visuals, expected duration, evidence required, why recommended;
- pin/override controls;
- Generate.

## Exit gate

A requested piece or discovered opportunity has a coherent, product-specific, platform-aware brief before paid production begins.

---

# H6 — Writing, research, and editorial quality

## Goal

Produce human, clear, truthful writing in the product's actual voice.

## Research

- Research before writing for sourced formats.
- Feed verified facts/sources into the first writer request.
- Prefer authoritative readable sources by domain/context, but do not use food-only source preferences for other products.
- Avoid facts/openings already used by the same account.
- Preserve source support for later review/correction.

## Writing

- Product-specific voice from ProductPack, not one universal terse house style.
- Respect format structure without producing fragments or robotic slot-filling.
- Opening creates a reason to continue; payoff fulfills it.
- Avoid unsupported superlatives, fake urgency, vague authority, AI filler, repeated slogans, and engagement bait.
- Caption serves the platform and content role; overflow/first-comment behavior is explicit where supported.
- CTA only when useful and compatible with the real destination/link route.

## Editorial formats

Complete and validate: quiz, history, tips, recipe, myth/fact, comparison, origin, transformation, walkthrough, poll, behind-the-scenes, plus product-neutral feature launch, objection answer, supported case study, recurring series, and long-form structures where appropriate.

## Critique/repair

Separate mechanical repair from editorial judgement. Critic failure/unavailability is explicit. Targeted corrections preserve supported facts, product subject, and unaffected slots.

## Exit gate

Writing is coherent, natural, source-safe, product-specific, and appropriate for the platform/format before media production.

---

# H7 — Professional media production and platform-specific creative

## Goal

Make content that looks intentionally produced rather than like a generic template engine.

## Asset hierarchy

- real product capture for product evidence;
- operator-owned/licensed imagery/footage;
- permitted stock footage/B-roll for atmosphere/action only;
- generated illustration/atmosphere where permitted;
- generated media never substitutes for product evidence.

All assets retain source/provenance/licence/role.

## Short-form video

Support multiple meaningful creative approaches:

- real product interaction/demo;
- action-led B-roll;
- screen-demo story;
- evidence-led comparison;
- question/answer;
- annotated/spatial explanation;
- fast tutorial;
- transformation;
- myth correction;
- creator/founder-style narrative;
- playful illustrative concept.

Templates are compositional primitives, not the idea.

Motion vocabulary includes cuts, reframes, push/pull, zoom, pan, masking/reveals, kinetic typography, layered depth/parallax where appropriate, picture-in-picture, UI callouts, caption emphasis, visual resets, and purposeful transitions. Do not require constant motion; motion must communicate something.

A product-demo beat must identify what visibly happens, why it matters, and which real asset proves it.

## Typography / visual system

Controlled diversity using ProductPack brand constraints plus creative direction. Track font system, opening, visual language, motion grammar, composition, and recent repetition. Prevent silent font fallback.

## Voice/audio

- directed voice characteristics per piece;
- pronunciation and WER checks;
- intentional pauses/pacing;
- licensed music with provenance/platform restrictions;
- intelligent music selection using mood, BPM, motion intensity, narration density, recent use, and learned evidence;
- usage history per account/content item;
- sparse purposeful SFX;
- final-mix loudness/peak/ducking checks.

Maintain clean masters/stems so destination-specific mixes and native-audio finishing are possible.

## Other media

- carousels with purposeful cover/progression/balanced slides;
- pins designed for search/save intent;
- single images;
- text-first posts;
- Stories where the actual platform surface supports the intended interaction;
- long-form 16:9 with authored chapters, many meaningful scenes, product demonstration/B-roll, narration/music, thumbnail candidates, title/description/chapter metadata, and Shorts derivatives.

Long-form must not be a stretched short or one held beat per minute.

## Platform-specific variants

One concept may yield distinct TikTok, Reels, Shorts, Pinterest, X, Threads, Facebook, Bluesky, and YouTube-long-form outputs. Adapt duration, framing, pacing, text density, CTA/destination, audio/native-sound instructions, caption, thumbnail, and narrative as needed. Do not generate pointless variants just to fill every platform.

## Exit gate

Representative actual assets for each offered media type/platform surface are playable/swipeable and genuinely suited to their destination.

---

# H8 — Creative review, hearing, self-correction, and exact-revision approval

## Goal

Judge the finished artifact, not merely the script or render success code.

## Review layers

### Technical/media integrity

- file decodes;
- correct dimensions/frame rate/duration;
- no unexpected black/frozen/corrupt spans;
- assets loaded;
- captions/timing intact;
- audio present when intended;
- delivery-compatible format.

### Visual/editorial reviewer

Inspect representative actual frames/clips and every carousel slide for:

- hook readability;
- hierarchy;
- continuity;
- visual relevance;
- product evidence clarity;
- pacing/state changes;
- crop/safe area;
- awkward repetition;
- visual slop/AI artifacts;
- thumbnail quality.

### Audio reviewer

Review the actual final mix for:

- natural pronunciation;
- delivery/phrasing;
- excessive speed/slow delivery;
- bad pauses;
- music masking voice;
- abrupt cuts;
- excessive/irrelevant SFX;
- obvious audio artifacts.

### Product/evidence reviewer

Re-check final text and visual claims against ProductPack evidence.

## Correction controller

Artifact → structured defects → smallest safe correction → invalidate affected outputs → rerender/re-synthesize only necessary stages → re-run affected and downstream gates → compare → keep better version or escalate.

Bound iterations/cost. Never invent replacement evidence.

## Frontend review

- play/watch/listen the exact finished asset;
- swipe carousels;
- platform tabs;
- caption/title/CTA/destination;
- review findings/evidence;
- revision history;
- costs;
- Revise / Approve / Schedule.

Targeted natural-language revisions such as "make the opening clearer, show more of the product, lower the music" should map to controlled production changes.

## Exit gate

The operator approves the exact publishable revision after seeing/hearing it, and any later material change invalidates approval.

---

# H9 — Scheduling, campaigns, queue, and publishing

## Goal

Turn approved work into safe, understandable delivery.

## Scheduling

- account-specific—not platform-only—candidate identity;
- correct operator/audience timezone and DST handling;
- explicit same-account spacing, campaign sequencing, and same-idea staggering;
- enforce both minimum and declared maximum spacing rules where meaningful;
- daily/weekly caps by account/surface;
- learned timing evidence may influence choices only after sufficient data;
- label configured windows vs industry heuristics vs Halyard empirical findings;
- concurrency-safe placement/rescheduling;
- explain every placement/defer decision.

## Queue/calendar UI

- campaign grouping;
- platform/account identity;
- approved revision;
- scheduled time + timezone;
- delivery mode;
- capability/review state;
- dependencies;
- conflicts/density warnings;
- drag/reschedule with rule revalidation;
- clear failed/awaiting-manual/uncertain/published states.

## Publishing

Preserve kill switch, routing-scope safety, idempotency, duplicate protection, audio provenance gate, platform capability checks, and exact-revision approval.

Remote uncertainty must reconcile before retrying an external action.

Where public direct publishing is not permitted/approved, provide an honest manual/native/draft workflow; do not call it equivalent automation.

## Exit gate

An approved production reaches the correct target through the declared route exactly once and Halyard records the remote truth.

---

# H10 — Engagement, replies, relationships, and community learning

## Goal

Help manage the social presence after posting without becoming a spam bot.

## Build

- owned-post comment/question triage;
- support/objection/PR-risk classification;
- reply drafts grounded in actual conversation and ProductPack;
- creator/community relationship records;
- high-value commenter/community opportunities;
- testimonial/UGC permission tracking;
- operator-approved outbound engagement where platform policy/API permits it;
- saved follow/investigate/collaboration recommendations.

## Default policy

observe → classify → recommend → draft → human approve → context/permission recheck → execute → confirm.

No invented personal experience or relationship. No autonomous unsolicited promotion.

## Frontend

Inbox / Opportunities / Conversations / Relationships with product/account/platform filters, evidence, target context, draft editor, and approval state.

## Exit gate

Halyard can safely help answer real questions and convert community feedback into future content opportunities.

---

# H11 — Acquisition, attribution, learning, and experimentation

## Goal

Learn whether social activity creates product value, not just likes.

## Product instrumentation

Define per-product events such as:

- landing/site visit;
- signup/account creation;
- core activation event;
- subscription/purchase when applicable;
- retention/repeat use where appropriate.

Activation is app-specific and configured in ProductPack.

## Attribution

Carry platform/account/content/campaign/destination identifiers through allowed links/deep links. Preserve privacy limits and distinguish unavailable from measured zero.

Validation traffic is marked and excluded from empirical growth claims.

## Creative feature learning

Extract and consume features including:

- concept family;
- objective;
- hook family;
- editorial format;
- media type;
- visual language;
- typography;
- opening;
- motion grammar;
- duration/pacing;
- product-demo presence and timing;
- imagery role;
- voice/direction;
- music attributes;
- SFX density;
- CTA/destination;
- posting window;
- platform/account;
- trend/opportunity source.

Do not repeatedly reprocess the same observations as independent corroboration.

Insights retain sample size, effect, confidence, evidence windows, contradictions, review/decay state, and product/account scope. Later strategy must record which actionable insight affected it.

## Experimentation

Support controlled exploration vs exploitation across concepts/treatments, without optimizing from tiny samples. Operator rejection/taste remains separate from audience performance and acquisition outcomes.

## Frontend

Results/Analytics:

- Content performance
- Acquisition
- Conversion/activation
- Campaigns
- Platforms/accounts
- Creative patterns
- Learned insights
- Experiments
- "What Halyard changed because of this"

## Exit gate

Real product instrumentation is verified and later creative/scheduling decisions demonstrably change because of sufficiently supported evidence.

---

# H12 — Production qualification and operator acceptance

## Goal

Prove the declared product works repeatedly from the normal UI.

## Required real-app coverage

- RecipeFix;
- Kinolog;
- one additional real product selected from accessible `PROJECT_2025` apps;
- unfamiliar synthetic ProductPack fixture.

## Qualification journeys

1. New operator lands, signs up/signs in.
2. Adds each product and reviews Product Brain.
3. Edits/locks product facts/brand/goals.
4. Connects valid social accounts.
5. Requests ideas and a specific content piece.
6. Uses a discovered social opportunity to create another piece.
7. Watches the live agent/production floor through completion.
8. Opens intermediate artifacts from the floor.
9. Receives finished cross-platform outputs.
10. Watches/listens/swipes them.
11. Requests a targeted correction.
12. Reviews the corrected revision.
13. Approves exact output.
14. Schedules with visible rationale.
15. Performs authorized controlled delivery/publication through each promised route.
16. Reconciles remote status.
17. Handles a real/fixture comment/reply journey.
18. Verifies product acquisition instrumentation.
19. Runs performance learning and proves a later decision changes.
20. Recovers from worker/provider/storage/retry failures without duplicate external actions.

## UX qualification

- laptop/desktop responsive layouts;
- phone/mobile web layouts;
- keyboard navigation and focus;
- readable type and contrast;
- clear empty/loading/error/stale/permission/capability states;
- no ordinary journey depends on hidden terminal/database work.

## Operational acceptance targets

Use repository-approved targets, including a non-cherry-picked multi-product creative batch and a sustained soak. Any threshold is a Halyard release target, not an industry guarantee or claim that content will go viral.

## Final report

For every requirement classify:

- implemented and exercised;
- implemented but externally blocked, with exact operator/provider action;
- not implemented.

Target: zero items in the last category for the declared production scope.

---

# Required implementation discipline

For every phase/work package:

- inspect current callers and data path before replacing anything;
- preserve working production-grade systems;
- implement backend/data and frontend state together;
- test caller + handler + persistence + consumer;
- exercise realistic failure paths;
- inspect actual generated media when media changes;
- validate shared changes with multiple products;
- update `docs/STATUS.md`, `docs/DECISIONS.md`, and this programme's evidence;
- keep costs bounded and recorded;
- never print secrets;
- do not publish as a side effect of testing;
- stop only when a real external operator action is unavoidable.

The final product is judged by the operator journey and the quality/truth of the output—not by the number of agents, templates, migrations, or passing unit tests alone.
