# Halyard Agentic Social Team Specification

**Status:** Canonical target-architecture extension  
**Date:** 2026-08-28  
**Repository:** `GoldenRodger5/Halyard`  
**Depends on:** `HALYARD_MASTER_ARCHITECTURE.md`, `HALYARD_IMPLEMENTATION_PLAN.md`, `AGENT_REGISTRY.md`  

> This document extends the existing Halyard architecture. It does **not** claim that the systems below are already implemented. Current implementation must always be verified against source code, call graphs, jobs, database consumers, tests, and runtime evidence.

---

## 1. Purpose

Halyard's target product is:

> **Halyard — your product's AI social team.**

The system should be capable of taking a connected product, understanding the product and its market, understanding every connected social account, continuously observing the relevant social ecosystem, finding opportunities, deciding what content and engagement actions are appropriate, creating professional platform-native content and media, validating it, scheduling it intelligently, publishing it through governed infrastructure, measuring outcomes, and learning from those outcomes.

The objective is not to create more agents. The objective is to create a social operation that becomes measurably better over time.

The target closed loop is:

```text
PRODUCT
  ↓
PRODUCT BRAIN
  ↓
ACCOUNT + AUDIENCE INTELLIGENCE
  ↓
SOCIAL OBSERVATION
  ↓
DISCOVERY
  ↓
SIGNALS
  ↓
OPPORTUNITIES
  ↓
STRATEGY
  ↓
CREATIVE BRIEF
  ↓
CONTENT + MEDIA PRODUCTION
  ↓
CREATIVE / FACT / PLATFORM QA
  ↓
APPROVAL / POLICY
  ↓
SCHEDULING + DISTRIBUTION
  ↓
SOCIAL ENGAGEMENT
  ↓
MEASUREMENT + ATTRIBUTION
  ↓
LEARNING + EXPERIMENTATION
  ↓
UPDATED ACCOUNT / PLATFORM / CONTENT STRATEGY
  ↓
OBSERVE AGAIN
```

This must work for RecipeFix first and remain product-agnostic so another connected product can inherit the same operating system without RecipeFix-specific business logic being hard-coded into Halyard.

---

# 2. Non-negotiable architecture

## 2.1 Agents perceive, reason, research, and write

Agents are responsible for open-ended work:

- perception
- research
- interpretation
- classification
- synthesis
- planning
- creative ideation
- copywriting
- media direction
- recommendations
- analysis

## 2.2 Deterministic systems decide and execute

Code remains authoritative for:

- permissions
- policy
- account routing
- platform capability
- approval requirements
- rate limits
- cooldowns
- duplicate protection
- scheduling
- idempotency
- validation gates
- kill switches
- credentials
- database state
- job execution
- actual API calls
- audit records

An agent can recommend an action; it cannot make the action permissible merely by recommending it.

## 2.3 No giant supervisor

Do not create a general-purpose LLM supervisor that holds the entire system in its context and negotiates with other agents in natural language.

Use bounded teams with:

- typed contracts
- persistent state
- deterministic jobs
- event-driven transitions
- explicit dependencies
- durable outputs
- execution records
- capability state

A bounded planner/orchestrator is allowed when deterministic decomposition alone is insufficient, but it must remain constrained by typed contracts and policy. It is not the source of truth for permissions or execution.

---

# 3. The social team

The target organization is a set of functional teams rather than a hierarchy of personalities.

```text
HALYARD SOCIAL TEAM
│
├── Product Intelligence
├── Platform Intelligence
├── Account & Audience Intelligence
├── Discovery & Social Research
├── Opportunity Intelligence
├── Strategy & Distribution
├── Content & Copy
├── Creative Direction
├── Media Production
├── Creative QA / Verification
├── Engagement & Relationships
├── Growth & Attribution
├── Learning & Experimentation
└── Governance / Reliability / Auditor
```

The teams share a common evidence model and execution architecture.

