# Halyard Social Intelligence & Autonomous Social Operations

**Status:** Architecture / product direction  
**Primary initial platform:** X  
**Current connected account:** `@Recipe_Fix`

## 1. Product Vision

Halyard is not merely a social media scheduler. The long-term product is an **agentic social media operating system** that can:

1. Observe social ecosystems relevant to a product or brand.
2. Discover relevant people, pages, communities, competitors, conversations, and topics.
3. Detect trends and meaningful changes.
4. Determine which signals matter to the brand.
5. Turn signals into content and engagement opportunities.
6. Generate platform-native drafts and recommendations.
7. Execute approved actions through deterministic platform adapters.
8. Observe results.
9. Learn from those results.

Core loop:

```text
OBSERVE -> DISCOVER -> UNDERSTAND -> RECOMMEND -> DRAFT
        -> APPROVE -> EXECUTE -> MEASURE -> LEARN -> OBSERVE
```

## 2. Core Architectural Principle

### Agents perceive. Deterministic systems decide and execute.

Agents/LLMs are appropriate for:
- interpreting social content
- extracting topics
- classifying relevance
- identifying opportunities
- summarizing conversations
- generating content
- proposing replies
- proposing accounts to follow
- proposing engagement actions

Deterministic application code remains responsible for:
- permissions
- platform capability checks
- account routing
- identity safety
- rate limits
- cooldowns
- duplicate protection
- approval requirements
- global publishing kill switches
- account disablement
- credential handling
- queueing/retries
- idempotency
- persistence
- audit logging
- actual API execution

An agent must never bypass these controls because it believes an action is useful.

## 3. System Architecture

```text
SOCIAL PLATFORMS
 X / Instagram / Threads / ...
        |
        v
SOCIAL OBSERVATION
 posts / replies / comments / profiles
 relationships / mentions / trends / engagement
        |
        v
DISCOVERY + SIGNALS
 people / creators / conversations / topics
 competitors / trends / opportunities
        |
        v
STRATEGY
 What matters? What should Halyard do? Why now?
        |
        +------------------+
        v                  v
CONTENT SYSTEM       ENGAGEMENT SYSTEM
 posts / threads     replies / comments
 carousels / video   follows / relationships
 platform-native     platform-native
        |                  |
        +--------+---------+
                 v
POLICY / SAFETY
 routing / permissions / approvals / limits
 duplicates / kill switch / capabilities
                 |
                 v
EXECUTION
 queue -> worker -> platform adapter
                 |
                 v
ANALYTICS + LEARNING
 results / engagement / signal quality
 content performance / relationship outcomes
                 |
                 +-------> observation
```

## 4. Social Observation

Observation is the read side of Halyard. It normalizes whatever each platform actually exposes:

- posts
- reposts/shares
- replies
- comments
- mentions
- profiles
- follower/following relationships
- engagement
- topics/hashtags
- search results
- trends
- media metadata
- competitor activity
- relevant account activity

It must remain platform-aware. Halyard must never pretend that all platforms expose the same data.

## 5. Discovery

Discovery answers:

> **Who and what should Halyard know about?**

### Entity discovery
- creators
- influencers
- experts
- brands
- competitors
- complementary products
- communities
- publications
- relevant accounts
- potential collaborators

### Conversation discovery
- questions
- complaints
- product problems
- discussions
- requests
- misconceptions
- educational opportunities
- high-value conversations

### Topic discovery
- emerging topics
- recurring themes
- keywords
- hashtags
- audience interests
- changing sentiment
- conversation velocity

### Relationship discovery
- accounts already followed
- accounts following the brand
- frequent interactors
- high-value relationships
- emerging relationships
- potential collaborators
- accounts worth monitoring

## 6. Discovery Scoring

Discovery should produce structured, explainable signals rather than raw account lists.

Example:

```text
@CreatorA
Topic relevance:        94
Audience overlap:       91
Engagement quality:     87
Growth:                 82
Brand safety:           99
Existing relationship:  12
Discovery score:        89
```

Halyard should explain why an account was recommended.

## 7. Social Listening

Discovery finds entities. **Listening detects what is happening.**

Example:

```text
TREND SIGNAL
High-protein dessert recipes
Conversation growth: +184%
Engagement growth: +62%
RecipeFix relevance: 91/100
Platforms: X / Instagram / TikTok
Confidence: 0.88
```

Signals should retain:
- source
- timestamp
- platform
- topic/entity
- confidence
- relevance
- velocity/change
- supporting observations
- suggested actions
- expiration/cooldown

## 8. Trend Intelligence

Halyard should not chase every trending topic.

A useful trend is a function of:

```text
trend strength
x brand relevance
x audience relevance
x timing
x strategic fit
x confidence
```

Distinguish:
- global trends
- platform trends
- niche trends
- audience trends
- emerging trends
- declining trends
- recurring/seasonal trends

## 9. Strategy

Strategy turns signals into opportunities.

Potential opportunity types:
- content
- engagement
- relationship
- community participation
- product insight
- collaboration

Each recommendation should contain:
- what
- why
- urgency
- confidence
- expected value
- platform
- account
- proposed action

## 10. Content Intelligence

Content should originate from a strategic signal:

```text
Signal -> Opportunity -> Content angle -> Platform-native execution
```

Example: a high-protein dessert trend could become:
- X educational/conversational post
- Instagram carousel
- Threads discussion
- TikTok short-form concept

The signal is shared; execution is platform-specific.

## 11. Platform Specialists

Use a shared intelligence framework with platform-specific specialists:

```text
Social Intelligence
|-- X Specialist
|   |-- discovery
|   |-- search
|   |-- trends
|   |-- posts
|   |-- replies
|   |-- relationships
|   `-- publishing
|-- Instagram Specialist
|-- Threads Specialist
`-- additional platform specialists
```

Conceptual capabilities:

```text
discover()
observe()
search()
getProfile()
getPosts()
getReplies()
getComments()
getRelationships()
getTrends()

canSearch
canReadProfiles
canReadPosts
canReadReplies
canReadComments
canFollow
canLike
canReply
canComment
canPublish
canReadTrends
```

Each adapter declares its actual capabilities.

## 12. Engagement Intelligence

Engagement is not "reply to everything."

```text
Observation
 -> Relevance
 -> Relationship/value score
 -> Brand-safety check
 -> Action recommendation
 -> Policy gate
 -> Draft
 -> Approval/execution
 -> Result
 -> Learning
```

Possible actions:
- reply
- comment
- like
- follow
- monitor
- save as opportunity
- recommend for human attention

## 13. Intelligent Following

The agent may recommend:

> Follow @CreatorA.

The deterministic policy engine decides whether it is permitted.

Example controls:
- maximum daily follows
- minimum relevance
- minimum relationship score
- cooldown
- already-following check
- blocked-account check
- brand-safety requirement
- approval requirement

## 14. Observe -> Recommend -> Draft -> Approve -> Execute -> Learn

Every intelligent action should have a visible lifecycle:

**Observe:** I found this.  
**Recommend:** I think this is worth doing.  
**Draft:** Here's what Halyard proposes.  
**Approve:** A human/configured policy approved it.  
**Execute:** The deterministic execution layer performed it.  
**Learn:** Here's what happened.

This is central to Halyard's trust model.

## 15. Publishing Architecture

The existing path is:

```text
Submission
 -> Queue
 -> Publishing Worker
 -> openToken
 -> Platform Adapter
 -> Platform API
 -> Provider Result
 -> Publication Persistence
```

Existing safety properties include:
- global kill switch
- idempotency
- duplicate protection
- routing safety
- account identity checks
- result persistence
- traceability
- attribution
- normalized publishing errors
- reconciliation support

Agents must feed actions into this architecture rather than bypassing it.

## 16. First Real X Publication

The first live publication is an infrastructure validation milestone.

It must prove:

```text
Halyard submission
 -> normal queue
 -> normal worker
 -> real X adapter
 -> X API
 -> real X post ID
 -> Halyard publication row
 -> traceability to original submission
```

Use:
- Account: `@Recipe_Fix`
- Platform: X
- Content: text-only
- Quantity: exactly one post
- Execution: normal Halyard architecture
- Purpose: validate the live execution pipeline

Suggested text:

```text
HALYARD X INTEGRATION TEST — <timestamp>
```

