# What Halyard is, what it is not, and where it goes

Written 14 August 2026, after the first production deploy. No code was changed
to produce this document. It is a gap analysis and an architecture argument, and
it is deliberately unkind to the current build in the places where being kind
would cost time later.

---

## 1. The question, stated honestly

> Is this an intelligent AI system that manages a user's social media for any app
> they created?

**No. It is a very good content pipeline for one product, operated by one person
who has already told it what the product is.**

That is not a small thing — 59,000 lines, 788 tests, six QC gates, seven
platform adapters, a verified publishing path and a deployed production system.
But the distance between what exists and the sentence above is mostly *one
capability*, and it is the first one below.

The rest of this document is that distance, measured.

---

## 2. What actually exists

| Subsystem | State | Honest note |
|---|---|---|
| Platform adapters | 7 platforms, contract-tested, one verified live | The strongest part of the build |
| Publishing safety | Idempotency, kill switch, routing constraints, no-reply-surface | Genuinely production grade |
| QC gates | 6: copy, claims, visual, audio, destination, proof | Strong on *text*, weak on *media* — see §4 |
| Copywriting | Voice-calibrated, retry-on-QC, slop filter with a known-bad corpus | Good |
| Idea engine | Mix debt, novelty, cold-start weights | Good, but starved of inputs |
| Image rendering | Satori/resvg, deterministic templates | Deterministic, not generative |
| Video | Remotion compositions from structured data | **Templated, not generated** |
| Voiceover | ElevenLabs, with a lexicon and disclosure enforcement | Good |
| Music | **None** | Absent entirely |
| Product understanding | 3 hand-written capture flows, a GitHub PR reader, one bespoke MCP connector | **The gap** |
| Self-critique of media | **None** | Nothing watches, reads back, or listens |
| Trend awareness | RSS for founder takes only | No platform trend data at all |
| Timing | Fixed slot windows, honest about being defaults | Needs 30 posts/platform to learn |
| Learning loop | Scoring, rejection clusters, hook rotation | Built, unexercised — no real data yet |

### The shape of the problem

Halyard is a **pipeline with excellent brakes**. Almost every system in it is
about *refusing to do the wrong thing*: gates that fail closed, transports that
refuse unverified platforms, capabilities that start unknown, a queue that will
not publish without a human. That instinct is correct and it is why this is
deployable.

What it lacks is **eyes and taste**. It cannot look at the product it markets, and
it cannot look at what it made.

---

## 3. The six capabilities the vision requires

### A. Understand the product — *the gap that matters most*

**Vision:** point it at an app, give it credentials, and it crawls, logs in,
explores, reads the code, and builds a real model of what the thing does and who
it is for.

**Today:** three capture flows with hand-authored selectors
(`adapt_and_reveal`, `cook_mode_timer`, `swap_toggle`), a GitHub connector that
summarises merged PRs, and an MCP connector written specifically for RecipeFix.
Every one of those was authored by a human who already understood the product.

**What "point it at any app" actually requires:**

1. **Authenticated exploration.** Playwright already ships in the worker image.
   Give it a URL and credentials, and let it map the application: routes,
   navigation, forms, empty states, the shape of the primary object.
2. **Feature inventory as a first-class artifact.** Not a list of URLs — a list
   of *capabilities*, each with a name, a route to reach it, the steps to
   demonstrate it, and a screenshot proving it exists. This becomes the source
   of truth that `products.brief_markdown` is today.
3. **Code reading, where a repo is available.** Not to summarise the codebase,
   but to answer specific questions the crawl cannot: what does this product
   *charge for*, what is behind a paywall, what is half-built, what shipped last
   week. The GitHub connector reads PRs already; reading routes, feature flags
   and pricing config is the same seam.
4. **A model that reconciles the three.** The marketing site claims X, the app
   does Y, the code says Z is behind a flag. Where they disagree, the app wins,
   and the disagreement is itself worth surfacing.

**The honest hard part:** *self-directed exploration is not the same as a
scripted flow.* A scripted flow is verifiable — Halyard already checks that its
three flows still resolve and refuses to record black frames. An exploring agent
produces a claim about the product, and a wrong claim propagates into every post
for weeks. **The verification story has to be designed before the crawler is.**