---

# 4. Product Intelligence Team

The existing Product Brain remains the foundation.

### Responsibilities

Maintain evidence-backed knowledge of:

- product identity
- mission
- target users
- personas
- jobs to be done
- features
- workflows
- differentiators
- product claims
- prohibited claims
- UX
- visual identity
- brand voice
- pricing
- monetization
- competitors
- conversion funnel
- recent product changes
- product roadmap signals where legitimately available

### Required behavior

The team must understand the product both as:

1. software, and
2. a customer experience.

For RecipeFix this means understanding actual recipe adaptation, substitutions, Cook Mode, saved recipes, shopping-list behavior, dietary transformations, UI, onboarding, and the real user journey rather than generating generic food posts.

Every important fact retains:

```text
source
source_type
confidence
first_observed
last_verified
status
content_hash
```

Facts must distinguish model knowledge from evidence gathered by Halyard.

---

# 5. Platform Intelligence Team

Use one shared framework with platform specialists.

Initial specialists:

- TikTok
- Instagram
- YouTube
- Threads
- X
- Facebook
- Pinterest
- Reddit where supported

Each specialist owns a structured knowledge/capability model, not an isolated social engine.

## 5.1 Platform knowledge

Capture:

- formats
- dimensions
- duration limits
- media constraints
- copy constraints
- link behavior
- native editing expectations
- discovery/search behavior
- hashtags where relevant
- comments/replies
- mentions
- analytics
- scheduling
- publishing mechanics
- review requirements
- rate limits
- API limitations
- Blotato capabilities
- direct adapter capabilities
- manual-only actions

## 5.2 Evidence classes

Every platform recommendation is labeled as one of:

```text
PLATFORM_FACT
INDUSTRY_HEURISTIC
HALYARD_OBSERVATION
HALYARD_EXPERIMENT
ACCOUNT_SPECIFIC_EVIDENCE
```

Never call a generic model belief a Halyard learning.

---

# 6. Account Intelligence / Social Engine

This is the missing layer that turns Halyard from a generic social generator into a manager for a **specific account**.

For every connected account, Halyard builds an Account Brain.

## 6.1 Account profile

Track:

- platform
- handle
- identity
- account type
- connected product
- account persona
- audience
- follower/following observations where available
- historical posts
- historical formats
- historical topics
- historical performance
- posting cadence
- publishing windows
- engagement patterns
- link behavior
- visual conventions
- recurring series
- successful themes
- weak themes
- creator/relationship graph

## 6.2 Account voice model

Learn from the account's actual content:

- vocabulary
- sentence length
- humor level
- directness
- educational vs entertaining balance
- CTA patterns
- emoji usage
- punctuation
- recurring phrases
- brand terminology
- founder vs brand voice

This is an evidence-backed style model, not a prompt saying "sound professional."

## 6.3 Account content model

Maintain a rolling representation of:

```text
content_pillars
formats
creative_patterns
hooks
topics
series
angles
CTAs
visual_treatments
posting_cadence
performance_by_dimension
fatigue
novelty
```

## 6.4 Account audience model

Infer carefully from available evidence:

- audience interests
- content affinity
- recurring questions
- pain points
- objections
- language
- active periods
- response patterns
- conversion behavior where attributable

Store confidence and sample size. Do not turn weak evidence into a permanent persona.

## 6.5 Account strategy

The Social Engine should answer:

> "If I were managing this exact account today, what should this account do next?"

Inputs include:

```text
Product Brain
Platform Brain
Account Brain
Audience Brain
Current signals
Current opportunities
Business goals
Historical performance
Experiment state
Content fatigue
Upcoming product events
```

Outputs include:

- what to post
- what not to post
- what format
- which platform
- which account
- when
- why
- whether to reuse
- whether to remix
- whether to create net-new media
- whether to engage instead of publish

---

# 7. Discovery & Social Research Team

