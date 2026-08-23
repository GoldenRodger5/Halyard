# Halyard — Product Positioning

**This is the canonical positioning document.** Where any other document,
README, deck, landing page or prompt disagrees with this file about what Halyard
*is*, this file wins. Where any document disagrees with it about what Halyard
*currently does*, the code wins and this file is wrong and must be corrected.

It exists because positioning is the thing most easily lost as a system evolves.
The architecture is legible from the code; the reason the architecture is shaped
this way is not.

---

## 0. How to read the claim levels

Every capability in this document carries one of four levels. They are not
degrees of confidence — they are statements about what evidence exists.

| Level | Meaning | Safe to say publicly |
|---|---|---|
| **Today** | Running, and exercised end to end against real providers or in production | Yes |
| **Established** | The data model and control flow exist; the capability is built but unexercised, or built in part | Only with the qualifier stated here |
| **Direction** | Decided and designed. Not built | As intent — never in the present tense |
| **Not yet** | Neither built nor safe to imply | **No** |

This is the same discipline the system applies to itself. Halyard's own evidence
vocabulary is `requested ≠ granted ≠ declared ≠ observed ≠ verified`, and its
scorer refuses to score a post it has not measured. A positioning document that
claimed more than the system does would be the one place in the project where
that rule was suspended.

**The single most important instance:** Halyard has published nothing. There are
zero publications, zero `post_metrics`, zero `performance_scores` and zero
`halyard_empirical` claims, and a test keeps that basis at zero. Every statement
in this document about measurement and learning must be read against that fact.

---

## 1. Core positioning

**Halyard is an autonomous product-marketing system for builders.**

It is not primarily a scheduler, an AI post generator, a content calendar or a
multi-platform publisher. It contains those things the way a compiler contains a
parser — they are components, not the identity.

The promise, stated conceptually:

> Connect your app. Halyard learns what you built, finds what people are talking
> about, works out where your product has a legitimate reason to contribute,
> creates the right content for each platform, distributes it, measures what
> happens, and keeps learning.

That sentence spans all four claim levels. Broken apart:

| Clause | Level | Note |
|---|---|---|
| learns what you built | **Today** | The Product Brain, from six optional evidence sources |
| finds what people are talking about | **Established, narrow** | Recurring questions from Reddit, RSS and Pinterest; no social-platform listening |
| where your product can credibly contribute | **Direction** | The opportunity engine is designed, not built |
| creates the right content for each platform | **Established** | Real per-platform constraints and format choice; strategy is still one idea dressed seven ways |
| distributes it | **Established** | Seven adapters and the full approval-to-publish path, exercised to the provider boundary — a genuine `POST /2/tweets` that returned 402. Never completed |
| measures what happens | **Established** | Collection is real and has never run against a real post |
| keeps learning | **Not yet** | See §12 |

**Do not compress that table into the promise sentence when the promise is used
as a present-tense claim.** The sentence is the product's direction. The table is
its current state.

---

## 2. The critical distinction: the product is the source of truth

Most social tools begin with a person describing their business — brand,
audience, tone, pillars, strategy. The description becomes the brief, the brief
becomes every prompt, and nothing downstream can distinguish a real capability
from a remembered sentence.

Halyard begins with the **product**.

```
website → code → product UI → product artifacts → MCP
        → evidence → product facts → Product Brain → social strategy
```

This is a foundational principle, and it is enforced structurally rather than
encouraged. `product_evidence` holds what was *observed*. `product_facts` holds
what is *believed*, and a database trigger requires every fact to cite the
evidence behind it. `deriveFactStatus` and `computeConfidence` decide status from
evidence alone; `verified` requires two independent sources. No model marks its
own output verified.

The operator brief still exists. It is now **one evidence source among six**
rather than the origin of everything — which is the whole distinction, expressed
as a schema.

**Level: Today.** Proven live, including on a product with nothing but a website.

---

## 3. Product understanding