The existing `verify-flows` discipline is the right template: an explored
feature is `unknown` until a scripted replay confirms it, and unknown features
never reach the copywriter.

### B. Decide what to make

**Today:** the idea engine scores candidates on mix debt, novelty, seasonality,
product signal and format availability, with cold-start weights that shift to
measured ones at 20 posts per category. This is good machinery.

**The gap is input, not algorithm.** It scores ideas that a human seeded or that
a connector produced. A social media professional decides what to post from:
what the product just shipped, what the audience asked about last week, what is
currently working on each platform, what competitors are doing, and what is
seasonally relevant. Halyard has the first, a weak version of the second, and
none of the rest.

### C. Make it

**Today:** deterministic. Satori renders images from templates; Remotion renders
video from structured composition data; ElevenLabs speaks a script.

**This is a defensible choice, not a limitation to remove thoughtlessly.**
Templated video is on-brand every time, costs nothing per render, and cannot
hallucinate a product screen that does not exist. Generated video is the
opposite on all three counts.

**Where generation earns its place:**

- **B-roll and atmosphere** — the three seconds of hands-on-dough between two
  product screens. No factual content, high production value.
- **Motion the templates cannot do** — a transition, a reveal.
- **Music.** Absent entirely, and the cheapest large upgrade in the list. A
  silent video reads as amateur on TikTok and Reels.

**The 2026 landscape, researched rather than recalled:**

| | |
|---|---|
| Video | Kling 3.0 ~$0.09–0.14/sec; Veo 3.1 from $0.15/sec and the only one with **native audio**; Sora 2 $0.75/sec. Runway is enterprise-waitlisted |
| **Migration risk** | OpenAI's Videos API and `sora-2` are scheduled for **removal on 24 September 2026**. Anything built on Sora 2 needs a migration plan before it is built |
| Music | **ElevenLabs Music is the only clean commercial answer.** Suno and Udio have better output and unsettled licensing — a Munich court ruled against Suno on 31 July 2026, and Udio settled with the majors and became a walled garden whose output cannot leave the platform |

Halyard already holds an ElevenLabs key. Music is a small, safe, high-impact
addition. Generated video is a larger bet with a live deprecation clock on the
most-hyped option.

### D. Judge it — *the second real gap*

**Vision:** it watches the video back, listens to the voiceover, reads the post,
and decides whether the whole thing is cohesive and good.

**Today, the visual gate checks contrast ratios, safe areas and aspect ratios.
The audio gate checks loudness and that a probe succeeded.** Both are *signal*
checks. Neither has ever looked at a frame or listened to a second of audio in
the sense a person means.

Every one of those gates would pass a video that is technically perfect and
completely incoherent: voiceover describing a feature the footage does not show,
a caption contradicting the on-screen text, a hook that promises something the
payoff never delivers.

**What is missing is a semantic review pass**, and it is now genuinely buildable:

- Sample frames from the rendered video and ask a vision model whether the
  frames show what the script claims.
- Transcribe the rendered voiceover and diff it against the intended script —
  catching mispronunciations the lexicon missed.
- Check the caption, the on-screen text and the spoken line for contradiction.
- Judge pacing against the retention model already in the codebase.

**This is the single highest-value addition to quality**, because it closes the
loop between "we made something" and "it is good", which is currently closed
only by the operator's eyes in the approval queue.

There is precedent in the codebase for how to do it honestly: a gate that
examined nothing must not report a pass. A semantic gate that could not sample
frames reports `skipped`, never `passed`.

### E. Distribute it well

**Today:** fixed slot windows labelled as defaults, hashtag *count* limits per
platform, per-platform copy briefs, link strategy per platform.

**Missing:** any awareness of what is currently working. No trending sounds, no
hashtag velocity, no format-of-the-moment.

**Researched constraint, and it is a hard one:** TikTok's Research API is
restricted to non-profit academic researchers in the US and Europe. **No
commercial trend API exists from TikTok itself.** The 2026 expansion added
hashtag analytics with velocity and associated sound trends, but through gated
commercial surfaces. Instagram requires App Review *and* Business Verification
for production access.

