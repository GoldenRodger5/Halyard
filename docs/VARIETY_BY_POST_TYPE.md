# Variety, per post type

**The question:** an account posts every other day across X, Instagram,
Pinterest and TikTok. Short video is one lane of four. What stops the *other
three* from looking the same?

`docs/VARIETY_SPEC.md` answered it for short video. This is the rest.

---

## 1. Two levels, everywhere

Variety is not one thing. Every post type has both:

| Level | What it is | Short-video example |
|---|---|---|
| **Structure** | What the piece *argues* — the sequence of moves | `quiz`, `history`, `tips`, `myth_fact` (11 formats) |
| **Treatment** | How a frame is *drawn* — weight, rhythm, where the eye lands | `stack`, `rail`, `grid`, `spotlight`, `versus` |

A format with one treatment is a format that always looks the same. A treatment
with one format is a look with nothing to say. Both are needed and they vary
independently.

---

## 2. Where each post type stands, measured

| Post type | Structure | Treatment | Verdict |
|---|---|---|---|
| `short_video` | 11 formats | Quiz 5 · Narrative 5 | ✅ Fixed in §394 |
| `carousel_images` | 11 formats (same catalogue) | 5 layouts — `editorial`, `split_rule`, `numbered`, `statement`, `lead_emphasis` | ⚠️ **Same empty-history bug**, third instance |
| `single_image` | 11 formats | **5 templates exist, one is hardcoded** | ❌ Four are unreachable |
| `pin` | 11 formats | 1 (`pinterest_tall`) | ❌ No range |
| `caption_only` · `caption_link` · `reply` | 11 formats | **none — the concept does not exist** | ❌ The largest gap |
| `story` | — | renders as an image | ⚠️ Inherits `single_image` |
| `long_video` | 11 formats | Narrative 5 | ✅ Via §394 |
| `carousel_mixed` | as `carousel_images` | as `carousel_images` | ⚠️ Same |

### 2.1 The carousel repeats across decks

`generate.ts` builds a deck and seeds the layout history empty:

```ts
const usedLayouts: CarouselLayout[] = [];   // ← per deck, every time
```

Slide one of every carousel draws the same layout. This is the **third**
appearance of the defect §394 fixed twice — the rule is right everywhere and
nothing ever remembered its answer.

### 2.2 Single images cannot vary at all

Five templates are registered — `transformation_diff_1x1`, `transformation_diff_4x5`,
`substitution_ratio`, `chef_note_quote`, `scaling_math` — and the generator names
one:

```ts
if (props && enabledTemplates.includes('transformation_diff_4x5')) { … }
```

There is no chooser. Four templates are reachable only by an operator picking
them by hand. Every product-grounded still is the same card.

### 2.3 Text posts have no notion of shape

This is the biggest gap and the least obvious, because nothing renders. A text
post's *look* is its **shape on the screen**: where the line breaks fall, whether
it opens on a question or a claim, whether it is one sentence or a short list.

X and Threads are text-first. An account whose every post is a three-line
paragraph with the same rhythm reads as automated within a fortnight — and no
gate would catch it, because every individual post is fine.

**Nothing in the codebase models this.** It is a new concept, not a wiring fix.

---

## 3. What to build — the treatments

Written the way a social team would argue them: each is a different *move*, not
a different decoration.

### 3.1 Caption shapes — `caption_only`, `caption_link`, `reply`

| Shape | The move | Suits |
|---|---|---|
| `single` | One sentence, no break. A claim that needs no scaffolding. | A strong fact, a hot take |
| `setup_turn` | Two lines with a break between. The second contradicts or completes the first. | Myth-fact, comparison |
| `list` | A lead line, then 2–4 short lines. | Tips, listicles |
| `question_open` | Opens interrogative, answers below the fold. | Quiz, poll, origin |
| `receipt` | The claim, then the evidence in a shorter line under it. | Anything sourced |

Constrained by what the format has: a `tips` post has items and can be a `list`;
a `myth_fact` has two halves and can be `setup_turn`. **Fit first, then recency**
— the same rule as everywhere else, because it is the right rule.

### 3.2 Still treatments — `single_image`, `story`, `pin`

The five templates already exist. They need a **chooser** with the same
signature as `chooseLayout`: what the artifact can fill, then what has not been
used lately.

| Template | Needs | The move |
|---|---|---|
| `transformation_diff_1x1` / `4x5` | before + after | The change, marked |
| `substitution_ratio` | a swap with a ratio | The maths, plainly |
| `chef_note_quote` | a quotable line | A voice, at size |
| `scaling_math` | quantities | The arithmetic as the subject |

A template picked for an artifact that cannot fill it renders an empty card,
which is why fit is checked first and never skipped.

**Pinterest** gets its own aspect and one template today. `pinterest_tall` plus
two more — `pin_stack` (steps down a tall card) and `pin_quote` — is enough
range for a surface where the same crop repeated is the whole feed.

### 3.3 Carousel — fix the memory, keep the five

No new layouts. Five is enough range for a 7–10 slide deck; what it lacks is the
history, exactly as with video.

---

## 4. Order of work

| # | Step | Why here |
|---|---|---|
| 1 | Carousel recency | Third instance of a fixed defect. The smallest change with a proven shape. |
| 2 | Still chooser | Four templates exist and are unreachable. Range already built, never wired. |
| 3 | Caption shapes | New concept. The largest gap, and the one no gate would ever catch. |
| 4 | Pin treatments | Two new templates, once the chooser exists to pick them. |
| 5 | Surface it | Gallery ▸ piece says which treatment and why; Master ▸ Templates shows the pool and what has been used lately. |

---

## 5. Definition of done

1. **No post type repeats a treatment** until its pool is exhausted — asserted
   per type, not once.
2. A treatment is never chosen for a piece that cannot fill it.
3. Every choice is a pure function of its inputs, so a re-render is identical.
4. Every treatment in every pool is **reachable** — a treatment nothing can pick
   is dead code, and `videoTemplateCoverage.test.ts`'s lesson applies to all of
   them.
5. The operator can see which treatment was used, and why, without reading the
   database.

---

## 6. What the research says

Carousels carry the highest engagement of any Instagram format (0.50% by
follower count against 0.48% for Reels and 0.33% for stills), and on LinkedIn
they beat text posts by 585%. That is the surface where repetition costs most,
and it is the one with the recency bug.

No single format carries a feed. Rotation between them is the strategy, which is
what `mix` already enforces — this document is about making each lane in that
rotation survive being used 50 times a year.

Sources: Buffer's 45M-post analysis; Instagram format engagement, Q2 2026.