Halyard understands a connected product from whatever that product exposes.
`discoverEvidenceSources` is one pure function over the product row and the
environment, and it drives both collection and what the operator is shown — so
the operator is told what actually ran rather than what was intended.

| Source | Level |
|---|---|
| Public website and product pages | **Today** |
| App Store / store listing | **Today** |
| MCP server (tool surface + live artifacts) | **Today**, optional |
| Repository / code | **Established** |
| Screenshots and captures of the product UI | **Today** |
| Operator brief | **Today** |
| Change over time (release detection, asset staleness) | **Today** |

Two properties matter more than the list:

**Sources report *configured*, never *reachable*.** The UI pairs "configured"
with what was last *observed*, because a configured source that has produced
nothing is exactly what a wrong URL looks like.

**MCP is optional and must stay optional.** MCP gives deeper understanding and
product-specific artifacts when it is there. It must never become a prerequisite
for social management, because most products do not have one. This was a real
defect, not a hypothetical: `createConnector` branched on
`product.id === 'recipefix'`, so any other product with a valid MCP config
silently got no connector. The fix (§146) split the layer permanently:

- **Generic product evidence and intelligence** — works for any product.
- **Product-specific artifact adapters** — resolved from `connector_config.adapter`.

All four MCP states are proven live: answering, unreachable, not configured, and
absent entirely. A website-only product collected, reasoned and built a Brain for
$0.0066.

**RecipeFix is the activation subject, not a dependency.** Any positioning,
prompt, schema or feature that reintroduces RecipeFix as an assumption in the
generic layer is a regression, not a shortcut.

---

## 4. The Product Brain

The Product Brain is Halyard's evolving representation of the connected product.
It progressively holds: what the product does, its features, which capabilities
are supported, the evidence behind each, how the product has changed, the
audience problems it addresses, which demonstrations are useful, and which
content opportunities follow.

Its governing property is that **facts are evidence-backed and
confidence-aware**. A capability does not become a fact because a model finds it
plausible. The Explorer will not store a claim that has nothing observable in it:
the schema demands the demonstration — the steps, and what must be true when they
finish. A model that cannot say how it would prove a feature has not found one.

**Level: Today.** Five product-intelligence agents propose; deterministic code
decides. Run in production: 11 evidence rows including 13 tools read from a live
MCP server, 36 facts, $0.29 of Anthropic spend, with no local machine involved.

**Direction:** the Brain feeding audience understanding and opportunity ranking
(§6). Today it feeds generation and the claims gate.

---

## 5. Discovery and opportunity intelligence

Halyard should not merely generate content on a schedule. It should discover
**opportunities**.

The distinction that matters is not "find trends". It is:

> What is happening in the world or the audience right now that **this
> particular product** has a legitimate reason to participate in?

Legitimacy is the load-bearing word. A trend the product cannot honestly speak to
is not an opportunity; it is a reason to post something forgettable.

### Web discovery

**Level: Established, narrow.** `watch_terms` runs a daily read-only pass over
Reddit, RSS and Pinterest looking for the questions people keep asking. Three
structural rules: discovery only — there is no code path that writes to any of
those platforms and a test asserts the absence; X is deliberately excluded on
cost (reads are ~$0.005, which is $30–75/month before anything is written); and
promotion to a signal is by **recurrence**, because one person asking something
is noise and the same question three times is a content idea.

An operator's own find is also evidence: `promoteFindToSignal` turns a pasted
link into a signal, gated on the operator's reason — a bare URL creates nothing.

**Not yet:** news monitoring, emerging-topic detection, industry-conversation
tracking, category-development tracking.

### Social discovery

**Level: Not yet.** This must not be implied. No adapter reads third-party
content on any social platform. Every read Halyard performs today is
`listComments` on its own publications. Trending conversations, creators,
formats, engagement patterns, recurring audience pain points and
conversations-worth-joining are all **Phase 3**, designed and unbuilt.

