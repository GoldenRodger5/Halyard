# Agents, or not: the argument, and the plan

Written 14 August 2026. Companion to `STRATEGY.md`, which asked *what is
missing*. This asks *what architecture actually produces better work*, argues
both sides properly, and then commits.

Research-backed throughout. Where I changed my own mind from `STRATEGY.md`, I
say so and say why.

---

## Part 1 — The two camps, steelmanned

The industry has a genuine, public disagreement about this, and both sides
published within 24 hours of each other. Neither is stupid.

### The case FOR multi-agent (Anthropic, June 2025)

A lead agent with parallel subagents **outperformed a single agent by 90.2%** on
internal research evaluations. The mechanism is specific and worth stating
precisely: subagents each get **their own context window**, so the system can
spread reasoning across far more total context than one agent can hold. The
improvement correlated strongly with token spend.

The tasks were **research**: find things, read them, come back with what you
found. Breadth-first, read-only, independently parallelisable.

### The case AGAINST multi-agent (Cognition, June 2025)

Cognition build a coding agent, and argue for single agents only. Their objection
is **context fragmentation**: when agents work in parallel they do not share an
understanding of the task, cannot see each other's work, and details are lost in
a telephone game as information passes between them. Two agents making dependent
decisions in isolation produce **conflicting decisions** that no amount of
merging repairs.

They coined *context engineering* for the hard part: reliably conveying to a
model what it is actually being asked to do.

### The failure data, from production

- **~40% of multi-agent pilots fail within six months.**
- **Infinite handoff loops are the number one failure mode** — A→B→C→A, each
  replanning because nobody owns the task.
- **Context inconsistency, not pattern choice, is the primary cause of failure.**
- **The supervisor becomes a bottleneck and single point of failure**; when its
  understanding drifts, every worker inherits the drift.
- **~15× the tokens** of a chat interaction.

---

## Part 2 — Why they disagree, and what that tells us

They are not describing the same work.

| | Anthropic's task | Cognition's task |
|---|---|---|
| Shape | Research | Coding |
| Direction | Read-only | Write-heavy |
| Decomposition | Breadth-first, independent | Sequential, dependent |
| Do subtasks conflict? | No — two facts coexist | Yes — two edits collide |
| Is more context better? | **Yes, directly** | Only if *consistent* |

**The rule this yields:**

> Parallelise **perception**. Never parallelise **decisions that depend on each
> other**.

Halyard contains both kinds of work, which is why "should we go agentic" has no
single answer. It has an answer per subsystem:

| Halyard subsystem | Shape | Verdict |
|---|---|---|
| Explore an unknown product | Read-only, breadth-first, independent | **Multi-agent. Anthropic's exact case.** |
| Watch/listen to a rendered artifact | Read-only, independent per modality | **Multi-agent, no handoffs.** |
| Write a post | Sequential, dependent, one artifact | **Single agent.** Cognition's exact case. |
| Decide the fortnight's schedule | Constraint satisfaction | **Neither. It is code, and already is.** |
| Publish | Ordered, must be recoverable | **Neither. Job queue.** |

---

## Part 3 — Where I was wrong in `STRATEGY.md`

I called the semantic media critic "the single highest-value addition to
quality". The research complicates that badly, and I should say so.

### The evidence against naive self-critique

- **Self-preference bias is large and measured.** In pairwise evaluation,
  frontier models assign **75–84% win rates to their own model family**. A judge
  that wrote the thing is not a judge.
- **Self-reflection gains are contested.** Later work found the observed
  improvements "should not be attributed to self-reflection but rather to various
  exogenous factors", with three methodological problems in the earlier results.
- **Models cannot reliably identify their own errors without a ground-truth
  oracle.**
- **Diminishing returns, and outright deterioration on easy prompts and
  high-performing base models.**

So "generate a video, then ask the model whether the video is good" is a system
that will report improvement and may deliver none. If I had built what I wrote
last time without checking, I would have shipped a confident placebo — which is
precisely the failure this codebase keeps finding.

### The design that survives the evidence

The literature's failure mode is **evaluation**: asking a model to score quality,
especially its own. The design I actually want is **perception**: asking a model
to *describe what it observes*, and then comparing that description to the
intent **in code**.

```
BAD   render → "is this good?"          → score        (self-preference bias)
GOOD  render → "describe what you see"  → description
      intent (already known, in the DB) → expectation
      compare(description, expectation) → deterministic finding
```

This sidesteps both problems at once:

1. **No self-preference**, because the judge is never comparing candidates or
   scoring its own work. It is captioning an image.
2. **The oracle exists.** We are not asking a model to find unknown errors. We
   know what the script said, which feature it claims, and which template was
   used. The intent *is* the ground truth, and it is sitting in
   `content_items`.

