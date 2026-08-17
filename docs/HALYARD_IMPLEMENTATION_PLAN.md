# Halyard Phased Implementation & Verification Plan

**Purpose:** Turn `HALYARD_MASTER_ARCHITECTURE.md` into a staged implementation program without destabilizing working Halyard functionality.

---

# 1. Execution model

We will build in phases.

Each phase follows:

```text
AUDIT CURRENT STATE
        ↓
DEFINE SLICE
        ↓
BACKEND / DATA
        ↓
AGENT / ORCHESTRATION
        ↓
UI
        ↓
TESTS
        ↓
INTEGRATION TEST
        ↓
RUNTIME VERIFICATION
        ↓
AUDIT CALLERS + CONSUMERS
        ↓
PR / REVIEW
        ↓
NEXT PHASE
```

Never implement a large architectural area without testing the entire vertical slice.

---

# 2. Phase 0 — Foundation / Agent Operating System

## Goal

Make the existing agentic architecture measurable and enforceable before adding many new agents.

## Build

### Agent registry
Create a canonical registry containing:

- agent ID
- name
- team
- version
- model
- purpose
- input schema
- output schema
- tools
- caller
- permissions
- timeout
- retry policy
- downstream consumer
- status

### Agent execution records

Persist every meaningful agent execution.

Track:

- trigger
- inputs
- outputs
- status
- latency
- retries
- errors
- version
- downstream consumption

### Capability state

Implement explicit capability states:

```text
implemented_exercised
implemented_partial
implemented_no_caller
planned
blocked
regression
```

### Agent health

Detect:

- no caller
- unused output
- missing job
- unreachable feature
- unavailable tool
- never-invoked version

### System health

Strengthen:

- worker health
- queue health
- DB health
- job health
- integration health
- token/OAuth health
- Blotato health

### Halyard Auditor

Build the first production version of the architecture/call/job/runtime audit.

## UI

Add:

```text
Agents
  Overview
  Runs
  Teams
  Health
  Versions

System
  Health
  Jobs
  Integrations
  Audit
```

## Tests

Must include:

- registry validation
- execution lifecycle
- permission enforcement
- capability state transitions
- orphan-agent detection
- orphan-job detection
- unused-output detection
- synthetic phantom-capability tests

## Exit criteria

No major existing agent may be described as implemented without a known caller or explicit orphan status.

---

# 3. Phase 1 — Product Intelligence / Product Brain

## Goal

When a user connects a product, Halyard builds a durable understanding of it.

## Build

### Product connection intake

Support appropriate product evidence sources:

- website
- repository
- deployed app
- documentation
- store listing
- uploaded assets
- provided business information

### Product Discovery Agent

### Code Intelligence Agent

### UX Explorer

### Visual Brand Agent

### Store/Listing Agent

### Product Reconciler

### Product Intelligence schema

Create durable records for:

- features
- workflows
- users
- personas
- jobs
- differentiators
- claims
- brand
- visual identity
- pricing
- monetization
- competitors
- conversion funnel
- evidence

## UI

Build Product Intelligence navigation:

```text
Product Brain
Features
Users
Audience
Workflows
Brand
UX
Visual Identity
Claims
Evidence
Competitors
Conversion
```

Show confidence and evidence for each major fact.

## Tests

Use RecipeFix as the first vertical slice.

Verify:

```text
connect RecipeFix
→ collect evidence
→ run product agents
→ persist brain
→ render Product Brain UI
→ show evidence
```

## Exit criteria

Halyard can explain RecipeFix using persisted evidence without relying on a transient model conversation.

---

# 4. Phase 2 — Platform Intelligence

## Goal

Halyard knows what each connected social platform supports and what Halyard can actually execute.

## Build shared framework

```text
Platform
PlatformSpecialist
PlatformCapability
PlatformFormat
PlatformConstraint
PlatformMetric
PlatformEngagementCapability
```

## Specialists

- Instagram
- TikTok
- X
- Threads
- YouTube
- Pinterest
- Facebook
- Reddit

## Each specialist covers

- formats
- constraints
- publishing
- links
- media
- carousels
- stories
- reels/shorts
- comments
- replies
- mentions
- analytics
- editing/deletion
- scheduling
- music
- native conventions
- audience behavior
- content norms
- timing
- optimization

