# Direction — length, composition, and the agent line-up

**Status:** W1-W10 and W12 are built and live. W6 and W11 remain. The spec is
kept as written, with a **Built** note under each item recording what shipped
and where the plan turned out to be wrong — which it was, in two places, both
recorded below.

This document answers one question asked directly — *"target time is arbitrary;
for TikTok can't that be longer?"* — and then follows it where it leads, because
the honest answer is not a better number. It is that **no number is in charge.**

---

## Part 0 · The diagnosis

Halyard has forty registered agents. Thirty-one are `implemented_partial` or
`blocked`. That is not the problem. The problem is what they have in common:

> **Every agent answers one question about a piece. Nothing decides the piece.**

`docs/DECISIONS.md` has recorded a version of this eleven times under the name
*declared, typed, tested, never executed*. Parts 1 and 2 are the two largest
remaining instances, and they turn out to be the same instance seen from two
directions:

| | The mechanism that exists | What reads its answer |
|---|---|---|
| **Length** | `PostFormat.targetSeconds`, on eleven formats | nothing |
| **Composition** | `Screenplay`, with move / weight / ground / score / gestures per scene | nothing (three expressions in `tts.ts`, for the music bed) |

Both are the *director's* two decisions — how long, and what happens when — and
in both cases a committee of specialists is making the piece instead, one
dimension at a time, with the length falling out as arithmetic nobody chose.

---

## Part 1 · Length

### 1.1 What decides length today

Nothing decides it. It is a consequence of word count.

`spokenSeconds` in `packages/render/src/video/quiz.tsx:182`:

```
seconds(line) = max(2.0, words / 2.6 + 0.55)
```

`videoForFormat` sums that over every line the writer produced. So for a piece
of N lines and W total words:

```
duration ≈ W / 2.6 + 1.05·N        (with a 2.5-second floor per line)
```

> **Correction (built).** The first draft of this document used `0.55·N`. That
> is `spokenSeconds`'s overhead — how long the *voice* takes. The renderer sums
> `secondsToRead`, which adds a further 0.5s breath per beat, so the real
> per-line cost is 1.05s and every worked example below was optimistic by half a
> second a line. It mattered: at twelve lines the difference is six seconds, and
> six seconds is the whole gap between a quiz that fits its band and one that
> does not. Found by writing `predictSeconds` and asserting it against the
> renderer's own sum — which is exactly why `lengthAgreement.test.ts` exists.

The writer's word count is bounded by `PostFormat.slots[].maxWords`. Those
numbers were set by editorial taste. `targetSeconds` was also set by editorial
taste. **They sit four lines apart in the same object and have never been
reconciled with the arithmetic that connects them.**

Worked, for `quiz`:

| | |
|---|---|
| slots | title 8w + question 14w × 5 + answer 18w × 5 + close 12w |
| maximum words | 180 |
| lines | 12 |
| implied maximum duration | 180/2.6 + 1.05×12 = **82s** |
| declared `targetSeconds` | **30** |
| measured on a real render | **53s** |

The declared target is not merely ignored. It is *unreachable* — the format's
own slot budget cannot produce a 30-second quiz even if the writer writes to
the shortest legal line. The number was never checked against the machine.

Measured across the six most recent renders: **53, 28, 25, 19, 19, 19 seconds.**

### 1.2 What the platforms actually reward

Length is not a legality question. Every platform here accepts far more than we
send. It is a *distribution* question, and the numbers are unambiguous.

