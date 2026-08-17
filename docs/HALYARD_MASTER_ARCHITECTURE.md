# Halyard Master Architecture

**Status:** Canonical target architecture  
**Repository:** `GoldenRodger5/Halyard`  
**Primary implementation model:** Claude Code Opus + incremental review  
**Architecture principle:** Agents perceive/reason/write; deterministic code owns state, policy, routing, validation, permissions, scheduling, and execution.

---

## 0. Purpose

This document is the canonical architectural direction for Halyard.

Halyard is not merely a social scheduler or content generator. It is an **AI social operating system for connected products**.

A user connects an arbitrary product/app and its available social accounts. Halyard should progressively understand:

- what the product is
- what it does
- how it works
- who it serves
- why people use it
- its features and differentiators
- its UX and visual identity
- its brand voice
- its business model and conversion funnel
- its claims and evidence
- its competitors and market position
- the social ecosystem surrounding its category
- each connected platform's capabilities and conventions
- what content should be created
- how that content should be adapted per platform
- how the content should be rendered and quality-controlled
- when and where it should be published
- how the account should engage with people
- which relationships matter
- which content and actions drive acquisition/conversion
- what the results teach Halyard
- how strategy should change as evidence accumulates

The eventual user experience is:

> "This is my product. These are my social accounts. Go run my social presence."

Halyard must understand what that actually means before it acts.

---

# 1. Core architecture principles

## 1.1 Agents perceive; deterministic systems decide

LLMs/agents are used where open-ended perception, reasoning, synthesis, classification, research, or writing is valuable.

Deterministic code owns:

- state transitions
- permissions
- policy
- routing
- scheduling
- retries
- idempotency
- validation gates
- capability enforcement
- publishing execution
- database integrity
- kill switches
- audit trails
- observability
- autonomy boundaries

Do **not** turn Halyard into one giant supervisor agent.

Use:

- specialized agents
- bounded teams
- typed input/output contracts
- persistent state
- deterministic orchestration
- explicit permissions
- inspectable execution records

A model should never silently become the source of truth for whether an operation is allowed.

---

# 2. Halyard lifecycle

The complete lifecycle is:

```text
CONNECT PRODUCT
      ↓
UNDERSTAND PRODUCT
      ↓
VERIFY PRODUCT KNOWLEDGE
      ↓
CONNECT SOCIAL ACCOUNTS
      ↓
UNDERSTAND PLATFORM CAPABILITIES
      ↓
BUILD BRAND + AUDIENCE MODEL
      ↓
RESEARCH SOCIAL ECOSYSTEM
      ↓
FIND OPPORTUNITIES
      ↓
DEVELOP CONTENT STRATEGY
      ↓
CREATE CONTENT
      ↓
VALIDATE CONTENT
      ↓
APPROVE
      ↓
PUBLISH
      ↓
ENGAGE
      ↓
TRACK ACQUISITION
      ↓
TRACK CONVERSION
      ↓
LEARN
      ↓
CHANGE STRATEGY
      ↓
REPEAT
```

This is the full-send target. Implementation must be staged rather than attempted as one rewrite.

---

# 3. Major Halyard teams

## Team A — Product Intelligence

### Mission

Build a deep, evidence-backed understanding of the connected product.

### Agents

**Product Discovery Agent**
- inspect public product surfaces
- inventory features
- identify workflows
- identify user jobs
- identify differentiators
- understand product positioning

**Code Intelligence Agent**
- inspect connected repositories
- routes
- APIs
- data models
- feature flags
- integrations
- implementation truth
- actual vs claimed behavior

**UX Explorer**
- navigate the actual product
- inspect onboarding
- inspect empty states
- inspect important flows
- identify friction
- identify conversion points
- understand information architecture

**Visual Brand Agent**
- inspect screenshots and live UI
- palette
- typography
- imagery
- spacing
- component language
- visual hierarchy
- design language

**Store / Listing Agent**
- App Store / Google Play presence
- screenshots
- descriptions
- keywords
- ratings/reviews
- positioning