**Perception is a task models are reliably good at. Judgement is the task they
are biased at.** Halyard should buy the first and never the second.

This changes the design and keeps the value. The critic stays high on the list —
built this way.

---

## Part 4 — What "quality" means here, grounded in the domain

Before choosing an architecture for quality, define quality. Researched, not
assumed:

- **71% of viewers decide in the first few seconds**; **63% of the highest
  click-through videos hook within three seconds.**
- The hook must be **multimodal**: a visual pattern interrupt (hard cut,
  whip-pan, snap-zoom), a benefit-driven **text overlay**, and a **spoken
  keyword-rich opening** — all three.
- **Silent-first design wins**: kinetic typography, burned-in captions,
  expressive framing, because most first views are muted.
- Retention benchmarks: **~70% past 3 seconds**, ~60% at 15s, ~50% at 30s.

**This is the crucial move for the whole plan.** Every one of those is
*observable in the artifact* and does not require taste:

| Quality driver | Observable check |
|---|---|
| Pattern interrupt in second 1 | Do frames 0.0s and 0.8s differ substantially? |
| Text overlay present | Is there burned-in text in the first 90 frames? |
| Silent comprehension | Does the frame description alone convey the hook? |
| Spoken opening carries the keyword | Does the transcript's first sentence contain the idea's key term? |
| Claim/footage agreement | Does the frame description mention what the script claims? |
| Pacing | Cut frequency against the retention model already in the codebase |

None of those asks "is this good". All are perception plus a deterministic
comparison. **This is what makes the critic production-grade rather than
decorative.**

---

## Part 5 — The thesis

> **Agents perceive. Code decides.**

Everywhere Halyard needs to *find out* something about the world — what this app
does, what this video looks like, what this audio sounds like — use models,
in parallel, with independent context, and have them return **descriptions**.

Everywhere Halyard needs to *choose* — which idea, which board, which slot,
whether to publish, whether a gate passed — use code, with the descriptions as
inputs.

This is not a compromise between the two camps. It is the rule that explains why
both camps are right about their own domain, applied deliberately.

It also happens to preserve everything that makes the current build trustworthy:
the deterministic spine, the gates that fail closed, the states that distinguish
`skipped` from `passed`.

### Why this yields better quality than a fully agentic build

1. **The binding constraint on quality is grounding, not deliberation.** A post
   is good because it says something true and specific about the product. That
   comes from *seeing the product*, which is a perception problem. No amount of
   agents debating copy fixes a system that does not know what the app does.
2. **Deliberation is where bias enters.** Every extra judgment step is a place
   for self-preference and drift. Perception steps do not compound bias the same
   way, because their output is checkable against reality.
3. **Determinism is a quality feature, not just a reliability one.** "Same brief,
   same fortnight" means a regression is attributable. An agentic scheduler that
   produces a different plan each run makes every quality change unfalsifiable.
4. **It is cheaper where cheap does not cost quality, and expensive where it
   buys it.** 15× tokens on exploration and criticism, 1× on the pipeline.

### Why this yields better quality than the current build

Because the current build is blind twice over: it cannot see the product, and it
cannot see its own output. Both are perception gaps, and perception is exactly
what has become reliable.

---

## Part 6 — The architecture

### 6.1 The spine does not change

Job queue, `FOR UPDATE SKIP LOCKED`, dedupe keys, bounded retries, dead-letter,
six gates, human approval before publish. **Agents are called inside handlers.
No agent ever publishes, schedules, or decides a gate outcome.**

### 6.2 The Explorer — multi-agent, bounded

The one place a supervisor is justified: steps genuinely cannot be enumerated in
advance.

```
Explorer (lead)
  brief in:  product URL, credentials, repo (optional), what we already believe
  budget:    N steps, M minutes, hard ceiling
  out:       FeatureInventory (structured, never prose)

  ├── Crawler      Playwright: routes, nav, forms, empty states, screenshots
  ├── Authenticator  logs in with supplied credentials. Nothing else.
  ├── Flow prober    attempts one user journey, records every step
  ├── Code reader    answers specific questions against the repo
  └── Reconciler     site claims vs app behaviour vs code. Reports disagreements.
```

**Guardrails, each mapped to a documented failure mode:**

| Guardrail | Prevents |
|---|---|
| Fixed step and time ceiling | Infinite handoff loops |
| Workers return typed objects, never prose | Telephone-game context loss |
| Workers never call each other, only the lead | Loops by construction |
| Lead gets a **structured brief**, never free-form | The documented delegation failure |
| Dedicated system prompt per worker | Prompt-reuse drift |
| Read-only credentials, destructive-action denylist | An explorer that deletes the user's account |
| **Every discovered feature starts `unverified`** | Confident nonsense downstream |