So "know what is trending" means one of: a paid third-party data provider, an
accepted blind spot, or the operator supplying taste manually — which is what
the swipe file already is.

**The honest read: this is a buy decision, not a build decision**, and it should
be deferred until there is enough posting history to know whether it is the
binding constraint. It probably is not. The binding constraint at zero followers
is *making things worth watching*, not timing them.

### F. Learn

**Today:** scoring, rejection clusters, hook rotation with a 30-day cooldown,
best-time computation that refuses below 30 posts. All built. **None of it has
ever run on real data**, because nothing has published yet.

This is the part that cannot be accelerated by building more. It needs posts.

---

## 4. Devil's advocate

Arguments against the plan above, made as strongly as I can make them.

**"The product-understanding crawler will confidently describe a product it does
not understand."** This is the most likely failure and the most damaging, because
its output feeds everything downstream. A wrong feature claim becomes forty
posts. The mitigation — scripted verification of every discovered claim — is
most of the work, and it is unglamorous.

**"Semantic media review is a model grading its own homework."** The same family
of model that wrote the script judges whether the video matches it. Correlated
blind spots are real. Mitigation: the judge should be given the *artifact only*,
never the intent, and asked to describe what it sees. Compare descriptions to
intent in code, not in the model. That is a materially different and harder
design than "ask if it is good".

**"Generated video will look like generated video."** In 2026 audiences are
getting good at spotting it, and RecipeFix's entire positioning is honesty about
what a product does. AI b-roll of food that was never cooked is a brand risk that
does not show up in any metric until it does.

**"Every capability here increases the surface that can silently produce
nonsense."** This build has repeatedly found bugs whose symptom was a green
result. More autonomy means more of that class. The rate of silent-failure
discovery in this codebase — roughly one per subsystem — should be assumed to
continue.

**"Nobody is asking for this."** Zero followers, zero published posts. Every hour
spent on trend APIs is an hour not spent on the twenty posts that would generate
the first real data. **The most valuable next action is almost certainly to
publish, not to build.**

---

## 5. The agentic architecture

The user's instinct — teams of agents, supervisors, utility agents — is the right
*shape* for the judgment-heavy parts and the wrong shape for the pipeline.

### What the research says, and it is sobering

- **40% of multi-agent pilots fail within six months of production.** The failure
  is usually the wrong pattern for the problem, not the idea.
- **The number one failure mode is infinite handoff loops** — A delegates to B,
  B to C, C back to A, each replanning because nobody owns the task.
- **Context inconsistency, not pattern choice, is the primary cause of failure.**
  Pass full context and it is expensive; summarise and it is lossy.
- **The supervisor becomes a bottleneck and a single point of failure.** When its
  understanding drifts, every worker inherits the drift.
- **Budget roughly 15× the tokens** of a chat interaction for research-style
  orchestration.
- The validated rules: dedicated system prompts per agent, role-scoped context,
  and a **structured brief** as the first message — free-form delegation is a
  documented failure mode.

### The argument this codebase already makes

**Halyard has an orchestrator, and it is better than a supervisor agent for the
work it does.** The job queue with `FOR UPDATE SKIP LOCKED`, dedupe keys,
bounded retries, per-kind timeouts and a dead-letter state is deterministic,
debuggable, and survives a crash. It does not drift. It does not loop. It cannot
lose context, because context is a row.

Replacing that with agent handoffs would trade a system that has been debugged
against production for one whose dominant failure mode is the thing the research
names first.

### The right split

> **Deterministic where the steps are known. Agentic where judgment is needed.
> The queue stays the spine; agents are called *inside* handlers.**

Concretely:

| Layer | Pattern | Why |
|---|---|---|
| Pipeline (fetch → generate → render → QC → schedule → publish → measure) | **Job queue, unchanged** | Steps are known, ordering matters, failure must be recoverable |
| Product exploration | **Supervisor + workers, bounded** | Genuinely open-ended; needs a plan that adapts |
| Media review | **Parallel independent judges, no handoffs** | Each judge sees the artifact only; no loops possible because there is no delegation |
| Strategy / what to post | **Single agent with tools** | One decision, needs context, does not need a team |
| Utility work (transcribe, sample frames, resize) | **Plain functions** | Not judgment. An agent here is cost with no benefit |