## API capability layer

Explicitly model:

```text
native
official API
Blotato
authenticated
review-gated
rate-limited
manual-only
```

## Blotato

Map the current Halyard Blotato integration into the capability model.

Do not duplicate Blotato functionality.

## UI

Accounts → Platforms → Capabilities

For each platform show:

- connected?
- authenticated?
- supported actions
- unsupported actions
- Blotato path
- direct API path
- review requirements
- rate limits
- manual fallback

## Tests

Every claimed platform capability must have:

- capability definition
- execution path or explicit blocked state
- test
- caller
- UI state

---

# 5. Phase 3 — Social Discovery & Opportunity Intelligence

## Goal

Halyard learns what is happening around the connected product.

## Build

### Social Discovery Agent
### Trend Research Agent
### Creator Research Agent
### Competitor Intelligence Agent
### Conversation Research Agent

Use the best available connectors/sources for each platform.

Research should preserve:

```text
source
timestamp
platform
author
content
topic
engagement
evidence
confidence
```

## Opportunity Analyzer

Turn signals into ranked opportunities.

Deterministic ranking/policy remains outside the model.

## UI

```text
Intelligence
  Discover
  Opportunities
  Trends
  Creators
  Competitors
  Conversations
```

Each opportunity should show:

- why it matters
- evidence
- product fit
- platform fit
- engagement potential
- conversion potential
- risk
- recommended action
- required approval

## Tests

Synthetic signals → agent analysis → deterministic ranking → opportunity UI.

No opportunity is allowed to enter an action queue merely because an LLM recommended it.

---

# 6. Phase 4 — Strategy & Content Intelligence

## Goal

Connect product intelligence, platform intelligence, social research, business goals, audience knowledge, and historical performance to content planning.

## Build

Extend existing:

- Idea Engine
- Strategist
- Hook Generator
- Copywriter
- Payoff Verifier
- VO Scriptwriter
- Setup Kit Writer
- Co-pilot

Add structured strategy inputs:

```text
product
audience
platform
format
objective
business_goal
opportunity
historical_learning
brand_voice
visual_identity
content_pillar
CTA
```

## Platform-native strategy

For each candidate:

- choose platform
- choose format
- determine whether video/image/text is appropriate
- determine hook style
- determine length
- determine CTA
- determine posting window
- determine whether platform-specific adaptation is required

Do not invent "best practices" as measured facts until Halyard has its own data.

Separate:

```text
platform fact
industry heuristic
Halyard empirical finding
```

## UI

Expand:

```text
Ideas
Drafts
Review
Calendar
Campaigns
```

with visible reasoning and source data where useful.

---

# 7. Phase 5 — Media, Voice & Creative Audio

## Goal

Create production-quality platform-aware media.

## Build

### Creative Audio Intelligence

Determine:

- voiceover
- voice
- tone
- pacing
- music
- music intensity
- licensing
- ducking
- caption mode

### ElevenLabs integration

Support configured/cloned voice where available.

### Renderer

Continue deterministic rendering for:

- video
- images
- audio
- captions
- subtitles

## Tests

Every generated artifact should have:

```text
source plan
render job
artifact
metadata
validation result
```

No artifact is considered production-ready merely because rendering succeeded.

---

# 8. Phase 6 — Creative Validation & Quality

## Goal

Catch quality problems before approval/publishing.

## Build/extend

- visual perception
- subtitle QA
- video QA
- audio QA
- voice QA
- claim verification
- coherence
- platform compliance

## Required validation behavior

Each check returns:

```text
passed
failed
skipped
not_measured
```

## UI

Review screen should show:

```text
Content
Media
Platform
Claims
Quality
Warnings
Failures
Evidence
Approval
```

Clicking a failed check should expose the evidence.

## Tests

Include intentionally bad artifacts:

- subtitle overflow
- wrong transcription
- static opening
- text wall
- claim mismatch
- wrong platform dimensions
- loudness issue
- missing CTA
- unsupported capability

Verify failures actually block the appropriate execution path.

---

# 9. Phase 7 — Publishing & Approval

## Goal