The sequencing is deliberate, not an oversight. Social discovery is
architecturally premature until first-party data exists — there is nothing
published for a research agent to study, and a relevance model tuned on zero
observations is a constant with extra steps.

---

## 6. The opportunity engine

The long-term flow:

```
PRODUCT UNDERSTANDING
  ↓
AUDIENCE UNDERSTANDING
  ↓
WEB + SOCIAL DISCOVERY
  ↓
CONTENT OPPORTUNITIES
  ↓
STRATEGY
  ↓
CREATIVE PLAN
  ↓
PLATFORM-NATIVE EXECUTION
  ↓
QC / CRITIQUE
  ↓
ITERATION
  ↓
APPROVAL
  ↓
PUBLISH
  ↓
PERFORMANCE
  ↓
LEARNING
  ↓
UPDATED STRATEGY
```

The output is not "five posts". For each opportunity the system should determine:

- whether it is worth pursuing at all
- **why this product has a legitimate connection to it**
- which platform or platforms make sense
- which format makes sense
- which creative treatment makes sense
- which product evidence should be shown
- what the appropriate call to action is
- how the idea should be adapted per platform

**What exists today:** the second half. `proposeIdeas` reads unconsumed signals
and writes proposals carrying `source_signals`; `scoreIdeas` ranks
deterministically over mix debt, novelty and cooldowns; `chooseFormat` reads each
adapter's declared capability; `planBeforeAfter` decides the creative plan;
`runAllGates` critiques; approval and publishing follow.

**What does not exist:** audience understanding as a modelled thing, ranked
opportunities with product-fit and risk, and the strategy layer that would choose
*between* opportunities rather than between ideas. Phases 3 and 4.

**One constraint on the whole engine:** no opportunity may enter an action queue
merely because a model recommended it. Ranking and policy stay outside the model.

---

## 7. Platform-native content

Platforms are distinct channels, not seven copies of one post.

**Halyard does not fully live up to this yet, and the gap is documented rather
than hidden.** At generation time the only things that differ per platform are
the format, the hashtag ceiling and a prompt variant. The *idea* — what to talk
about, which feature to show, what angle to take — is chosen once per product and
then dressed for each destination. `PLATFORM_COVERAGE.md` §1 calls this "one
brain in seven hats". It is a real strategy and may be the right one for a small
brand, but it was never deliberately chosen, and it is the current ceiling on
quality: a TikTok that would work is not a Pinterest pin with different
dimensions.

Platform-native strategy is therefore **Direction**, and the mechanical
per-platform layer beneath it is **Today**.

### What the adapters actually support

This table is the boundary of what may be claimed. It is derived from
`PlatformConstraints` in `packages/core/src/adapters/`, and any marketing claim
beyond it is false.

| Platform | Declared formats | Limits | Delivery |
|---|---|---|---|
| **X** | text, image, video | 280 chars; video ≤140s | direct post |
| **Instagram** | image, carousel, video, story | 2200 chars; video 5–90s; carousel 2–10, same aspect ratio | direct post |
| **TikTok** | video | 2200 chars; video 3–600s; links bio-only until eligible | **native draft** (creator finishes in TikTok) |
| **YouTube** | video | 5000 chars; video 3–60s | **private upload** + API scheduling |
| **Pinterest** | pin, image, video | 500 chars; video 4–900s | direct post |
| **Threads** | text, image, video, carousel | 500 chars; video ≤300s; carousel 2–20 | direct post |
| **Bluesky** | text, image | 300 chars | direct post |

Three corrections that positioning material keeps getting wrong:

- **There is no Facebook adapter.** Facebook appears in the codebase only as the
  Graph API host and OAuth dialog through which *Instagram* is reached. Facebook
  is **Not yet** — do not list it as a supported platform.
- **Bluesky is supported** and is routinely omitted from positioning material.
- **X threads are not supported.** X is text, image or video, single post. A
  thread capability would be a new adapter feature, not a copy decision.