**Product Reconciler**
- compare marketing claims
- source code
- runtime behavior
- observed UI
- public listings
- discovered evidence

### Product Intelligence Model

The product brain should contain structured knowledge for:

```text
identity
mission
vision
goals
users
audiences
personas
jobs_to_be_done
features
workflows
differentiators
pricing
monetization
competitors
brand_voice
visual_identity
claims
prohibited_claims
product_artifacts
UX_model
conversion_funnel
app_store_positioning
content_pillars
```

Every important fact needs:

```text
source
confidence
last_verified
status
```

Status should support:

```text
unverified
verified
refuted
stale
```

Halyard must preserve provenance rather than allowing unsupported model assumptions to become product facts.

---

# 4. Team B — Platform Intelligence

Halyard needs platform specialists, but **not seven unrelated platform systems**.

Use a shared Platform Intelligence Framework with specialized platform agents.

Initial specialists:

- Instagram Specialist
- TikTok Specialist
- X Specialist
- Threads Specialist
- YouTube Specialist
- Pinterest Specialist
- Facebook Specialist
- Reddit Specialist

The framework must remain extensible.

## Each specialist understands

### Content
- supported formats
- format constraints
- media requirements
- links
- carousels
- stories
- reels/shorts
- text posts
- image posts
- native conventions

### Publishing
- official API capabilities
- Blotato capabilities
- account authentication state
- review/approval requirements
- rate limits
- scheduling
- editing/deletion
- manual-only paths

### Engagement
- read capabilities
- comments
- replies
- mentions
- conversation retrieval
- limitations

### Analytics
- available metrics
- metric definitions
- attribution limitations

### Strategy
- format selection
- copy structure
- hooks
- length
- CTA patterns
- posting cadence
- timing
- creative norms
- audience behavior

### Critical capability model

Never confuse:

> "The platform supports this."

with:

> "Halyard can perform this through the current authenticated/API/Blotato path."

Represent capability as:

```text
native_capability
official_api_capability
blotato_capability
authenticated_capability
review_constraint
rate_limit
manual_only
```

Capability state must be visible in the UI and used by deterministic execution policy.

---

# 5. Blotato execution architecture

Blotato is an execution transport layer, not Halyard's intelligence layer.

```text
Halyard Intelligence
        ↓
Platform Strategy
        ↓
Execution Plan
        ↓
Blotato / Direct Adapter
        ↓
Social Platform
```

Halyard owns:

- what
- why
- where
- when
- whether
- creative strategy
- validation
- approval
- engagement policy
- learning

Blotato owns mechanics where it is the appropriate transport.

Existing direct platform adapters remain valuable where direct capabilities are required.

---

# 6. Team C — Social Discovery & Research

This is a core expansion of Halyard.

### Social Discovery Agent
- discover relevant conversations
- questions
- recurring problems
- audience needs
- creators
- opportunities

### Trend Research Agent
- emerging topics
- velocity
- conversation volume
- cross-platform emergence
- trend lifecycle

### Creator Research Agent
- creator niche
- audience
- relevance
- content patterns
- relationship potential

### Competitor Intelligence Agent
- competitor content
- positioning
- feature claims
- launches
- engagement patterns
- content patterns
- gaps

### Conversation Research Agent
- threads
- comments
- repeated questions
- objections
- audience language
- sentiment/context

Research must use approved sources/connectors and preserve source/provenance data.

Halyard should continuously build a social knowledge graph around the connected product.

---

# 7. Team D — Opportunity Intelligence

Discovery creates signals. Opportunity Intelligence determines which signals matter.

### Opportunity Analyzer

Inputs:

```text
signal
product_intelligence
platform_intelligence
audience_model
historical_performance
business_goals
risk_policy
```

Outputs:

```text
relevance
audience_fit
conversation_quality
recency
engagement_potential
brand_fit
conversion_potential
risk
recommended_action
reasoning
evidence
```

The model may classify and explain.

Deterministic policy decides:

- whether an opportunity enters an action queue
- priority
- required approval
- whether the action is allowed
- which platform/account can act

---

# 8. Team E — Content & Creative

This is the strongest existing area and should be extended rather than rebuilt.