- **TikTok.** Completion rate is the primary distribution signal, and the bar
  has risen to roughly 70%. Under 30 seconds averages a **72%** completion rate;
  30–60 seconds averages **54%**. The viral band is **24–38s**; a separate
  deep-dive band exists at 60–90s but pays only for genuinely narrative content.
  ([quso.ai](https://quso.ai/blog/best-video-length-for-tiktok),
  [sureshot](https://sureshot.video/blog/how-long-is-a-short-form-video))
- **Instagram Reels.** Sweet spot **15–30s**. The maximum is now 20 minutes, but
  Instagram **stops recommending a Reel over three minutes to non-followers** —
  so past three minutes the piece is accepted and not distributed.
  ([metricool](https://metricool.com/instagram-reels-length/),
  [moonb](https://www.moonb.io/blog/instagram-reel-length))
- **YouTube Shorts.** Maximum 180s since the 2024 change. Engagement sweet spot
  **30–60s** — the longest of the three, because Shorts is half search and a
  viewer arriving from a query has already decided to watch.
  ([adcreate](https://adcreate.com/blog/youtube-shorts-length-guide-2026),
  [yoola](https://yoola.com/blog/youtube-shorts-vs-instagram-reels-whats-better-in-2026))
- **Educational content specifically** — which is all of RecipeFix's catalogue —
  performs best at **42–54s**, enough to state a problem, explain it, and land a
  takeaway without sounding rushed.
  ([joyspace](https://joyspace.ai/ideal-video-length-social-platform-2026))

The governing sentence, which should be quoted in the code: *a 30-second clip
watched to 90% out-distributes a 90-second clip abandoned at 40%, every time.*

**So: yes, TikTok can be longer — and it should not be.** TikTok is the platform
where length costs the most, because completion is its primary signal. The
platform that should be *longer* than we currently produce is **YouTube Shorts**,
where our 19-second pieces are half the length of the band that performs, and
where the ceiling we enforced (60s) was three years stale.

### 1.3 §438 — the bounds were stale

`VIDEO_BOUNDS` in `packages/core/src/qc/visualQC.ts` is the only place anything
checked a duration, and two entries had been overtaken:

| platform | was | now | note |
|---|---|---|---|
| instagram | 90s | **180s** | Reels went to 3 minutes |
| youtube | 60s | **180s** | Shorts went to 3 minutes in Oct 2024 |

Fixed. Bluesky's absence is correct — the adapter carries images only, so a
bound there would describe a path that does not exist.

This is the *"the rule was right and the world moved underneath it"* shape, and
it argues for one standing habit: **every constant that encodes a third party's
behaviour carries the date it was last checked.** Proposed as W9 below.

### 1.4 The proposed model — a budget, not a target

Three changes, in order of how much they matter.

**(a) The platform owns the band; the format owns its pace.**

`targetSeconds` is deleted from `PostFormat`. In its place:

```ts
// packages/core/src/creative/length.ts   (new)

export interface LengthBand {
  /** Below this the piece reads as unfinished. */
  floorSeconds: number;
  /** What we build to. */
  targetSeconds: number;
  /** Past this, distribution falls off a cliff. Not the legal maximum. */
  ceilingSeconds: number;
  /** One line, for the operator and the decision record. */
  because: string;
}

export const LENGTH_BANDS: Record<string, Record<Channel, LengthBand>> = { … };
```

Recommended bands, from §1.2:

| platform | channel | floor | **target** | ceiling | because |
|---|---|---|---|---|---|
| tiktok | short_video | 12 | **32** | 55 | inside the 24–38 viral band; 55 is where completion halves |
| instagram | short_video | 10 | **26** | 45 | the 15–30 sweet spot, with room for a sourced format |
| youtube | short_video | 22 | **48** | 90 | 30–60 engagement band; search arrivals tolerate more |
| instagram | story | 5 | **9** | 15 | a story card is read, not watched |
| x | short_video | 8 | **22** | 45 | in-feed, muted, lowest patience of the set |
| threads | short_video | 8 | **22** | 45 | as X |
| youtube | long_video | 180 | **360** | 600 | a different product; not covered further here |

The format then declares a **pace**, not a duration:

```ts
pace: 'terse' | 'standard' | 'unhurried'   // ×0.8 | ×1.0 | ×1.25
```

`myth_fact` is terse — a concession and a correction, and the shorter it is the
harder it lands. `history` and `origin` are unhurried — they are the narrative
shapes the 60–90s deep-dive band exists for. Everything else is standard.

**(b) The budget flows backwards into the writer, as words.**

This is the part that makes it real rather than a second inert number. Invert
the arithmetic from §1.1:

```
budgetWords(target, lineCount) = (target − 0.55 · lineCount) × 2.6
```

and distribute that across the format's slots *proportionally to their declared
`maxWords`*, so the editorial intent of the slot ratios survives the scaling.
`briefFor` (`packages/core/src/formats/write.ts`) already states the house style
before the writer writes; it gains one more sentence per slot: the actual word
count this slot has, on this platform, for this piece.

**(c) When the budget will not fit, the format flexes its structure.**

Worked, for `quiz` on TikTok — target 32s, with the corrected arithmetic:

| | 5 questions | 3 questions (budgeted) |
|---|---|---|
| lines | 12 | 8 |
| word budget | (32 − 12.6) × 2.6 = 50 | (32 − 8.4) × 2.6 = **61** |
| slot weight | 180 | 116 |
| scale | 0.28 | **0.53** |
| → question | 4 words *(floored to 8)* | **8 words** |
| → answer | 5 words *(floored to 10)* | **10 words** |
| **renders at** | **47.2s** | **33.0s** |

**Built, and the model changed shape here.** The plan claimed the shorter quiz
buys *longer questions*. It does not, because a quiz question has a floor —
below about eight words it cannot state a subject and a constraint together,
which is what makes an answer checkable — and at five questions the scale drives
straight through that floor. So both structures write eight-word questions and
only one of them lands anywhere near 32 seconds.

The real gain is therefore not longer lines, it is **hitting the band at full
line length**. Five questions at the floor runs 47 seconds against a 32-second
target; three run 33. The conclusion the plan reached is right and the reason it
gave was wrong: the structure has to flex because the *wording cannot*, not
because flexing it buys more words. `length.test.ts` asserts this in the form it
is actually true in.

Where a platform's band cannot afford even the minimum — an eight-word quiz
question on a 22-second X target — `lengthBudgetFor` reports it rather than
writing a four-word question. A quiz does not belong everywhere.

So repeating slots stop declaring a fixed count:

```ts
repeats: 5              →   repeats: { min: 3, max: 5 }
```

and the budget picks the count — the largest that fits without pushing any slot
below a `minWords` floor. On YouTube Shorts the same quiz gets four or five
questions; on TikTok it gets three. **The same format becomes genuinely
different per platform, which is what a real social team does and what Halyard
currently does not.**

### 1.5 Enforcement — three points, because one is never enough

1. **Before writing.** `budgetFor(platform, format)` yields the repeat count and
   the per-slot word counts. The writer is told them.
2. **After writing, before rendering.** `predictSeconds(lines)` runs the same
   arithmetic `videoForFormat` will run. Over ceiling → re-cut (drop the weakest
   repeat, per the Editor in §5.1) rather than ship long. This is where a
   deterministic check belongs, because it costs nothing and a render costs
   minutes.
3. **After rendering.** A new rule in `retentionQC.ts`:

   ```
   retention.length_band   error   if measured > ceiling
                           warning if measured < floor
   ```

   It must appear in `unmeasured` when no band is known for the platform —
   Gotcha 6, and `retentionQC` already has the machinery for exactly this.

Point 3 alone is what §437 asked for, and point 3 alone would have caught the
53-second quiz. Points 1 and 2 are what stop it being produced in the first
place.

---

## Part 2 · Composition — connecting the screenwriter

### 2.1 The state, restated

`screenwriter.ts` opens by describing itself as *"the only agent given the whole
context at once… because composition is precisely the thing that cannot be
decided one dimension at a time."* It is given all of that. `checkScreenplay`
validates every direction against what the machinery can execute. The Gallery
renders the result under *"what it was staged as."*

Measured on a real piece (§132): of `move`, `score`, `ground`, `weight`,
`gestures`, `seconds` and `onScreen`, **not one field reaches the renderer.**
`videoForFormat` builds the video by mechanically mapping format slots — so the
agent that exists because composition cannot be decided one dimension at a time
is bypassed by a path that decides every dimension separately.

### 2.2 Why the obvious fix is the wrong one

The obvious fix is `videoForScreenplay(screenplay) → props`, replacing
`videoForFormat`. It is wrong for two reasons:

- `videoForFormat` is the only path that currently works, across eleven formats
  and seven platforms. Replacing it wholesale trades a working system for a
  model's output with no fallback, on a path where a failure is a render that
  never completes.
- The format genuinely knows things the screenplay does not: which slots repeat,
  what a quiz reveal *is*, which treatments are legal. That knowledge should not
  move into a prompt.

### 2.3 The fix — key the screenplay to the format's slots

One type change makes the whole thing joinable:

```ts
export interface Scene {
  id: string;
  /**
   * The slot instance this scene stages: `question#2`, `answer#2`, `close#0`.
   * The same key `write.ts` assigns (§404/§411), so the join is exact rather
   * than a fuzzy match on text that both sides derived from the same copy.
   */
  slotKey: string;
  …
}
```

Then `videoForFormat` keeps producing the structural beats it produces today,
and gains an optional second argument:

```ts
videoForFormat(format, copy, direction?: Map<string, Scene>)
```

For each beat it builds, it looks up the scene by slot key. If there is one and
`checkScreenplay` passed it, the scene *directs* the beat:

| screenplay field | what it drives | where |
|---|---|---|
| `seconds` | the beat's hold, clamped below by `spokenSeconds` so the VO cannot be cut off, and above by the Part 1 ceiling | `formatVideo.ts` |
| `move` | Ken Burns direction and the transition into the beat | `narrative.tsx` `Ground` |
| `weight` | type scale and emphasis (`lead` / `support` / `aside`) | `narrative.tsx` |
| `ground` + `groundSubject` | footage vs photograph vs colour, and *what it is of* — footage since §478, licensed b-roll for a line about something happening | `generate.ts` `footageForBeats`, then `photographBeats` for the rest |
| `score` | the bed envelope at the beat boundary | `tts.ts` / music director |
| `gestures` | the marks, resolved to regions | `annotationDirector.ts` |

If there is no scene for a key, the beat renders exactly as it does today.
**The screenplay becomes a director that can be absent**, which is the only
version of this that is safe to ship.

### 2.4 What each director becomes

This is the inversion the screenplay was written for, made concrete. The
directors stop *deciding* and start *executing within their rules*:

| agent | today | after |
|---|---|---|
| motion-director | picks a move from the beat's role | carries out `scene.move`, refusing it if the ground cannot support it |
| annotation-director | places marks where a capture happened to record one | places `scene.gestures`, resolving each label to a region; already refuses unlocatable ones |
| music-director | picks a bed by mood | carries out the `scene.score` envelope across the piece |
| visual-director | picks a visual language for the piece | resolves `scene.ground` + `groundSubject` per scene |
| voice-director | picks a delivery | unchanged — delivery is a property of the piece, not the scene |

Each refusal must be recorded, not swallowed. `checkScreenplay` already returns
structured refusals; they should reach the Gallery, so an operator reading *"what
it was staged as"* also reads *what could not be staged, and why*. That is the
single most useful diagnostic this system could show, and it is nearly free.

### 2.5 Acceptance — how we know it is not §132 again

The test that would have caught §132 in the first place, and the one this work
must ship with:

> For a piece that has a screenplay, assert that every `Scene` field in
> `{seconds, move, weight, ground, score}` is observably different in the render
> props when the scene's value is changed. A field that can be changed with no
> effect on the output is not connected.

A coverage test on the *join*, not on the types. `handlerCoverage.test.ts` is the
precedent: the only reason Gotcha 1 stopped costing migrations.

---

## Part 3 · Per-platform optimisation targets

Length is one axis. Each platform's *primary signal* is different, and today
every platform gets the same piece with a different caption. What follows is
what a social team would brief differently.

| platform | primary signal | what that changes about the piece |
|---|---|---|
| **TikTok** | completion rate | shortest band; pattern interrupt ≤ 12s; the last frame resembles the first so it loops; the payoff withheld to the final third |
| **Instagram Reels** | saves + shares | the payoff must be *worth keeping* — a number, a rule, a list. 85% watch muted, so every claim is legible on screen, not only spoken |
| **YouTube Shorts** | post-view engagement | longest band; the close is a question; the title carries search terms because Shorts is half search |
| **X** | reply rate | copy opens a question it does not answer; link in the first reply, never the body (already enforced) |
| **Threads** | reply rate | as X, and posts that open a question outperform posts that close one (already in `strategy.ts`) |
| **Bluesky** | chronological reach | timing matters more than anywhere else; longer text tolerated |
| **Pinterest** *(deferred)* | search | — |
| **Facebook** *(deferred)* | — | — |

`platform-creative-director` already exists and is `implemented_exercised`, so
this is an extension of a working agent rather than a new one. It gains a
`primarySignal` and the sentence that follows from it, and that sentence reaches
the writer's brief and the retention gate's target.

**On trending sounds.** They remain out of reach by API on TikTok
(`adapters/tiktok.ts:12` — v2 E.4), and that is a platform limit, not a gap. The
correct design is the one already there: inbox upload puts the video in drafts,
the operator attaches a trending sound in the app, and publishes. What we can do
without the API is make the piece *sound-ready* — cut on a consistent grid so an
attached sound lands on the cuts rather than against them. That is the Sound
Designer's job (§5.2), and it is worth more than the sound itself.

---

## Part 4 · The agent line-up, reviewed

Forty agents. `implemented_exercised` means the Auditor has seen it run; it does
not mean its output is *read*, which is the distinction §132 turns on.

### Content (17)

| agent | status | verdict |
|---|---|---|
| copywriter | partial | **Sound.** The most-called agent here; retries against the slop filter and claim verifier. Leave it. |
| format-writer | partial | **Sound, and now the length lever.** Part 1(b) lands here. |
| researcher | exercised | **Sound.** Verified facts before writing is the right shape. |
| screenwriter | partial | **Reconnect (Part 2).** The largest single piece of unrealised work in the system. |
| creative-director | exercised | Overlaps the screenwriter. After Part 2, **fold into it** — one director, not two. |
| story-architect | exercised | Same. After Part 2 it is the screenwriter's structural half. **Fold.** |
| visual-director | exercised | **Demote to executor** (§2.4). |
| motion-director | exercised | **Demote to executor.** |
| music-director | exercised | **Demote to executor.** |
| annotation-director | exercised | **Demote to executor.** Already refuses unlocatable marks, which is the model. |
| voice-director | exercised | **Keep as-is.** Delivery is a property of the piece. |
| platform-creative-director | exercised | **Extend** with `primarySignal` (Part 3). |
| photographic-subject | exercised | **Sound.** Drives the per-beat photography that fixed the stale-background complaint. |
| hook-generator | partial | **Redesign** — see §5.3. Generic hooks now actively signal low quality. |
| vo-scriptwriter | partial | **Corrected on inspection: keep.** The plan assumed it was redundant once the screenplay carried `spoken`. It is not on the generate path at all — the format's narration is assembled mechanically from the same gated slots the video is built from (§306), and `writeVoScript`'s only callers are in `correction/rewrite.ts`, rewriting a voiceover an operator rejected. A different surface, doing a job nothing else does. |
| sound-director | **blocked** | **Correctly blocked** — on procurement, not code. §5.2. |
| thumbnail-director | **blocked** | **Correctly blocked** — on a YouTube scope the channel has not granted. Refuses by naming the scope rather than spending a request on a 403, which is the right behaviour. |
| auto-clip | **blocked** | Blocked on source footage. **Leave blocked**, honestly. |
| concept-generator | partial | Overlaps `idea-generator` and the screenwriter. **Merge or delete** — decide, do not leave two. |
| copilot | partial | Operator-facing. **Sound.** |
| idea-generator | partial | **Sound.** |

### Quality (4)

| agent | status | verdict |
|---|---|---|
| creative-critic (rules) | partial | **Sound.** Deterministic, cheap, runs every time. |
| creative-critic-model | partial | **Newly working** — the `metadata` field made it return 400 on every request in its existence until §412. It has now run. Watch it before extending it. |
| payoff-verifier | partial | **Sound.** |
| vision-describer | partial | **Sound** — the coherence oracle depends on it. |

### Product intelligence (6)

| agent | status | verdict |
|---|---|---|
| product-discovery, store-listing, code-intelligence, visual-brand, product-reconciler, product-inference | mixed | **Sound.** P1 works; this is the half of the system with the fewest gaps. |
| shipped-feature-summariser | **blocked** | Blocked on `repo_config` being `{}`. **An operator action, not a code gap** — record it as such and stop counting it. |

### Founder / engagement / setup / explorer / learning (7)

`take-drafter`, `take-strengthener`, `take-fact-checker`, `find-drafter`,
`reply-drafter`, `setup-kit-writer`, `explorer-discovery`, `rejection-clusterer`.
**Out of scope for this document** — they serve a different surface and none of
them is on the generate path. Reviewed only to confirm that.

**Net, as built:** four directors now execute a screenplay rather than deciding
independently, one agent redesigned (`hook-generator` → craft audition), two
genuinely new (Editor, Continuity Director), two confirmed correctly blocked on
things outside the code, and one — `vo-scriptwriter` — confirmed to belong where
it is. Three remain to fold, which changes the registry and nothing a viewer
sees, and is the right thing to leave until last.

---

## Part 5 · New and redesigned agents

### 5.1 The Editor — *new, deterministic*

**The single highest-value addition, and it falls directly out of Part 1.**

Every agent in this system adds. The researcher adds facts, the writer adds
words, the hook generator adds an opening, the annotation director adds marks.
**Nothing removes anything.** That is why length is 77% over target: there is no
counterweight.

```
packages/core/src/creative/editor.ts

cutToBudget(lines, band, format) → {
  kept: Line[],
  cut: Array<{ what: string; because: string }>,
  predictedSeconds: number,
}
```

Deterministic, because "this is 12 seconds over" is arithmetic, and the choice
of *what* to cut follows rules a person would state: drop the weakest repeating
instance before shortening a lead; never cut the payoff; never cut a citation;
prefer cutting the fourth of four tips over tightening all four.

It reports what it cut and why, and that report goes to the Gallery. An operator
who can see *"cut question 4 — the budget was 32s and it ran 41"* trusts the
system in a way that a silently shorter video does not earn.

### 5.2 The Sound Designer — *blocked, and correctly so*

> **Corrected on inspection.** This section proposed unblocking it and called it
> cheap. It is neither. `planSfx` is written and tested; what is missing is the
> `sound_effects` table's contents, and its status note gives the reason: *"a UI
> sound is only placed where a real interaction was captured; a tap over footage
> where nothing is tapped is a fabricated interaction."*
>
> That is gotcha 9 applied to audio, and it is right. The block is procurement —
> somebody has to license and load real effects — and no amount of code moves
> it. Writing a synthesised stand-in to make the agent "work" would be exactly
> the fabrication the note refuses.
>
> The one part of the original idea that survives is real and separable: cutting
> to a **consistent grid** so an operator-attached trending sound lands on the
> cuts rather than against them. That needs no assets and is not this agent. It
> is unbuilt and belongs on a future list.

### 5.3 The Hook Auditioner — *redesign of `hook-generator`*

Generic openings now actively signal low quality to the ranking systems, and the
first three seconds drive roughly 80% of completion variance — a number
`retentionQC.ts` already states in its own header comment and does not act on
before the piece is written.

Today: generate one opening. Proposed: **generate five, score all five against
the retention rules that already exist, keep one, and record the other four with
their scores.** The scoring is deterministic and free. Auditioning is what makes
the difference between a hook and *the* hook, and it is the one place in this
system where spending five model calls instead of one is obviously correct.

The four rejected openings are also the first real training signal this system
would have about its own taste.

### 5.4 The Continuity Director — *new, deterministic*

Halyard has five separate recency mechanisms — `chooseLayout` (§293),
`chooseQuizTemplate` (§302), `chooseStill` (§395), `chooseShot` (§402),
`chooseCaptionShape` (§419) — each correctly avoiding repetition **on its own
axis, in ignorance of the other four.**

A real account has a *look*. Nothing here knows what the last five posts looked
like when it makes the sixth, so the system can produce five pieces that are
each individually varied and collectively monotonous — the exact complaint that
started this work, one level up.

```
packages/core/src/creative/continuity.ts

continuityFor(accountId, lookback = 8) → {
  overused: Array<{ axis: string; value: string; runLength: number }>,
  underused: Array<{ axis: string; value: string; lastUsed: Date | null }>,
}
```

One answer, consulted by all five choosers, replacing five independent ones. It
is deterministic, it reads data we already store, and it is the difference
between *varied posts* and *an account with a voice*.

### 5.5 What is deliberately **not** proposed

- **A trending-sound agent.** The API cannot attach one. An agent that produced
  a sound recommendation nobody could act on would be a twelfth entry in the
  *declared, never executed* column.
- **A separate caption writer.** `copywriter` writes the platform caption,
  `format-writer` writes the on-screen copy. They are already separate, and
  correctly so.
- **A performance-learning agent.** `halyard_empirical` claims are zero
  everywhere by design (Gotcha 9) because nothing has been published and
  measured. An agent that learned from no observations would be an agent that
  invented them.

---

## Part 6 · Work items, in order

Ordered so that each one is shippable alone and each is verifiable in the UI.

| # | Work | Why it is here | Acceptance |
|---|---|---|---|
| **W1** ✅ | `length.ts` — bands, pace, `predictSeconds` | Everything in Part 1 stands on it | `lengthAgreement.test.ts` holds core's arithmetic to the render bundle's, exactly; verified to fail on drift |
| **W2** ✅ | `retention.length_band` gate | §437's original ask; catches the 53s quiz today | The existing 53s quiz fails the gate; the 28s one passes; an unknown platform reports `unmeasured` |
| **W3** ✅ | The Editor (§5.1) + `repeats: {min,max}` | Stops over-length being produced | A TikTok quiz renders at 3 questions and ≤ 55s; the cut report shows in the Gallery |
| **W4** ✅ | Word budget into `briefFor` | Makes the writer sharper, not truncated | Generated quiz questions measurably longer per line at 3 questions than at 5 |
| **W5** ✅ | `Scene.slotKey` + the join in `videoForFormat` | Part 2 — the largest unrealised work | The §2.5 field-connectivity test |
| **W6** | Demote the four directors to executors | Completes the inversion | Each refusal recorded and shown in the Gallery |
| **W7** ✅ | `primarySignal` on `platform-creative-director` | Part 3 | The same idea produces measurably different pieces for TikTok and Shorts |
| **W8** ✅ | Hook Auditioner (§5.3) | Highest ratio of gain to work of anything here | Five openings scored and recorded; the kept one is the highest scorer |
| **W9** ✅ | `lastVerified` on every third-party constant | §438 must not recur | A test fails when any constant is over 180 days unverified |
| **W10** ✅ | Continuity Director (§5.4) | The variety complaint, one level up | Eight consecutive pieces show no axis repeating more than twice |
| **W11** ⏳ | Fold `creative-director`, `story-architect`, `concept-generator` | Fewer agents, each with a reader | Registry count drops; the Auditor reports no orphans. **Not done, and deliberately last:** it is a refactor of three working agents with no change to what a viewer sees, and one of the four originally listed — `vo-scriptwriter` — turned out on inspection to belong exactly where it is. |
| **W12** ✅ | Investigate the two blocked agents | Both declared blocked; the plan assumed wrongly that both were cheap | **Neither is a code gap.** Sound Designer is blocked on procurement (no licensed effects, and synthesising them would fabricate an interaction — gotcha 9). Thumbnail Director is blocked on a YouTube OAuth scope the channel has not granted, and refuses by naming the scope rather than spending a request on a 403. Both statuses are honest and stay as they are. |

W1–W4 are one coherent piece of work and should ship together. W5–W6 are the
second. Everything after is independent.

---

## The through-line

The three problems this document describes — the length nobody chose, the
screenplay nobody reads, the five recency lists that cannot see each other —
are one problem wearing three hats:

> **Halyard has specialists and no director.**

The screenwriter was written to be the director. It was built, validated,
rendered in the UI, and then bypassed by a simpler path that runs anyway. Every
other item here is either a consequence of that or a counterweight the system
never had.