- **YouTube is Shorts-shaped today** — the adapter caps video at 60 seconds.
  "Longer-form formats" is Direction.

**Delivery is not publication.** Halyard's draft is authoritative; a platform's
is a delivery outcome, and the three outcomes are distinguished because
conflating them was live and dangerous. `statusAfterDelivery` records
`published` only on a `direct` post, so a delivery capability added later fails
closed rather than stamping `published_at`, starting the repost clock and
collecting metrics against a private video. Do not describe private uploads as
drafts.

---

## 8. Creative intelligence

The distinction to hold onto:

> "AI generated a video"
>
> versus
>
> "Halyard chose the appropriate creative treatment for the underlying product
> evidence."

A creative plan decides: creative type, beats, emphasis, timing, which evidence
appears, platform, target duration, caption treatment, scene emphasis, and which
product media to show. The vocabulary of creative types includes before/after,
tutorial, comparison, demonstration, transformation, educational explanation,
product walkthrough, feature demonstration and founder commentary.

**Level: Today, for one type.** `planBeforeAfter` produces beats from the generic
`Highlight` contract, and those beats drive the single timing engine and the
composition. A creative type is a **map** from beat role to visual treatment, so
adding a second type is a mapping rather than an edit to the transformation
composition — the property that stops one file becoming the home of every
creative type. Emphasis is visible as type scale, not only duration.

**Level: Direction** for every other creative type, and for choosing between
types on evidence.

### Two rules about media that are not stylistic

**Real product media beats decorative filler.** A capture-backed beat plays an
actual recording of the product doing the thing. Where a process takes thirty
seconds and the useful information happens in five, Halyard cuts to the part
worth watching rather than making a viewer sit through it — from *measured* step
offsets, not from a model's guess about what was interesting. The first real
capture ran fifty seconds, of which 3.8 were kept. Cutting rather than speeding
up is deliberate: a speed ramp over a spinner is still a spinner.

**Nothing visual is invented.** Every frame in a footage band is a frame that was
recorded. A beat whose footage is missing renders **nothing** — not a
placeholder, not a mock interface, not a drawn approximation of a product state
nobody recorded. A synthetic progress overlay was explicitly rejected for the
same reason. This is the slop filter applied to pixels, and it is the rule that
must survive every future creative type.

---

## 9. QC and the iterative creative loop

Halyard runs an independent quality system before anything reaches an operator.

**Today — the gates.** Eight of them, in `runAllGates`: `copy` (deterministic
slop filter), `claims` (every claim verified against the artifact, carrying the
`sourcePath` that resolves into it), `destination`, `proof`, `audio` (word error
rate, pacing, loudness), `visual`, `retention` and `coherence`. Media critique
runs on a **different provider** (`gpt-5.5`) from the one that wrote the content,
deliberately, so the critic is independent rather than self-grading.

Two properties that are easy to lose:

- **A skipped gate is not a passed gate.** `runAllGates` once computed
  `passed: every(status !== 'failed')`, and `skipped` is not `failed`. Callers now
  declare `requires` so an unrun gate fails honestly.
- **An unmeasured thing is reported as unexamined, never as passed.** A gate that
  received no input says so.

The reviewer can already identify real problems — weak evidence, unsupported
claims, poor contrast, caption collision, dead time, weak retention structure,
audio faults, platform mismatch.

### The iteration loop — Today, within bounds

**Level: Today** as of §165, and the bounds matter as much as the capability.

**Four of five dispositions have run for real; one has not.** `accepted`,
`corrected`, `rejected_regression` and `escalated` are all proven against real
providers and persisted in `content_iterations`. The case that has *not* been
proven end to end is a correction that **clears its targeted defect and is
accepted on the following pass** — it is blocked on Anthropic credit, not on
anything in the design. Until that run succeeds, do not describe the loop as
fully proven. The deterministic correction paths (caption treatment, scene
timing, destination, re-measurement, re-synthesis) need no Anthropic and are
covered by tests.