Existing/target components:

- Idea Engine
- Strategist
- Hook Generator
- Copywriter
- Payoff Verifier
- VO Scriptwriter
- media generation
- setup kit writer
- co-pilot
- platform adaptation
- campaign planning
- content calendar

The Strategist eventually consumes:

```text
Product Intelligence
+
Platform Intelligence
+
Social Intelligence
+
Past Performance
+
Audience Intelligence
+
Business Goals
+
Current Opportunities
```

The strategist should determine:

- content objective
- audience
- platform
- format
- hook strategy
- angle
- CTA
- content pillar
- whether video/image/text is appropriate
- whether a platform-native adaptation is required
- timing recommendation
- expected outcome

The existing hook taxonomy, hook generation, payoff verification, copywriter, and retry/gating systems remain foundational.

---

# 9. Creative Audio Intelligence

Audio should be a capability model, not simply an ElevenLabs checkbox.

Inputs:

```text
content_intent
platform
format
voiceover_requirement
tone
pacing
music_availability
licensing
brand_preferences
```

Outputs can include:

```yaml
voiceover: true
voice: configured_voice
music: background_bed
music_intensity: low
ducking_db: -12
caption_mode: burned_in
```

ElevenLabs can provide the configured/cloned voice path where available.

Deterministic rendering enforces:

- voice track
- music bed
- ducking
- normalization
- captions
- timing
- output format

Halyard should eventually reason about **when voiceover helps**, **when music helps**, and **what type of audio supports the content objective**, rather than always applying the same treatment.

---

# 10. Team F — Creative Validation & Quality

This must be a first-class team.

Inputs:

- copy
- images
- video
- voice
- captions
- subtitles
- CTA
- links
- target platform
- target format
- product claims
- intended message

## Quality systems

### Visual Perception
Describe what is visibly present.

### Subtitle QA
- transcription accuracy
- timing
- clipping
- readability
- line breaks
- safe areas

### Video QA
- opening/hook
- pacing
- scene changes
- static sections
- visual continuity
- text-wall detection
- visual/text relationship

### Audio QA
- WER
- loudness
- silence
- pacing
- clipping

### Voice QA
Eventually:
- robotic delivery
- emphasis
- pronunciation
- unnatural pauses

### Claim Verification
Does each material claim trace to product evidence?

### Coherence
Does the rendered artifact actually show what the copy claims?

### Platform Compliance
Does the final artifact satisfy the target platform's constraints?

A quality gate must report:

```text
passed
failed
skipped
not_measured
```

Never call an unmeasured dimension "passed."

---

# 11. Team G — Engagement & Relationships

Halyard should not stop when content is published.

## Conversation Perception Agent

Understands:

- post
- comment
- thread
- author
- context
- intent
- sentiment
- question
- objection
- spam
- support issue

## Engagement Opportunity Agent

Determines whether the connected brand should participate.

Possible actions:

- ignore
- monitor
- draft reply
- recommend like/reaction
- recommend follow
- escalate
- create relationship task
- human-approved reply
- publish permitted reply when policy allows

## Reply Writer

Writes platform-native replies using:

- product brain
- brand voice
- conversation context
- relationship history
- platform conventions
- safety policy

## Creator Relationship Agent

Tracks:

```text
creator
accounts
niche
topics
audience_fit
interaction_history
response_rate
collaboration_history
performance
relationship_strength
```

## Escalation Agent

Identifies:

- angry users
- support issues
- sensitive comments
- potential PR problems
- legal/compliance-sensitive situations
- high-value relationship moments

No automatic action should bypass deterministic permission policy.

---

# 12. Team H — Growth, Attribution & Learning

This is what makes Halyard more than a social media tool.

Target funnel:

```text
CONTENT
  ↓
SOCIAL IMPRESSION
  ↓
PROFILE VISIT
  ↓
CLICK
  ↓
SITE VISIT
  ↓
SIGNUP
  ↓
ACTIVATION
  ↓
SUBSCRIPTION
  ↓
RETENTION
```

Attribution should preserve:

```text
platform
account
content
campaign
hook
format
creator
CTA
link
```

Eventually Halyard should answer questions like:

> Instagram Reel → views → profile visits → site visits → installs → signups → Pro conversions.

Not just:

> "This Reel received 17K views."

## Learning agents

### Performance Analyst
What happened?

### Content Learner
What content characteristics correlate with performance?

### Platform Learner
What works on this specific account/platform?

### Audience Learner
Who engages and who converts?

### Strategy Learner
What should change next?

### Rejection Learner
What does the operator consistently reject?

The rejection system must eventually graduate from per-item anti-examples to real pattern-level learning.

---

# 13. Team I — System Health & Governance

Halyard will eventually operate many asynchronous processes. System health is therefore a product feature.

## System Health Agent
- workers
- queue latency
- retries
- dead letters
- schedules
- DB
- storage

## Integration Health Agent
- OAuth
- tokens
- scopes
- Blotato
- platform capability state
- rate limits

## Data Integrity Agent
- orphan records
- impossible states
- stale records
- mismatches
- attribution breaks

## Agent Health Auditor

Directly addresses the failure pattern identified in the repository audit.

Detect:

- declared agent with no caller
- output produced but unused
- scheduled job with no execution path
- feature enabled but unreachable
- tool declared but unavailable
- agent version deployed but never invoked
- optional gate whose required input is never supplied
- capability recorded but not consumed

---

# 14. Halyard Auditor

The Halyard Auditor is a first-class system.

It compares:

```text
ARCHITECTURE
      ↓
SOURCE CODE
      ↓
CALL GRAPH
      ↓
JOB GRAPH
      ↓
DATABASE
      ↓
RUNTIME TELEMETRY
      ↓
TEST COVERAGE
```

It produces capability states:

```text
🟢 Implemented + exercised
🟡 Implemented + partially exercised
🟠 Implemented but no caller
🔵 Planned
🔴 Blocked
⚠️ Regression
```

This is mandatory because the repository has already demonstrated the expensive failure mode of "exists in documentation but never runs."

The auditor should be automated where practical and should itself have tests proving that it catches synthetic phantom capabilities.

---

# 15. Agent execution contract

Every agent must have a durable contract:

```text
Agent
├── purpose
├── version
├── team
├── model
├── input schema
├── output schema
├── tools
├── caller
├── permissions
├── retries
├── timeout
├── state
├── observations
├── acceptance tests
└── downstream consumer
```

No agent is considered implemented merely because its function exists.

It is implemented only when:

1. the contract exists
2. the caller exists
3. the execution path exists
4. the output is consumed
5. tests cover the path
6. runtime telemetry can prove invocation
7. capability state is accurate

---

# 16. No supervisor tree

Halyard should not introduce a general-purpose supervisor agent merely because the system is agentic.

The pipeline is deterministic:

```text
Ideas
→ Write
→ Make
→ Review
→ Decide
→ Publish
→ Engage
→ Learn
```

Teams coordinate through:

- database state
- job queue
- structured outputs
- deterministic routing
- explicit permissions

A supervisor may only be introduced for a bounded, explicitly justified task where deterministic orchestration cannot express the required control flow.

---

# 17. Autonomy model

Autonomy should be configurable by policy.

Example action levels:

```text
LEVEL 0 — Observe only
LEVEL 1 — Recommend
LEVEL 2 — Draft
LEVEL 3 — Human approval required
LEVEL 4 — Automatically execute low-risk approved actions
LEVEL 5 — Autonomous execution within explicit policy
```

Every autonomous action must pass:

```text
agent permission
+
platform capability
+
account capability
+
policy
+
safety gate
+
idempotency
+
audit record
```

The UI must clearly expose why an action is allowed, blocked, or awaiting approval.

---

# 18. Product Brain UI

After connecting a product such as RecipeFix, Halyard should expose a living Product Brain.

Example sections:

```text
RecipeFix Brain

Product
Vision
Audience
Users
Core Jobs
Features
Workflows
Differentiators
Brand Voice
Visual Identity
Content Pillars
Pricing
Monetization
Conversion Funnel
Claims
Competitors
Evidence
Confidence
Last Verified
```