Discovery is continuous, not a one-time research task.

## 7.1 Discovery Agent

Find:

- relevant accounts
- creators
- experts
- competitors
- communities
- conversations
- questions
- complaints
- product problems
- recurring topics
- emerging themes
- collaboration opportunities

## 7.2 Trend Intelligence Agent

Detect:

- emerging trends
- accelerating topics
- declining trends
- recurring/seasonal trends
- platform-native trends
- cross-platform trends
- niche trends
- format trends
- hook trends
- creator trends

Trend detection should use velocity/change rather than only raw popularity.

A trend record should contain:

```text
trend_id
platforms
first_seen
last_seen
velocity
volume
engagement_change
source_observations
related_entities
brand_relevance
audience_relevance
confidence
lifecycle_state
expiration
```

## 7.3 Creator Intelligence

Build a creator graph containing:

- niche
- audience overlap
- content patterns
- engagement quality
- growth signals
- brand safety
- relationship state
- collaboration potential
- previous interactions
- previous collaboration outcomes

## 7.4 Competitor Intelligence

Track:

- content cadence
- topics
- launches
- product claims
- formats
- creative patterns
- engagement patterns
- positioning
- emerging changes

The objective is not copying competitors. It is identifying market movement, whitespace, and useful evidence.

## 7.5 Conversation Intelligence

Understand:

- questions
- objections
- confusion
- praise
- complaints
- requests
- feature demand
- misconceptions
- language users actually use

Conversation intelligence should feed both content creation and product intelligence.

---

# 8. Opportunity Intelligence

Signals are not automatically opportunities.

Opportunity Intelligence determines whether a signal is worth acting on.

Each opportunity includes:

```text
opportunity_id
source_signal_ids
platform
account
product_fit
audience_fit
urgency
expected_value
risk
confidence
recommended_action
recommended_format
recommended_content_angle
evidence
expiration
approval_requirement
```

Example:

```text
Signal:
  gluten-free dessert conversation accelerating on TikTok

Product fit: 93
Audience fit: 89
Urgency: high
Confidence: 0.87

Recommendation:
  Create a fast recipe-adaptation demonstration showing RecipeFix
  converting a conventional dessert into a gluten-free version.

Reason:
  The trend maps directly to a product capability and can be demonstrated,
  rather than merely discussed.
```

The ranking system must remain deterministic after agent-produced evidence is normalized.

---

# 9. Strategy & Distribution Team

Strategy is where Halyard decides what the social operation should accomplish.

## 9.1 Strategic objectives

Support:

- awareness
- discovery
- education
- product demonstration
- engagement
- community growth
- creator relationships
- traffic
- signup
- activation
- subscription
- retention
- product feedback

## 9.2 Content portfolio

Do not generate random posts independently.

Maintain a portfolio across:

- content pillars
- formats
- objectives
- audiences
- platforms
- creative treatments
- campaigns
- recurring series
- experiments

The system should intentionally balance:

```text
proven winners
new experiments
trend-responsive content
product education
brand-building content
community content
conversion-oriented content
```

## 9.3 Staggering and distribution

A single underlying idea may become multiple platform-native executions.

Example:

```text
ONE OPPORTUNITY
      ↓
TikTok      → fast product demonstration
Instagram   → Reel + optional carousel follow-up
YouTube     → Short + potentially long-form tutorial
Threads     → discussion / question
X           → concise insight / thread
Pinterest   → search-oriented visual asset
Facebook    → native adaptation for that audience
```

These are not automatically published simultaneously.

The scheduler chooses timing based on:

- account cadence
- audience activity
- platform evidence
- campaign timing
- trend decay
- content fatigue
- recent publication density
- related posts
- business priority
- cross-platform sequencing

## 9.4 Cross-platform reuse policy

Every reuse decision is explicit:

```text
NEW
DIRECT_REUSE
ADAPT
REMIX
DERIVATIVE
REJECT_REUSE
```

