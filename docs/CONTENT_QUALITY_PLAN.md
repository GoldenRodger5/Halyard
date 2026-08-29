# Making it look like a team made it

Follow-up to `media-review/2026-08-29/REVIEW.md`. That review found the output
inert and uniform. This is what to do about it, grounded in what currently works
rather than in taste.

**The one correction to the review's instinct:** text-forward video is not the
problem. Kinetic typography *outperforms* static by 50–200%, and 81% of viewers
watch muted, so leading with type is correct for this product. The format is
right and the execution is wrong. Do not replace it — fix it and add range
around it.

---

## 1. The opening. Never start on nothing.

**Defect.** Frame 0 is blank on both videos; text is not legible until 0.5s.
That frame is also the poster frame — the still shown before autoplay.

**Why it is the worst one.** TikTok weights early hold heavily: a video keeping
80% of viewers for 3 seconds out-distributes one keeping 60% for 30 seconds. The
opening animation spends the whole decision window.

**Fix.**

- Beat 1 renders **fully composed at frame 0**. Animate *within* the hook —
  a word weight shift, a colour swap, an underline drawing — never *into* it
  from nothing. Entrance animations start at beat 2.
- **Cut every 0.5–1.5s for the first 5 seconds.** Halyard's pattern-interrupt
  rule is a flat 15s ceiling, which is a rule about the middle of a video
  applied to its opening. Tighten early, widen after ~3s: 0.8s cuts to 3s,
  then 2–4s, then the existing 15s ceiling.
- **Per-platform opening budget**, not one 90-frame constant: TikTok 0.5–1.0s,
  Reels ~1.0s (visual movement matters more there because the feed mixes
  stills), Shorts 1–2s (search-driven, and the first spoken line should carry
  the query term because YouTube weights the transcript).

**Test it with the signal that works.** §73 retired
`retention.no_content_in_opening` because mean luminance cannot see this
content, which is true. `YMIN` can: it read **89 on the blank frame and 9–36
once type lands** on these exact files. §74 already established YMIN as the
signal that sees this content. Re-enable the rule on YMIN and it catches this
defect on the render that shipped it.

## 2. Truncation. Fit the box or refuse.

**Defect.** Slide 2 stops at *"oat flour keeps…"*; slide 5 at *"classic crisp
t…"* — mid-word — with 60% and 25% of the canvas empty beneath.

**Fix.**

- Fit to the **measured box**, not a word budget. Halyard already had a fit
  computed at base size then multiplied by 1.85 after fitting (§ in STATUS);
  this is the same class recurring in the carousel path.
- If it genuinely does not fit at the minimum size, **refuse the render** and
  fail the item. An ellipsis mid-word is worse than no post.
- Ellipsis becomes a QC error, not a rendering strategy: no rendered slide may
  end in `…` unless the source text did.

## 3. Composition. The dead top third.

**Defect.** Every carousel slide is bottom-weighted with an empty top third —
reads as a rendering accident, and truncating in the same slide proves space was
available.

**Fix.**

- Headline **60–90px on the 1080×1350 canvas** and vertically centred in its
  block. Design for the **one-third size** it is actually viewed at.
- Give the empty space a job: an oversized slide number, a rule line, a pull
  quote, or the hero image (§5).
- **Directional cues toward the right edge** — a partial reveal of the next
  slide's first word, an arrow, a sentence that breaks across the gutter. These
  measurably raise swipe-through, and Halyard uses none.
- Add the explicit swipe prompt on slide 1. Only ~5% of carousels have one; it
  moves engagement 1.83% → 2%.

## 4. Variety. The director works — 90% of the output cannot see it.

**Defect, correctly diagnosed.** The Creative Director is not broken. It runs
and it chooses well — `creative_briefs.visual_direction` holds **eight visual
languages and five typography systems across ten briefs**.

The direction reaches the **Remotion video path only**. The Satori image
templates are handed `bodyLines, headline, index, kicker, total` — no
typography, no language — and draw with one fixed `props.brand` font pair.
**19 of 21 renders in this run were images.**

So the variety machine works and 90% of the output cannot see it. That is a much
smaller fix than rebuilding a director, and a much bigger win than adding a
fourteenth visual language nobody will see.

