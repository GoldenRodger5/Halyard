# The critic Halyard does not have

## Why nothing caught the captions

Every video Halyard has made used one caption treatment — 52px, weight 600,
centred, on every line of every piece. It took a person looking at the output to
notice. That is a failure of the architecture, not of any individual gate, and
it is worth being precise about why.

**Halyard has a describer and a rule set. It has no critic.**

- `describeFrames` returns `{atSeconds, describes, visibleText}` — *what is in
  the frame*. It is a perception step, and a good one.
- The gates then check **nameable defects**: a banned phrase, a contrast ratio
  under 4.5, more than 18 words on a card, loudness off −14 LUFS, a static
  stretch over 15 seconds.

Both halves worked exactly as designed. The problem is that "every caption in
this video is set the same way, and using the loudest setting on every line
reads as automated" **is not a nameable defect**. No threshold is crossed. No
rule is violated. Every individual frame is fine and the *set* of them is the
problem.

You cannot write a rule for "this is boring". But that does not mean it cannot
be checked — it means the check belongs on the other side of the line Halyard
already draws:

> **Agents perceive, code decides.**

A critic *perceives* the craft problem. Code decides what to do about it, using
the correction budget and escalation that §165 already implements. That is the
same bargain every other agent here strikes, and it is missing for craft.

## What the critic is asked

Not "is this good" — an unanswerable question that produces flattery. It is
shown the frames it already has and asked a small number of specific questions
whose answers are observable:

| Question | The failure it catches |
|---|---|
| Is any type treatment used on every frame? | The caption uniformity, exactly |
| Does the emphasis change when the content's importance changes? | A flat read |
| Is there dead space that reads as accidental rather than composed? | The empty top third |
| Would a viewer know what this is about from frame one alone? | The blank opener |
| Do any two frames differ only in their words? | A template wearing new copy |
| Is anything the platform's UI will cover? | Safe-area collisions |
| Does this look like a person made it, or like a system filled a shape? | The thing that matters |

Each answer must cite **which frames** it is about. A critique with no frame
reference is discarded, for the same reason a claim with no evidence is: it
cannot be acted on and it cannot be argued with.

## What happens to its answers

The critic returns findings; it does not regenerate anything and it does not
approve anything. Its findings are `warning`-severity by default and enter the
same pipeline everything else does:

```
critic finding → creative scorecard dimension → correction controller
              → smallest correction that addresses it → re-render → re-inspect
```

The correction controller already knows how to spend a finite budget and escalate
rather than loop. §165 built that and it works; the critic just gives it a class
of problem it could never see before.

**Deliberately not empowered to pass anything.** A model may not mark its own
work, and a critic that can clear a piece is a model marking the work of a model.
It can only ever say something is wrong.

## Why `warning` and not `error`

A craft judgement is softer than a claims violation, and a critic that can fail a
piece outright will eventually block a good post over a matter of taste. Warnings
feed the scorecard, the scorecard surfaces the weak dimensions to the operator,
and a *pattern* of the same warning across many pieces is the signal that
something systemic is wrong — which is exactly how the caption problem would have
surfaced weeks earlier.

---

# The format family

The quiz is one of a class. What they share: **the product is not the subject**,
they need no product claim, and they are all fixed structures with slots — which
is what makes them renderable deterministically and gradeable by the same gates.

## The formats

**Quiz.** Five questions, thirty seconds. Question → options → beat → answer.
Every fact sourced. Comments carry the answers, and comment volume is weighted
heavily.

**History.** "Gluten was identified in 1728 by a chemist who was trying to make
bread out of chestnuts." A single surprising fact, told as a story with a turn.
The most shareable of these because it makes the sharer look interesting.

**Tips and tricks.** Three to five things, numbered, each one line. The
`numbered` layout was built for exactly this shape. Highest save rate of the
family; lowest ceiling on reach.

**The full recipe.** Picture, ingredients, steps — the thing people actually
came for. The format most likely to be saved and returned to, and the one where
a *real photograph* matters most. This is where a hero image earns its cost.

**Myth versus fact.** "Oats are gluten free." True and misleading, which is the
best kind of correction. Two-state layouts already exist for this.

**Comparison.** Two products, two flours, two methods, side by side. The
`split_rule` layout is this.

**Origin.** How a dish got where it is. Adjacent to history, warmer, and the one
that travels furthest outside the niche.

## How a format gets chosen

Not randomly, and not by the writer. A format is a **shape for an argument**, so
it is chosen the way a layout is:

1. **What the source supports.** A signal with one surprising fact is a history
   post; an artifact with five techniques is a tips post. Asking a quiz format to
   carry a recipe produces a bad quiz.
2. **What the pillar ratio needs.** The pillars in `CONTENT_QUALITY_PLAN.md`
   have target shares; the format follows the pillar that is under-served.
3. **What the account has not done recently.** Same recency rule as typography
   and layout, for the same reason.
4. **What the platform rewards.** Quizzes are native to TikTok, full recipes to
   Instagram and Pinterest, history to YouTube and X.

## The UI: a category beside the prompt

In the composer, a **format picker per platform** next to the free-text idea
field. The operator types an idea and optionally names its shape; leaving it
unset lets the system choose, and the choice is shown with its reason the way
every other creative decision here is.

Grouping by platform matters because the same idea is a different post on each:

- **TikTok** — quiz, myth/fact, history, tip
- **Instagram** — full recipe, tips carousel, comparison, before/after
- **X** — history, myth/fact, one-line tip, thread
- **YouTube** — history long-form, full recipe, comparison
- **Pinterest** — full recipe, tips, comparison

Each format declares which platforms can carry it, so the picker only ever
offers a shape that platform can actually publish — the same discipline
`findFormatSpec` already applies to subtypes.

---

# Getting to NotebookLM quality

The specific things that make those videos good, and what each needs here.

| What it does | What Halyard needs | Status |
|---|---|---|
| **Hooks and tells a story** | A narrative arc with a turn | Structure exists; the writer does not aim for it |
| **Voice sounds good** | Better TTS with real prosody | ElevenLabs is in place; the endpoint has no speed control, so pace lives in the sentences (§232) |
| **Images look great** | Generated stills, art-directed | Built — §268, $0.04 each |
| **Font and style change** | Typography + layout systems | Built — §265, §267 |
| **Draws on screen** | Progressive reveal, annotation, motion that *means* something | **Missing.** This is the gap |
| **Cuts on the beat** | Caption-accurate timing | Built — this is Remotion's whole advantage |

## The one genuinely missing capability

Everything on that list is built except **drawing** — annotation that appears as
it is talked about. An underline that draws under a word as the voice says it, a
circle around the ingredient being discussed, an arrow that connects two things,
a highlight that sweeps across a line.

That is not a video model. It is **animated SVG over a still**, and Remotion is
already the right tool: paths with `strokeDashoffset` interpolated over frames,
driven by the caption cues that already exist per word (§270). The word timings
that made karaoke captions possible are the same timings that make an underline
land on the right syllable.

This is the highest-value visual work left, it is cheap to render, and it is the
thing that most reads as "a person made this".

## And where a video model does fit

Veo 3.1 at $0.15–0.40/second, for **one beat**, where a still cannot carry it:
steam rising, dough tearing, a pour. Not for a whole piece — a generated video
cannot hit a caption cue, and it cannot show the product truthfully.

The ordering stands: better material for a compositor, not a different
compositor.