Reuse should consider:

- platform fit
- audience overlap
- asset fatigue
- time since original
- performance
- novelty
- creative differences
- caption differences
- audio differences
- CTA differences

Halyard should reuse successful ideas intelligently without flooding every account with identical content.

---

# 10. Content & Copy Team

Existing generation systems remain the foundation.

The team includes or extends:

- Strategist
- Idea Generator
- Hook Generator
- Copywriter
- Payoff Verifier
- VO Scriptwriter
- Reply Writer
- Setup Kit Writer
- Rejection Learner

## Content brief

Every piece begins with a structured brief:

```text
objective
audience
platform
account
content_pillar
source_signal
opportunity
angle
hook
story_structure
format
CTA
product_claims
required_evidence
creative_treatment
reuse_strategy
expected_outcome
experiment_id
```

Content should not be generated from a single free-form prompt with no provenance.

---

# 11. Creative Director Team

This is the major extension required to fix low-quality test content.

A production-quality short is not a text card with motion.

The Creative Director must decide **how the viewer experiences the story**.

## 11.1 Creative Director

Determines:

- concept
- narrative
- hook
- pacing
- visual progression
- shot structure
- product demonstration
- emotional/educational payoff
- CTA
- audio treatment
- caption treatment
- transition language

## 11.2 Short-Form Video Director

For video, produce a shot-level plan:

```text
shot_id
start/end
purpose
visual
source_asset
camera/motion
text_overlay
voiceover
sound
transition
product_ui
proof
```

The director should prefer actual footage, product captures, food imagery, screen recordings, and other meaningful visual evidence over static text cards.

## 11.3 Recipe / Product Demonstration Director

For RecipeFix-style content, the system should recognize that the product itself can be the story:

```text
problem
→ original recipe
→ open RecipeFix
→ choose adaptation
→ show transformation
→ cook / demonstrate
→ result
→ CTA
```

The exact structure is selected by the creative director, not hard-coded for every video.

## 11.4 Visual pacing

The creative planner should optimize for attention without blindly forcing a fixed cut rate.

Use:

- early visual change
- meaningful movement
- frequent but purposeful shot changes
- short text moments
- visual proof
- payoff timing
- removal of dead air
- acceleration through repetitive steps

A slow step can be shown quickly; a meaningful transformation can receive more time.

## 11.5 Text density

Hard quality rules should detect:

- text walls
- unreadable captions
- repetitive cards
- paragraphs on screen
- visual stagnation
- weak first frame
- CTA-only endings

The system should not default to putting the recipe title on a screen for several seconds.

---

# 12. Media Production Team

The renderer remains deterministic.

Agents produce plans; renderers execute plans.

## Media types

Support progressively:

- product screen recordings
- real product captures
- recipe/food imagery
- generated imagery where appropriate
- video clips
- animated UI demonstrations
- typography
- captions
- voiceover
- music/audio beds
- sound effects
- transitions

## Asset provenance

Every visual asset must retain:

```text
source
license/rights state where known
product evidence relationship
capture timestamp
checksum
content relationship
```

Never fabricate a product UI state that was not observed unless the artifact is explicitly labeled as illustrative.

## Product capture

The media pipeline should be able to request a deterministic product capture for important creative concepts where a supported product connector exists.

For RecipeFix this should enable footage showing the actual product flow rather than merely describing it.

---

# 13. Audio Intelligence

Audio selection is strategic.

The system chooses among:

- no audio
- voiceover
- music
- voiceover + music
- sound design

based on:

- platform
- creative type
- audience
- pacing
- content objective
- rights availability
- brand policy
- experiment state

The renderer enforces:

- timing
- ducking
- loudness
- captions
- synchronization
- safe output format

Do not use music simply because every video template has a music track.

---

# 14. Creative Quality Team

Quality must be independent from the agent that created the content.

## 14.1 Visual QA

Measure:

- opening frame strength
- visual variety
- scene duration distribution
- static sections
- text density
- safe areas
- readability
- composition
- product visibility
- visual continuity

## 14.2 Narrative QA

Check:

- hook matches content
- promise is fulfilled
- product demonstration is understandable
- payoff arrives
- CTA matches objective
- no unnecessary setup

## 14.3 Product/claim QA

Every material product claim must map to evidence.

## 14.4 Platform QA

Check final media against the target platform's actual constraints and the account's available capability state.

## 14.5 Creative score

The score should be multi-dimensional:

```text
hook
story
visual_quality
pacing
product_demo
clarity
brand_fit
platform_fit
claim_accuracy
cta
novelty
```

No single aggregate score may hide a hard failure.

## 14.6 Regeneration loop

A failed creative should return structured feedback to the relevant team:

```text
FAIL
→ reason
→ evidence
→ affected dimension
→ recommended correction
→ regenerate
→ revalidate
```

Do not endlessly regenerate. Deterministic retry budgets and escalation are required.

---

# 15. Engagement & Relationship Team

Publishing is only one side of social management.

## Conversation Perception

Classify:

- question
- praise
- complaint
- support issue
- objection
- spam
- creator opportunity
- collaboration opportunity
- PR-sensitive conversation

## Engagement Opportunity

Recommend:

- ignore
- monitor
- reply
- comment
- like/reaction
- follow
- relationship task
- escalate

## Relationship model

Track:

```text
account
relationship_strength
interaction_count
last_interaction
response_rate
creator_fit
collaboration_history
performance
notes
```

Default lifecycle remains:

```text
observe
→ recommend
→ draft
→ approve
→ execute
→ measure
→ learn
```

---

# 16. Growth & Attribution Team

The ultimate objective is product growth, not vanity metrics.

Track where possible:

```text
platform
account
campaign
content
creative_concept
hook
format
CTA
link
click
landing_visit
signup
activation
subscription
retention
```

Attribution should preserve lineage from:

```text
signal
→ opportunity
→ strategy
→ content
→ publication
→ click
→ conversion
```

This allows Halyard to learn which signals and creative concepts actually grow the product.

---

# 17. Learning & Optimization Team

This is the second major missing system.

Current metrics and scoring are not sufficient to call the system learned. Halyard needs a real closed loop.

## 17.1 Performance Analyst

Answers:

- what happened?
- compared with what?
- how certain are we?
- what changed?

## 17.2 Content Learner

Learn relationships between performance and:

- topic
- content pillar
- format
- hook family
- narrative structure
- duration
- pacing
- visual density
- CTA
- audio treatment
- product demonstration
- publication timing

## 17.3 Platform Learner

Learn per:

```text
platform + account
```

Never collapse all platforms into one model.

## 17.4 Audience Learner

Learn:

- who responds
- who converts
- what topics attract them
- what objections prevent conversion

## 17.5 Strategy Learner

Translate evidence into future recommendations.

## 17.6 Rejection Learner

Aggregate operator rejection data into reusable patterns:

```text
operator rejected 14 hooks
→ common issue: too generic
→ update hook preference model
```

## 17.7 Evidence hierarchy

Halyard must distinguish:

```text
MODEL_KNOWLEDGE
INDUSTRY_HEURISTIC
HALYARD_OBSERVATION
HALYARD_EXPERIMENT
HALYARD_ACCOUNT_EVIDENCE
```

Only the last three can be called Halyard evidence.

---

# 18. Experimentation System

Learning requires controlled experimentation.

Every experiment should define:

```text
hypothesis
variable
control_or_baseline
variants
success_metric
minimum_sample
start
end
status
result
confidence
```

Possible experiments:

- hook A vs hook B
- short vs longer duration
- voiceover vs no voiceover
- product-first vs food-first opening
- CTA variants
- posting windows
- format variants
- remix vs net-new