A failing verdict is no longer terminal. `correct_content` turns each failed
gate into a structured defect, maps it through a **deterministic policy** to the
smallest correction that addresses it, applies exactly that, invalidates only
the gates that change can reach, re-enters the existing pipeline at the earliest
stage that must run again, and judges the result against the previous iteration
for regressions. It stops when every required gate passes, when the budget is
spent, or when the defect is one generation cannot fix.

What is deliberately *not* claimed:

- It corrects **one thing per iteration**, so a verdict stays interpretable.
- It is bounded at **three corrections or $2**, whichever binds first.
- It **cannot approve or publish**. A corrected item re-enters
  `pending_approval` exactly where it would have.
- It makes Halyard better at *the artifact in front of it*. It learns nothing
  across artifacts — that is §11, and still **Not yet**.
- The two model-backed corrections (copy, narration script) write; they never
  judge. No model can decide that a failed gate actually passed.

The loop, as built:

```
GENERATE → REVIEW → IDENTIFY SPECIFIC PROBLEMS → CREATE OPTIMIZATION PLAN
        → REGENERATE → REVIEW AGAIN → repeat until passing or budget exhausted
```

With, all built:

- a bounded retry budget — **three** corrections, and a spend ceiling
- a clear, enforced maximum
- prior findings preserved across cycles, so cycle three knows what cycle one
  found and does not reintroduce it
- an append-only record of what actually changed, enforced by a trigger
- escalation when quality cannot be reached, or when a provider will not answer
- **no infinite regeneration loops** — a correction tried twice without clearing
  its target is treated as ineffective
- the reviewer remaining independent of the generator

The failure mode this design exists to prevent is blind regeneration: rolling the
dice again is not fixing the identified problem, and it burns money while looking
like progress.

### The governing rule

> **Agents perceive; deterministic code enforces.**

Models are used where perception or writing genuinely requires one. Every
judgement that can be made deterministically is made in code: permissions,
capability checks, routing, identity safety, rate limits, cooldowns, duplicate
protection, approval requirements, kill switches, credential handling,
idempotency, persistence and audit logging. An agent never bypasses these because
it believes an action is useful, and **a model can never mark its own output
verified**. The Halyard Auditor parses the TypeScript AST to check that agents
do what the registry says they do.

---

## 10. Approval and publishing boundaries

Stated separately because it is positioning, not just safety.

**Halyard is autonomous up to the point of publication, and never past it.** A
human approves everything. There is no `reply()` method anywhere on the adapter
interface, no outreach, no autonomous engagement. Bounded autonomy is a feature
of the product, not a limitation of the build.

This boundary has been attacked deliberately and repaired: editing an approved
item once left `status` untouched so the queued job published text nobody
approved; a `pending_auth` account published if it happened to hold a token; ten
server actions including `approveItem` and `publishNow` had no `requireOperator()`
because the dashboard layout guards rendering and never runs for an action
invocation. All fixed, all tamper-verified, with an adversarial suite that now
attacks the boundary as a whole.

---

## 11. The learning loop

```
content → publication → performance metrics → performance scoring
       → empirical observations → strategy adjustment → future content
```

Performance should eventually influence hooks, formats, topics, platform
selection, content mix, timing, creative treatment, audience assumptions and
which opportunities are worth pursuing.

**Level today: Not yet — and this is the claim most likely to be exaggerated.**

Audited against the code rather than the roadmap, in `PLATFORM_COVERAGE.md` §12,
the answer to "does Halyard learn?" is **no**. There is exactly one wire where an
observed outcome could change a future generation decision — hook selection via
`loadHookHistory` — and it was broken from the day it was written: it selected
two columns that have never existed, and a `.catch()` turned the failure into an
empty array which a comment explained away as "nothing has published yet". The
test asserted the empty array and passed.

What exists is the **substrate**, which is the honest claim:

- append-only observations, and beliefs that cite them
- a scorer that refuses to score a post it has not measured — it previously read
  an uncollected post as a *measured zero*, and because percentiles are computed
  over the cohort, each fabricated zero moved the score of every genuinely
  measured post beside it
- scoped attribution, with the percentile-over-nothing bug fixed to null
- `historicalConversion` wired through, carrying no data and applying neutrally

**Never fabricate learning data.** `null` means unmeasured; `0` means measured
zero. A publication existing is not evidence that it performed; a collection job
running is not evidence that metrics were collected. Before real publications
exist, metrics and empirical claims stay empty, and a test keeps them there.

---

## 12. The strategic moat

The intended differentiation is the **combination**, and the fact that each part
makes the others better:

1. Product understanding
2. Evidence-backed product intelligence
3. Web discovery
4. Social discovery
5. Opportunity identification
6. Platform-native strategy
7. Creative intelligence
8. Product-aware media generation
9. Independent quality control
10. Bounded iterative optimization
11. Automated distribution
12. Performance measurement
13. Empirical learning

A scheduler can schedule. A generator can generate. A trend tool can find trends.
Halyard's intent is to connect those capabilities **around an actual product**.

The reinforcement is the argument. Product understanding makes discovery
relevant; discovery makes strategy timely; strategy makes creative decisions
defensible; product evidence makes creative claims verifiable; independent QC
makes autonomy safe; measurement makes learning possible; learning improves
product understanding. A competitor can ship any one of these. The claim is about
the loop, not the parts.

**This is an argument about architecture, not a proven market position.** Of the
thirteen, four are Today, five are Established, and four are Direction or Not
yet. Say "designed to" and "intended", not "does", until the ledger changes.

---

## 13. Positioning language

### Preferred

> **Halyard is an autonomous product-marketing system for builders.**

> **Connect your app. Halyard learns what you built, finds what people are
> talking about, figures out where your product can credibly contribute, creates
> the right content for each platform, and keeps learning from what happens.**

Alternative:

> **Your app is the source. Halyard turns what you built into an evolving social
> presence.**

### Avoid as the primary frame

- a scheduler
- an AI copywriter
- a social media calendar
- a generic AI content generator
- a chatbot that writes posts
- a simple multi-platform publisher

Each of those describes a component. None describes the product.

### Never say

- "the only product that does this"
- "no competitor does this"
- "the only autonomous social manager"
- "the first AI social manager"

Not because they are necessarily false, but because **no competitive research
exists in this repository to support them**. An unverifiable absolute is the
fastest way to make every verifiable claim look like marketing too. If such a
claim is ever wanted, it needs current, dated, independent research attached —
the same standard `product_facts` applies to the product itself.

---

## 14. Competitive positioning

The market is crowded and getting more so. AI social products already offer post
generation, scheduling, trend discovery, content repurposing, analytics, approval
workflows, brand learning and autonomous posting.

**Halyard therefore cannot claim differentiation on the basis of having those
features.** Having them is table stakes. The defensible position is the
product-centric architecture and the integrated loop: the product itself as the
primary source of truth, evidence-backed facts rather than a remembered brief,
creative decisions traceable to product evidence, and independent quality control
with bounded autonomy.

That position is defensible **when it is demonstrated**. Until then it is a
design thesis. Win on demonstrated capability — a real render traceable to a real
artifact is worth more than any adjective.

---

## 15. Target customer

**Primary ICP:** a person or small team that has already built a product and does
not have the time, expertise or staffing to run a serious multi-platform
marketing presence.

Especially:

- indie hackers
- vibe coders and AI-assisted developers
- solo SaaS founders
- app builders (web, mobile, SaaS)
- small startup teams with no marketing hire

Their pain is not "I need help writing posts". It is:

> "I built the thing. Now I need someone to understand it, work out what to say,
> make the content, distribute it everywhere, watch what happens, and keep
> improving it."