Turn approved content into safe, observable publishing.

## Preserve existing strengths

Do not replace the current publish machinery unnecessarily.

Retain:

- duplicate protection
- kill switches
- approval gates
- manual publish paths
- idempotency
- job scheduling
- platform constraints

## Add

A formal execution plan:

```text
content
→ target account
→ target platform
→ target format
→ publish method
→ Blotato/direct adapter
→ validation
→ permission
→ schedule
→ publish
→ confirmation
```

## UI

Calendar and content detail should show:

- publish status
- execution method
- capability state
- approval state
- job state
- failure reason
- retry state

## Tests

Start with dry runs.

Then controlled real publishing once credentials/account state are valid.

The first real posts are an experiment, not a claim of optimization.

---

# 10. Phase 8 — Engagement & Relationships

## Goal

Halyard becomes a manager after publishing.

## Build

- Conversation Perception Agent
- Engagement Opportunity Agent
- Reply Writer
- Creator Relationship Agent
- Escalation Agent

## Capabilities

Halyard should surface:

- comments needing responses
- questions
- objections
- high-value commenters
- creators
- partnership opportunities
- support issues
- PR risks
- conversations worth joining

## Action policy

Default:

```text
observe
→ classify
→ recommend
→ draft
→ human approve
→ execute
```

Autonomy can be added later by policy level.

## UI

```text
Inbox
Opportunities
Conversations
Relationships
```

---

# 11. Phase 9 — Growth, Attribution & Learning

## Goal

Measure whether social activity actually creates business outcomes.

## Build

Track:

```text
impression
profile_visit
click
site_visit
signup
activation
subscription
retention
```

Preserve attribution through:

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

## Learning agents

- Performance Analyst
- Content Learner
- Platform Learner
- Audience Learner
- Strategy Learner
- Rejection Learner

## UI

```text
Analytics
  Social
  Content
  Acquisition
  Conversion
  Attribution
  Platform
  Audience
```

The system should eventually be able to explain:

```text
what happened
why it happened
what converted
what did not
what to repeat
what to stop
what to test next
```

---

# 12. Phase 10 — Autonomy

Only after the previous layers are reliable.

## Build

Policy-driven autonomy.

Levels:

```text
0 observe
1 recommend
2 draft
3 human approval
4 approved low-risk automation
5 autonomous within explicit policy
```

Every action must be checked against:

```text
agent permission
platform capability
account capability
policy
quality gates
idempotency
audit log
```

No autonomous execution without an explicit capability state.

---

# 13. UI implementation strategy

Do not wait until the end to build the UI.

Every phase must ship a vertical UI slice.

## Core navigation

```text
Overview
Product Intelligence
Intelligence
Content
Engagement
Analytics
Agents
Accounts
System
```

## Frontend requirements

Each new backend capability needs:

- query/read model
- loading state
- empty state
- error state
- stale state where applicable
- action state
- permission state
- capability state
- responsive UI
- observable execution state

## UX rule

The UI should tell the operator:

> What Halyard knows, why it knows it, what it recommends, what it is doing, what it cannot do, and what it needs from me.

---

# 14. Testing strategy

Testing is part of implementation, not a final phase.

## Unit

- agent contracts
- schemas
- deterministic gates
- policy
- routing
- platform capabilities
- attribution
- validators

## Integration

- agent → persistence
- job → handler
- handler → downstream consumer
- Blotato → execution
- platform capability → policy
- validation → approval
- publish → metrics

## E2E

Test complete journeys.

Example:

```text
connect RecipeFix
→ product discovery
→ Product Brain
→ connect social account
→ capability discovery
→ research
→ opportunity
→ strategy
→ draft
→ media
→ validation
→ approval
→ dry-run publish
→ engagement
→ attribution
→ learning
```

## Agent-specific

Every agent must have:

- valid input
- valid output
- caller test
- downstream consumer test
- failure test
- timeout/retry test where applicable

## Phantom capability tests

Deliberately create:

- an agent with no caller
- a scheduled job with no handler
- an output nobody consumes
- an enabled but unreachable feature

The Halyard Auditor must detect each one.

---

# 15. Phase exit protocol

Before Claude Code moves to the next phase:

### Required