Do not run experiments that change multiple important variables while claiming to measure one.

When sample sizes are too small, the system must say so.

---

# 19. Learning implementation model

Do not jump immediately to reinforcement learning.

The first learning layer should be evidence-backed statistical learning:

1. normalize outcomes
2. create feature vectors from content metadata
3. aggregate by account/platform
4. calculate baselines
5. compare variants
6. estimate uncertainty
7. update strategy weights/preferences
8. generate new hypotheses
9. test them
10. repeat

Only introduce bandits or more advanced optimization when the dataset supports them and the behavior can be explained.

The system must never invent a performance conclusion from one post.

---

# 20. Cross-platform intelligence

The same concept should have a shared identity but separate execution.

Create a `Concept` lineage:

```text
concept_id
source_opportunity
source_signal
product_goal
creative_thesis
```

Then platform executions:

```text
concept
├── tiktok_execution
├── instagram_execution
├── youtube_short_execution
├── youtube_long_execution
├── threads_execution
├── x_execution
├── pinterest_execution
└── facebook_execution
```

Each execution has its own:

- hook
- copy
- format
- creative plan
- media
- CTA
- timing
- performance

This allows Halyard to answer:

> "The concept worked, but which execution worked?"

rather than treating seven copies as unrelated posts.

---

# 21. Content fatigue and novelty

The system must prevent repetition.

Track similarity across:

- concept
- topic
- hook
- copy
- visual structure
- asset reuse
- CTA
- opening shot

Define:

```text
fresh
related
repetitive
fatigued
```

A successful idea can be reused, but only when the new execution adds meaningful novelty or the strategy explicitly calls for a series.

---

# 22. Intelligent scheduling

Scheduling becomes a strategy problem, not simply a calendar sort.

Inputs:

- opportunity urgency
- trend decay
- account cadence
- audience activity
- recent performance
- fatigue
- campaign deadlines
- platform constraints
- content readiness
- asset readiness
- approval state
- expected business value

Output:

```text
publish_at
platform
account
priority
reason
confidence
```

The scheduler must not invent optimal timing when there is insufficient data. It should fall back to a transparent heuristic and label it accordingly.

---

# 23. Autonomous operating loop

The mature system should operate continuously through jobs.

Example daily loop:

```text
OBSERVE
  ↓
REFRESH PRODUCT / ACCOUNT / PLATFORM KNOWLEDGE
  ↓
DISCOVER
  ↓
DETECT SIGNALS
  ↓
RANK OPPORTUNITIES
  ↓
UPDATE STRATEGY
  ↓
GENERATE CONTENT QUEUE
  ↓
GENERATE CREATIVE BRIEFS
  ↓
RENDER
  ↓
QA
  ↓
SCHEDULE
  ↓
ENGAGE
  ↓
MEASURE
  ↓
ATTRIBUTE
  ↓
LEARN
  ↓
UPDATE NEXT CYCLE
```

Every step must be independently observable and replayable.

---

# 24. Data model requirements

Do not create duplicate tables when an existing entity can be extended safely.

Before adding schema, inspect existing tables and migrations.

Conceptual entities that must exist somewhere in the model:

```text
products
product_evidence
product_facts
social_accounts
platform_capabilities
social_observations
social_entities
social_relationships
signals
opportunities
content_concepts
content_items
creative_plans
creative_executions
assets
renders
media_observations
quality_results
experiments
experiment_variants
publication/submission records
post_metrics
attribution events
learning observations
strategy snapshots
agent_runs
capability audit state
```

Names may differ if equivalent existing entities already exist.

Do not duplicate an existing source of truth merely to match this document.

---

# 25. Provenance and lineage

Every generated artifact should be traceable:

```text
product
→ evidence
→ signal
→ opportunity
→ concept
→ creative brief
→ agent runs
→ assets
→ render
→ QA
→ submission
→ publication
→ metrics
→ attribution
→ learning observation
```