**The verification rule, which is the whole safety story:**

> A discovered feature is a *hypothesis*. It becomes a fact only when a
> **scripted, deterministic replay** of its steps succeeds twice. Unverified
> features are never given to the copywriter.

This is `verify-flows` generalised, and it is why the Explorer can be trusted
where an unconstrained crawler cannot. The existing capture subsystem already
proves the pattern works: it refuses to record black frames and surfaces failure
on `/settings/health`.

### 6.3 The Critic panel — parallel, artifact-only, no handoffs

```
render complete
  ├── Frame describer   sampled frames → what is visibly happening   (never told intent)
  ├── Audio transcriber → literal transcript + prosody notes         (never told intent)
  ├── Caption reader    → burned-in text, per timestamp              (never told intent)
  └── (parallel, independent, no communication)
          ↓
  compare(descriptions, intent) in CODE
          ↓
  typed findings → the existing gate registry
```

**No supervisor.** There is nothing to coordinate — three independent perception
tasks and a deterministic comparison. This eliminates the top failure mode by
construction rather than by guardrail.

**The judges never see the script.** This is not a stylistic preference; it is
what defeats self-preference bias. A describer told "the script says X" will find
X. A describer shown only frames reports what is there, and the disagreement
surfaces in code.

### 6.4 The Strategist — single agent, tools, no team

Choosing what to post next is one decision needing broad context. That is
Cognition's case exactly: splitting it produces conflicting choices that no merge
step repairs. One agent, real tools (shipped features, past performance, mix
debt, swipe file), structured output into the existing idea engine — which then
*scores and selects in code*.

### 6.5 What stays plain code, permanently

Scheduling, cadence, board routing, destination routing, idempotency, the kill
switch, hashtag limits, the slop filter, gate pass/fail. All of these are
constraint satisfaction or policy. An agent here adds cost, latency and
non-determinism to a solved problem.

---

## Part 7 — The plan

Six phases. Each has an acceptance test that could fail, because a phase whose
success is unfalsifiable is a phase that will be declared successful.

### What building Phase 2 found, which was not on this plan

Three subsystems designed and never wired, all with the same shape — **a thing
that does nothing looks exactly like a thing that works.**

| Found | Symptom |
|---|---|
| `runAllGates` takes `visual` and `audio` as optional inputs, and no production path ever supplied one | Two gates unable to run since written; `visionScore` never populated |
| `collect_signals` scheduled every six hours since day one, no handler registered | 13 jobs stuck in production over 75 hours; the daily take never had a story |
| `tts` job kind, voice lexicon, audio gate and `writeVoScript` all built | **No ElevenLabs integration exists anywhere.** Voiceover is not implemented |

The first two are fixed. The third is now *documented* as unimplemented rather
than merely absent, which is the difference between a decision and an oversight.

`handlerCoverage.test.ts` makes the class impossible: it fails if a scheduled
kind has no handler, if a handler has no timeout policy, or if a declared kind is
unhandled without a written reason. The poller now raises a notification instead
of silently requeueing forever.

**This changes the reading of `STRATEGY.md`.** It said the learning loop was
"built, unexercised". Part of it was not built. Any claim in that document about
a subsystem working should be treated as a claim about code existing, not about
code running, until something has run it.

### Phase 0 — Publish (days, not weeks)

Nothing below can be evaluated without baseline output. Ship the launch batch,
connect the accounts, publish two weeks of posts.

**Accepts when:** 20+ posts published, metrics flowing, `/analytics` showing
measured rather than default readouts.

**Why first:** every quality claim after this is measurable against a baseline.
Without it, we are optimising in the dark and calling it engineering.

### Phase 1 — Music and silent-first (1 week)

Grounded directly in the retention research: silent-first design wins, and a
silent short-form video reads as amateur.

- ElevenLabs Music — the only clean commercial licensing answer in 2026.
- Burned-in captions on every short-form render (Remotion already has the timing
  data from whisper.cpp).
- Loudness-normalised mix: music under voiceover, ducked.

**Accepts when:** every video render has a music bed and burned-in captions, and
the audio gate measures the mix rather than a single track.

### Phase 2 — The Critic panel — **BUILT, 14 August 2026**

Shipped as `qc/coherence.ts` (the deterministic verdict), `generation/vision.ts`
(the describer, which has no parameter for intent) and the `review_media` job.

Acceptance met: it passes a truthful post, fails one whose copy is about
sourdough when the footage is about flour substitution, and reports `skipped`
rather than `passed` when no frame could be sampled. Validated against a real
32-second render, not fixtures.

**What building it found, which is more than it fixed:** `runAllGates` takes
`visual` and `audio` as optional inputs and *no production path had ever
supplied one*. Two gates have been structurally unable to run since they were
written, and the `visionScore` rubric was never populated either. The render
handler wrote an asset row and stopped. An optional input nobody provides is a
gate that never objects.