Every claim should show provenance and verification status.

---

# 19. Halyard UI target

The UI should eventually reflect the actual operating model.

```text
HALYARD

Overview

Product Intelligence
  Product Brain
  Users
  Features
  Brand
  UX
  Competitive Position

Intelligence
  Opportunities
  Discover
  Trends
  Creators
  Competitors
  Conversations

Content
  Ideas
  Drafts
  Review
  Calendar
  Campaigns
  Media

Engagement
  Inbox
  Opportunities
  Conversations
  Relationships

Analytics
  Social
  Content
  Acquisition
  Conversion
  Attribution
  Platform
  Audience

Agents
  Overview
  Activity
  Runs
  Teams
  Health
  Versions

Accounts
  Platforms
  Connections
  Capabilities

System
  Health
  Jobs
  Integrations
  Data Integrity
  Audit
```

The UI is not merely presentation. It is the operator's control plane for:

- understanding
- review
- approval
- debugging
- capability visibility
- agent observability
- system health
- strategy

---

# 20. Architecture/data rules

All major intelligence should be persistent and queryable.

Important records should have:

```text
source
confidence
created_at
updated_at
last_verified_at
status
agent_version
evidence_reference
```

Agent executions should have:

```text
run_id
agent_id
agent_version
team
trigger
input_reference
output_reference
started_at
completed_at
status
retry_count
error
downstream_consumers
```

Never allow critical reasoning to exist only in transient model context.

---

# 21. Current-state rule

The existing Halyard repository is the implementation source of truth.

The architecture above is the **target**.

Every implementation change must explicitly classify functionality as:

```text
IMPLEMENTED + EXERCISED
IMPLEMENTED + PARTIALLY EXERCISED
IMPLEMENTED BUT NO CALLER
PLANNED
BLOCKED
REGRESSION
```

Do not rewrite working subsystems merely to make their names match this document.

Extend existing primitives where appropriate.

Examples already identified:

- existing hook system → wire and extend
- existing copywriter → extend
- existing reply drafting → extend
- existing Explorer → evolve into broader research architecture
- existing Blotato transport → retain
- existing deterministic review gates → strengthen
- existing worker/job system → retain and expand
- existing attribution model → extend

---

# 22. Definition of "done"

A capability is not done because:

- the UI exists
- the function exists
- the agent prompt exists
- the database table exists
- the architecture document mentions it

A capability is done when:

```text
UI
 ↓
backend
 ↓
orchestration
 ↓
agent/code execution
 ↓
persistence
 ↓
consumer
 ↓
tests
 ↓
runtime verification
 ↓
observability
```

all connect.

Every implementation should be traceable from user action or scheduled trigger to final observable outcome.

---

# 23. Halyard's first connected product

The first real product integration is RecipeFix.

RecipeFix is the proving ground, not a hard-coded special case.

Anything discovered while integrating RecipeFix should be generalized into reusable Halyard primitives unless the behavior is explicitly product-specific.

The architecture must support:

```text
RecipeFix
Product B
Product C
...
```

without creating a separate social manager implementation for each.

---

# 24. Permanent engineering rule

When a blocker occurs:

**STOP.**

Do not continue implementing unrelated work.

Report:

1. exact blocker
2. why it blocks the requested phase
3. evidence
4. attempted fixes
5. safe workaround, if one exists
6. what must be resolved before continuing

Do not silently invent a workaround that changes architecture.

---

# 25. Success criteria

Halyard succeeds when a connected product can be transformed from:

```text
unknown application
```

into:

```text
understood product
+
understood audience
+
understood brand
+
understood platforms
+
researched social ecosystem
+
ranked opportunities
+
platform-native strategy
+
generated content
+
validated media
+
approved publishing
+
intelligent engagement
+
measured acquisition
+
measured conversion
+
continuous learning
```

while remaining:

- inspectable
- replayable
- observable
- testable
- permissioned
- platform-capability-aware
- safe
- extensible
- genuinely useful to the operator

This is the canonical Halyard direction.