This is essential for debugging, trust, and learning.

---

# 26. Agent registry requirements

Every new agent must declare:

```text
id
team
version
model
purpose
inputs
outputs
tools
caller
consumer
permissions
timeout
retry policy
acceptance tests
```

The Auditor must be able to prove:

```text
contract exists
caller exists
execution exists
output exists
consumer exists
test exists
runtime invocation exists
```

No documentation-only green states.

---

# 27. UI requirements

The operator should be able to understand what Halyard knows and why.

Core surfaces:

```text
Overview
Product Brain
Social Intelligence
  Discover
  Trends
  Conversations
  Creators
  Competitors
  Opportunities
Strategy
Content
  Concepts
  Drafts
  Creative Review
  Calendar
Engagement
Relationships
Analytics
  Performance
  Attribution
  Learning
Agents
System
```

A content detail page should expose:

```text
WHY THIS CONTENT
SOURCE SIGNAL
OPPORTUNITY
STRATEGIC OBJECTIVE
CREATIVE BRIEF
PLATFORM ADAPTATIONS
MEDIA
QA
APPROVAL
SCHEDULE
PUBLICATION
PERFORMANCE
LEARNING
```

The user should never have to guess why Halyard created something.

---

# 28. RecipeFix creative benchmark

RecipeFix is the first production benchmark for the creative team.

A generated short must be able to demonstrate the actual product and look like a professional social video, not an automated slideshow.

Minimum benchmark characteristics:

- vertical short-form format where appropriate
- immediate visual hook
- meaningful visual change early
- real product UI/capture where available
- actual recipe/food imagery where available
- clear adaptation story
- dynamic pacing
- readable captions
- restrained text density
- voiceover/music only when strategically useful
- visible payoff
- clear CTA
- platform-native adaptation
- no fabricated product state
- no dead-air waits
- no long static recipe cards unless deliberately chosen by strategy

A canonical benchmark concept should be rendered separately for:

- TikTok
- Instagram Reels
- YouTube Shorts

The underlying concept may be shared; the executions must be platform-aware.

The benchmark is a quality gate for the creative system, not a permanent template for all future content.

---

# 29. Current repository reality

The repository already contains substantial foundations that must be preserved rather than rebuilt, including:

- Product Brain / product intelligence work
- agent registry and Auditor
- content generation agents
- creative planning infrastructure
- render/media pipeline
- visual media observation/QC infrastructure
- publishing infrastructure
- platform adapters
- account/capability safety
- rehearsal infrastructure
- attribution/analytics foundations

The latest repository evidence also shows that YouTube private upload is proven end-to-end and that the publishing kill switch remains off. YouTube analytics normalization and long-form rendering remain known gaps. These current facts must be re-verified from source before implementation rather than copied blindly from documentation.

The existing `packages/core/src/creative/plan.ts` is particularly important: it already establishes a deterministic story-plan layer above video composition and explicitly supports real captured product footage when available. Extend this architecture rather than replacing it.

---

# 30. Definition of success

Halyard succeeds when it can do this without manual prompt engineering:

```text
Connect RecipeFix
        ↓
Understand RecipeFix
        ↓
Understand @recipe.fix / @recipefix / @Recipe_Fix account states
        ↓
Understand each platform
        ↓
Observe relevant social ecosystem
        ↓
Find a meaningful opportunity
        ↓
Explain why it matters
        ↓
Develop a strategic content concept
        ↓
Create platform-specific creative briefs
        ↓
Produce professional media
        ↓
Validate media independently
        ↓
Schedule intelligently
        ↓
Publish through governed infrastructure
        ↓
Measure platform + business outcomes
        ↓
Learn what actually worked
        ↓
Change future strategy
        ↓
Produce a better next piece
```

The system should become more useful because it accumulates evidence about the product, account, audience, platform, creative, and business outcome.

That accumulated intelligence is the moat.