**Fix.** Pass the resolved `visual_direction` into the Satori render props and
have `templates.ts` resolve its fonts, weights, case and rhythm from the
typography system rather than from `props.brand`. The systems already exist
(`TYPOGRAPHY_FOR_LANGUAGE`); the image path simply never asks. Composition
should vary with the language too — `documentary` and `bold_social` should not
share a layout.

**Then, structural variety.** Content pillars with an explicit ratio, rotated so
no two consecutive posts share a shape. Suggested for RecipeFix:

| Pillar | Share | Shape |
|---|---|---|
| The fix | 40% | One swap, why it works, what it costs |
| The warning | 20% | Cross-contamination, hidden gluten, label traps |
| The proof | 20% | Before/after, a real bake, a failure |
| The person | 10% | Founder voice, a mistake, a question answered |
| The product | 10% | Cook Mode, adaptation — the current 15% ceiling |

Each pillar gets its **own** visual language and opening composition, so the
pillar is legible before a word is read. That is what makes a feed look like a
team: recognisable variation, not random variation.

## 5. Get food in the frame.

**Defect.** Zero photographs. `attached_asset_ids` empty on all 7 items; 19 of
21 renders are Satori text cards. It is a cooking product.

This is the highest-leverage item and mostly not a code problem. Kinetic type
works *combined with* imagery, not instead of it — and consumers explicitly want
human-made content from brands, with smartphone-captured material cited as among
the strongest food marketing there is.

**Fix, cheapest first.**

1. **One hero still per artifact**, reused across the carousel and as the video's
   held opening frame. Even a single image changes the read entirely.
2. **The failure photo.** The most under-used asset in food content: the batch
   that came out wrong. It is on-brand for a product about fixing recipes, it is
   cheap, and it cannot be mistaken for stock.
3. **Hands and process.** A phone locking mid-recipe — the actual hook of the
   TikTok post — is a five-second shot someone can film once and reuse.
4. Only then consider generated imagery. A brand that posts obviously-generated
   food is worse off than one posting text.

## 6. Voice. Write outward, and let it have a personality.

**Defect.** The copy is inward-facing — *drafts, adaptations, rewrites,
compliance scans*. Three of seven posts are about RecipeFix's internals. And the
slide-1 problem is a voice problem too: a gluten-free headline over wheat
ingredients with no visual negation reads as incompetence.

**Fix — ban the vocabulary.** `draft`, `adaptation`, `rewrite`, `compliance
scan`, `output`, `the check`, `this rewrite` are forbidden in anything a viewer
reads. They are already the right shape for `content_rules.banned_phrases`, so
this is a data change, not a code one.

**Fix — a hook library with actual range.** The hooks that hold best are
identity calls, contrarian statements, open loops and confessions, under ~12
spoken words. The current opener — *"Your screen hid the texture cue"* — is none
of these, and it does not match the voiceover's own first line (*"Phone locked
mid-recipe?"*), which is better. Rotate deliberately:

| Type | For RecipeFix |
|---|---|
| Identity | "If you bake gluten-free, you have made this mistake." |
| Contrarian | "Your flour blend is not the problem. Your dusting flour is." |
| Open loop | "This recipe says gluten-free. One line in it is not." |
| Confession | "I contaminated a whole batch and did not notice for a week." |
| Cost-first | "You can fix this. It will cost you crisp edges." |

The last one is Halyard's real differentiator — it already writes *"Cost: less
structure, so edges may crack"*, which almost nobody in this niche does. Lead
with it.

**Fix — the before state must read as wrong.** Slide 1 needs a strike-through,
a red/negative treatment, or the word ORIGINAL doing far more work. The
`transformation_diff` template exists for exactly this and the carousel opener
does not use it.

## 7. Hashtags, deliberately.

TikTok got 4, Instagram 4, both X posts **0**. Zero on X may be correct; zero by
accident is not. Make it a per-platform decision in `platform/strategy.ts` with a
stated reason, the way `skip` already works for variants.

---

## Order of work

1. **Give the image templates the creative direction** — 90% of output is blind
   to a working director
2. Hold the hook at frame 0 + per-platform opening budget
3. Re-enable the opening rule on YMIN — it catches #2 on the file that shipped it
4. Refuse truncation; fit to the box
5. Banned inward vocabulary + hook-type rotation
6. Carousel composition: centre, directional cue, swipe prompt
7. Imagery — the one that needs a camera, not a commit

1–4 are verifiable against the files already in `media-review/2026-08-29/`,
which is why they come first: the same render that failed can prove the fix.