No media. No other platform. No special bypass.

## 17. Token Lifecycle

X OAuth is now working. The original handshake failure was caused by a truncated X client ID.

The credential lifecycle now includes:
- encrypted access tokens
- encrypted refresh tokens
- PKCE
- identity confirmation
- pending connection state
- refresh handling
- worker-side refresh
- web-tier daily backstop
- failure -> account error/notification behavior

The worker requires X client credentials during refresh.

## 18. Current X State

- OAuth: working
- PKCE: working
- callback: working
- identity retrieval: working
- confirmation: working
- token storage: working
- token encryption: working
- token refresh: implemented
- self-test: working
- Accounts UI: updated
- real X publication: not yet performed

Current connected account:

```text
X @Recipe_Fix
Account status: Connected
Publishing: Ready
Connection: Working
Platform approval: Not required
```

## 19. Roadmap

### A — Foundation
- [x] X OAuth
- [x] PKCE
- [x] callback
- [x] identity confirmation
- [x] encrypted credential storage
- [x] token refresh
- [x] account UX
- [x] connection self-test

### B — Execution Proof
- [ ] first real X text post
- [ ] provider post ID verification
- [ ] publication persistence
- [ ] submission traceability
- [ ] duplicate protection
- [ ] failure normalization
- [ ] kill switch verification
- [ ] retry verification

### C — X Observation
- [ ] profiles
- [ ] posts
- [ ] replies
- [ ] mentions
- [ ] engagement
- [ ] relationships
- [ ] normalized social observations

### D — X Discovery
- [ ] creator discovery
- [ ] relevant account discovery
- [ ] competitor discovery
- [ ] conversation discovery
- [ ] topic discovery
- [ ] relationship discovery
- [ ] discovery scoring
- [ ] explainable recommendations

### E — Social Signals
- [ ] trend detection
- [ ] conversation velocity
- [ ] emerging topics
- [ ] audience signals
- [ ] competitor signals
- [ ] opportunity detection
- [ ] confidence
- [ ] signal expiration/cooldown

### F — Strategy
- [ ] content opportunities
- [ ] engagement opportunities
- [ ] relationship opportunities
- [ ] collaboration opportunities
- [ ] product insight opportunities
- [ ] strategic prioritization

### G — Intelligent Engagement
- [ ] reply recommendations
- [ ] comment recommendations
- [ ] follow recommendations
- [ ] relationship tracking
- [ ] engagement policy engine
- [ ] autonomous actions where explicitly allowed

### H — Dynamic Content
- [ ] trend-driven content
- [ ] platform-native adaptation
- [ ] content strategy integration
- [ ] multi-format generation
- [ ] content opportunity queue

### I — Learning
- [ ] signal -> action tracking
- [ ] content performance learning
- [ ] engagement outcome learning
- [ ] relationship outcome learning
- [ ] recommendation quality
- [ ] strategy optimization

### J — Platform Expansion
Only after X is proven:
- Instagram
- Threads
- Bluesky
- Pinterest
- TikTok
- YouTube
- additional supported platforms

## 20. Non-Negotiable Principles

1. Platform-aware, not falsely platform-agnostic.
2. Agents perceive/recommend; deterministic code controls execution.
3. Every action is attributable to a source signal/opportunity.
4. Every execution is traceable to an action/submission.
5. No account publishes outside its identity/routing boundaries.
6. No agent bypasses safety gates.
7. Automatic actions require explicit policy.
8. Platform capabilities are declared, not assumed.
9. Trends are filtered through brand relevance.
10. Content is platform-native rather than blindly cross-posted.
11. Discovery scores are explainable.
12. Learning connects signals to outcomes.
13. Observation, recommendation, draft, approval, execution, and learning remain distinct states.
14. Real-world actions use deterministic idempotency and auditability.
15. Prove one platform end-to-end before multiplying the architecture.

## 21. Immediate Next Step

**Publish exactly one real text-only X post from Halyard through the normal publishing architecture to `@Recipe_Fix`, then verify the provider result and Halyard persistence.**

After that, build:

> **X Social Observation + Discovery + Signals**

That subsystem is the foundation for Halyard's intelligent social-management capabilities.