That framing — *someone*, not *something* — is the core of future marketing. The
customer is not shopping for a tool to operate. They are trying to stop being the
person who operates it.

### One honest gap in the ICP story

**Halyard is currently a single-operator system running one product.** "Connect
your app" describes the intended shape of the product and the direction the
architecture was built for — product-agnostic evidence collection, generic MCP,
adapters resolved from configuration. It does not describe a multi-tenant
self-serve onboarding flow, which does not exist. Do not imply that a stranger
can sign up and connect their app today.

---

## 16. Product philosophy

The principles, in the order they tend to be violated:

- **Connect the product; don't explain everything manually.** The brief is one
  evidence source, not the origin of truth.
- **Product evidence beats model imagination.** A fact cites its evidence or it
  is not a fact.
- **MCP enhances product intelligence but is never universally required.**
- **Platform-native beats copy-paste.** Currently an aspiration; say so.
- **Real product media beats fabricated filler.** A missing capture renders
  nothing rather than something invented.
- **Agents perceive; deterministic code enforces.**
- **Independent review beats self-grading.** A different provider, and never the
  generator marking its own work.
- **Real performance beats assumed performance.** `null` is unmeasured; `0` is
  measured zero.
- **Failed quality should trigger diagnosis and improvement, not blind
  regeneration.**
- **Bounded autonomy beats uncontrolled autonomy.**
- **Approval and publishing boundaries stay explicit.** Autonomous up to
  publication, never past it.
- **The system evolves as the connected product evolves.** Release detection,
  asset staleness and re-capture exist because a product that ships makes last
  month's evidence a claim about something that no longer exists.

---

## 17. The honesty ledger

Consolidated, because these are the specific things most likely to be overclaimed
in a deck, a landing page or a demo script.

| Claim | Reality |
|---|---|
| "Halyard learns from performance" | **No.** Zero publications, zero metrics, zero scores. The substrate exists; the loop has never run |
| "Halyard monitors social conversations" | **No.** No adapter reads third-party content on any social platform. Reddit/RSS/Pinterest term-watching only |
| "Halyard finds trends" | Narrow: recurring questions by count, from three non-social sources |
| "Halyard iterates until the content is good" | **Bounded.** It corrects up to three times against specific diagnosed defects, then stops and escalates. Not "until good" — until the gates pass or the budget is spent |
| "Halyard posts to Facebook" | **No adapter exists** |
| "Halyard writes X threads" | **No.** Single posts only |
| "Halyard makes long-form YouTube video" | **No.** The adapter caps at 60 seconds |
| "Halyard has published for RecipeFix" | **No.** Blocked externally on X API credits; the approval boundary is holding, not failing |
| "Connect your app in minutes" | Single-operator today; no self-serve multi-tenant onboarding |
| "Platform-native content" | Mechanically real (format, limits, transport); strategically one idea dressed seven ways |
| "Autonomous" | Up to publication. A human approves everything, by design |

None of these gaps is embarrassing. Each is a deliberate sequencing decision with
its reasoning recorded in `DECISIONS.md`. Presenting them accurately is the
position: a system this careful about its own evidence is the product being
demonstrated.

---

## 18. Maintaining this document

- Update it when a capability **changes level**, not when work merely progresses.
- The ledger in §17 is the highest-value section. Keep it adversarial: it should
  read like a competitor wrote it.
- Related documents, and what each owns:
  `docs/STATUS.md` — where the build is right now.
  `docs/DECISIONS.md` — why each choice was made, and what was rejected.
  `docs/PLATFORM_COVERAGE.md` — per-platform capability, delivery matrix, and the
  audits behind §7, §11 and §12 here.
  `docs/HALYARD_IMPLEMENTATION_PLAN.md` — the P0–P10 phase roadmap that the
  Direction items in this file map onto.
  `docs/Halyard_Social_Intelligence_Architecture.md` — the discovery and
  engagement architecture behind §5 and §6.