**Where a supervisor is justified: exploration.** "Understand this app" is the
one task whose steps cannot be enumerated in advance. It needs a planner that
decides what to try next based on what it found. Bound it hard — a maximum
number of steps, a maximum wall-clock, and a *structured brief* out, never free
prose.

**Where a supervisor is not justified: everything else.** Generating a post is a
known sequence. Wrapping it in delegation buys nothing and costs 15× tokens and
a new failure mode.

### The team, if built

```
Explorer (supervisor)          bounded: N steps, one product, structured output
├── Crawler          utility   Playwright: routes, forms, screenshots
├── Authenticator    utility   log in with supplied credentials, nothing else
├── Code reader      worker    answers specific questions against a repo
└── Reconciler       worker    site vs app vs code, reports disagreements

Critic panel (no supervisor — parallel, independent, artifact-only)
├── Frame judge      describes sampled frames, never told the intent
├── Audio judge      transcribes and describes tone and pace
├── Coherence judge  given all descriptions + intent, finds contradictions
└── Brand judge      voice rules only

Strategist (single agent, tools)
└── reads: shipped features, past performance, mix debt, swipe file
```

**Every one of those returns a structured object, not prose.** The codebase
already has the pattern — QC gates return typed results with a status that
distinguishes `skipped` from `passed`.

### Cost, stated plainly

At ~60 posts/month, generation currently costs about $0.02 per post — roughly
**$1.30/month**. A four-judge critic panel per post plus an exploration run per
product would plausibly take that to **$15–40/month**. That is not a reason not
to do it. It is a reason to instrument it before doing it, and Halyard already
records cost per generation.

---

## 6. What I would build, in order

Ordered by *value per unit of risk*, not by excitement.

**1. Publish the first two weeks.** The launch batch is built and the system is
deployed. Everything in §3F is blocked on real data, and the fastest path to it
is the button that already exists.

**2. Music.** ElevenLabs key already present, licensing already clean, and a
silent short-form video is the most obvious quality deficit in the current
output. Small, safe, immediately visible.

**3. The semantic media critic.** Highest quality-per-line in the list, closes
the loop between "made" and "good", and reuses the gate architecture exactly.
Build it artifact-only, as argued above.

**4. Product exploration, verification first.** Design the "how do we know this
claim is true" story, *then* the crawler. Ship it against RecipeFix, whose
answers are already known — the only honest way to test a system whose output is
a claim about a product.

**5. Generated b-roll**, once there is a critic capable of rejecting it.

**6. Trend data.** Last, and probably bought rather than built, and only once
there is evidence that timing rather than quality is the constraint.

---

## 7. What is genuinely still missing, as a list

Short version, for tracking.

- [ ] Nothing has ever published. Every learning system is unexercised.
- [ ] No music.
- [ ] No semantic review of any generated media.
- [ ] Product understanding is hand-authored per product; not repeatable for a
      second app.
- [ ] No trend or competitor awareness.
- [ ] Onboarding requires four manual steps; three genuinely need taste, one
      (ingest) is now automatable and still manual.
- [ ] Instagram, Threads, YouTube, Pinterest, TikTok all `pending_auth` in
      production. Nothing is connected.
- [ ] Facebook connected in Blotato and unreachable from Halyard.
- [ ] `ANTHROPIC_API_KEY` absent; running on the OpenAI fallback.
- [ ] Alt text is dropped by the unified transport on X and Threads; Threads is
      direct because of it.
- [ ] Publishing kill switch is on.

---

## 8. The one-paragraph answer

Halyard is a production-grade content pipeline with unusually good safety
properties and an unusually honest relationship with its own uncertainty. It is
not yet an intelligent social media manager, because it cannot see the product it
markets or judge the work it produces. Those are two buildable capabilities, in
that order of difficulty and reverse order of risk. Everything else on the wish
list — trends, generated video, agent teams — is either a buy decision, a brand
risk, or an optimisation of a loop that has not yet run once.

**The highest-value thing this system could do tomorrow is publish a post.**