**Two mistakes caught during the build**, both recorded because the pattern
matters more than the instances: two `as never` casts hid the fields the visual
gate actually needs, and the hook-text check counted the brand wordmark as a
text overlay — passing exactly the openings it exists to catch.

**Kill criterion still stands:** if, on 30 real posts, the findings do not
correlate with the operator's own rejections, it is decoration. Delete it.

### Phase 2 — original plan (2–3 weeks)

Built as Part 3 describes: perception plus deterministic comparison.

Checks, in order of value: claim/footage agreement; text overlay present in the
first 3 seconds; pattern interrupt between frame 0 and frame ~0.8s; transcript
matches intended script; spoken opening contains the key term; silent
comprehensibility.

**Accepts when:** it catches a deliberately corrupted render — a video whose
voiceover describes a feature the frames do not show — and reports `skipped`,
never `passed`, when frames could not be sampled.

**Kill criterion:** if, on 30 real posts, the critic's findings do not correlate
with the operator's own rejections, it is decoration. Delete it.

### Phase 3 — The Explorer (4–6 weeks)

The big one. Build **verification first**, then the crawler.

1. `FeatureInventory` schema, and the replay verifier that promotes
   `unverified → verified`.
2. Crawler + authenticator, read-only, denylisted from destructive actions.
3. Reconciler across site, app and code.
4. Feed verified features into the brief that already drives every prompt.

**Accepts when:** pointed at RecipeFix with no brief, it produces a feature
inventory whose verified entries match the hand-written brief, and whose
unverified entries are honestly marked. **Test against the product whose answers
we already know** — the only way to evaluate a system whose output is a claim.

**Second accept:** pointed at a product nobody has hand-written a brief for, it
produces something a person agrees with.

### Phase 4 — The Strategist (2 weeks)

Single agent with tools, feeding the existing idea engine. Only worth building
once Phase 0 has produced performance data for it to read.

**Accepts when:** its selections beat the current mix-debt-and-novelty scoring on
measured conversion, over 40+ posts.

### Phase 5 — Generated b-roll (2 weeks, optional)

Only after the Critic can reject it. Kling 3.0 at ~$0.09–0.14/sec is the cost
leader; Veo 3.1 is the only one with native audio; **avoid Sora 2, whose API is
scheduled for removal on 24 September 2026.**

**Accepts when:** blind comparison shows b-roll posts outperform templated ones.
**Kill criterion:** if audiences can tell, stop. RecipeFix's positioning is
honesty about what a product does; AI footage of food nobody cooked is a brand
risk that appears in no metric until it does.

---

## Part 8 — Cost

| | Now | With the plan |
|---|---|---|
| Per post generation | ~$0.02 | ~$0.02 |
| Critic panel per post | — | ~$0.05–0.15 |
| Exploration, per product, one-off | — | ~$3–10 |
| Music per video | — | ~$0.05 |
| Monthly at 60 posts | ~$1.30 | **~$8–15** |
| With generated b-roll | — | +$20–60 |

Halyard already records cost per generation, so this is measurable rather than
estimated once it runs. The 15× multiplier the research warns about applies to
exploration, which is one-off per product, not per post.

---

## Part 9 — What would make me wrong

Stated now, so they can be checked later rather than rationalised.

1. **If the Critic's findings do not predict operator rejections**, perception-
   plus-comparison is not enough and the whole Part 3 argument is weaker than I
   think.
2. **If the Explorer's verified features still contain confident errors**, the
   replay verifier is not a sufficient oracle and exploration needs a human
   confirmation step — which makes it a productivity tool, not autonomy.
3. **If a single agent with a large context outperforms the Explorer team**,
   Cognition are right for this domain too and the parallelism is buying tokens
   rather than quality.
4. **If posts do not improve after Phases 1–3**, the constraint was never the
   system. It was the product, the audience, or the market, and no architecture
   fixes that.

---

## Part 10 — The recommendation, plainly

**Go agentic, but only for perception, and keep the deterministic spine.**

A fully agentic rebuild would replace a debugged, crash-safe, non-drifting
orchestrator with the architecture whose top documented failure mode is infinite
handoffs and whose primary cause of failure is context inconsistency. It would
also make every future quality change unfalsifiable, because the system would no
longer produce the same plan twice.

Staying fully deterministic keeps a system that is blind twice over.

The split — **agents perceive, code decides** — takes the 90% gain where the
evidence supports it (parallel read-only research), avoids the telephone game
where the evidence warns against it (dependent sequential decisions), and defeats
self-preference bias by never asking a model to judge, only to describe.

**Start with Phase 0.** Everything else is unmeasurable until something has
published.