- all tests pass
- new tests added
- E2E path exercised where applicable
- UI verified
- DB migration verified
- caller graph verified
- downstream consumer verified
- no unexpected orphaned capability
- no regression
- docs updated
- capability registry updated
- commit/PR created

### Then stop for review.

Do not combine multiple phases into one uncontrolled implementation.

---

# 16. The 0-post problem

The current repository has strong structural evidence but limited empirical evidence because publishing has not yet produced meaningful production data.

Therefore:

- platform strategy must initially rely on documented platform facts and explicit heuristics
- Halyard empirical claims must only be created after real observations
- publishing should begin as soon as safe infrastructure is ready
- early posts should be treated as controlled experiments
- do not build a "per-platform optimizer" that pretends to know account-specific performance before it has data

---

# 17. RecipeFix pilot

RecipeFix is the first proving ground.

Pilot objective:

```text
Product connection
→ Product Brain
→ social account connection
→ platform intelligence
→ research
→ strategy
→ draft
→ validation
→ human approval
→ first posts
→ engagement
→ attribution
→ learning
```

The architecture must remain product-agnostic.

RecipeFix-specific knowledge belongs in product data, not hard-coded Halyard logic.

---

# 18. Engineering workflow with Claude Code + review

For every implementation phase:

```text
User
 ↓
Claude Code Opus
 ↓
inspect current repository
 ↓
implement one scoped slice
 ↓
run tests
 ↓
run targeted audit
 ↓
commit
 ↓
push
 ↓
PR
 ↓
ChatGPT review
 ↓
approve OR correction prompt
 ↓
next slice
```

Claude must not assume that documentation means implementation.

It must inspect:

- callers
- imports
- jobs
- handlers
- DB consumers
- UI consumers
- tests
- runtime telemetry

---

# 19. Blocker protocol

If a blocker occurs:

**STOP immediately.**

Do not continue with unrelated implementation.

Report:

```text
BLOCKER
What failed:
Why it blocks this phase:
Evidence:
What was attempted:
Whether the issue is code/config/API/credential/external:
Safe workaround:
What is required to unblock:
```

Only resume after the blocker is resolved or the user explicitly approves an architectural workaround.

---

# 20. Recommended implementation order

```text
P0 Foundation / Agent OS / Auditor
        ↓
P1 Product Intelligence / Product Brain
        ↓
P2 Platform Intelligence
        ↓
P3 Social Discovery + Opportunities
        ↓
P4 Strategy + Content Intelligence
        ↓
P5 Media + Voice + Creative QA
        ↓
P6 Publishing / Approval
        ↓
P7 Engagement + Relationships
        ↓
P8 Growth + Attribution + Learning
        ↓
P9 Configurable Autonomy
```

This ordering is intentional.

Do not build autonomy before observability.

Do not build optimization before measurement.

Do not build product-specific strategy before product intelligence.

Do not build platform-specific optimization before platform capability modeling.

Do not build engagement automation before conversation understanding and policy.

---

# 21. Immediate first implementation slice

The first Claude Code implementation after these documents are installed should be **P0 only**:

1. inspect current agent implementations
2. create/normalize the agent registry
3. create execution records
4. create capability-state representation
5. add health/audit primitives
6. wire the Halyard Auditor
7. add the Agents/System UI surfaces needed to observe these
8. test all of the above
9. compare the result against the existing audit
10. do not rebuild existing agents or content systems

The goal is to make Halyard capable of proving what is actually running before expanding the architecture.

---

# 22. Definition of done for the whole program

Halyard is complete when a user can connect an arbitrary product and Halyard can:

1. understand the product
2. verify what it knows
3. understand the connected platforms
4. research the surrounding social ecosystem
5. identify opportunities
6. build strategy
7. create platform-native content
8. create and render media
9. quality-control the artifact
10. obtain approval or operate under explicit autonomy policy
11. publish through the correct execution path
12. monitor engagement
13. understand relationships
14. track acquisition
15. track conversion
16. learn from outcomes
17. update future strategy
18. continuously audit its own system health and capability integrity

while keeping every important action:

- observable
- testable
- permissioned
- replayable
- attributable
- auditable

This is the implementation program for the Halyard master architecture.
