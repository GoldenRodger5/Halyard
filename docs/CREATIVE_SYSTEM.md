# The Halyard creative system

What actually exists, as of 2026-08-28. Written against the code, not against
the plan — where something is missing or blocked it says so.

---

## The shape of a decision

A piece of content is produced by a chain of decisions, each recorded, each
answerable against the alternatives it beat.

```
signal → idea → strategy decision → concept (async) →
  treatment → visual language → typography → opening → motion →
  voice direction → audio direction → platform variants →
    render → TTS → QC → correction → approval → publish
```

The **creative brief** (`creative_briefs`) is the record of the middle of that
chain, and `content_items.brief_id` is what makes it findable from the thing it
produced. `platform_variants` records what the same concept should become
everywhere else.

### Who decides what

| Decision | Where | Kind |
|---|---|---|
| Which ideas exist | `agents` → `idea-generator` | model |
| Whether to post at all | `strategy/decide.ts` | deterministic |
| Several ways in | `concepts/generate.ts` | model |
| Which concept | operator, in the Studio | human |
| Story shape | `creative/treatments.ts` | deterministic |
| **The look** | `creative/director.ts` | deterministic |
| Type | `creative/typography.ts` | deterministic |
| Opening layout | `creative/openings.ts` | deterministic |
| How a beat moves | `creative/motion.ts` | deterministic |
| How it is read | `audio/voice.ts` | deterministic |
| Which bed | `audio/director.ts` | deterministic |
| Where effects go | `audio/sfx.ts` | deterministic |
| What each platform gets | `creative/variants.ts` | deterministic |
| The words | `generation/copywriter.ts` | model |
| Whether it is good enough | `qc/*` | deterministic |

The governing rule is unchanged: **agents perceive, code decides.** A model
writes and reads; every judgement that can be made from data is made from data,
so it is consistent and can explain itself.

---

## The creative vocabulary

Deliberately small enough to hold in your head, and large enough that an account
does not read as one show.

**13 visual languages** — `editorial_cut`, `documentary`, `kinetic`,
`product_led`, `typographic`, `editorial_food`, `energetic_short`, `cinematic`,
`playful`, `clean_modern`, `bold_social`, `premium_instructional`,
`fast_cut_creator`. Each is a distinct motion behaviour; `motion.test.ts` fails
any two that produce the same signature.

**6 typography systems** — `editorial_serif`, `display_contrast`,
`grotesque_punch`, `creator_condensed`, `geometric_clean`, `warm_humanist`.
Built from seven SIL OFL families bundled with the render package (see
`packages/render/assets/fonts/PROVENANCE.md`).

**7 openings** — `statement`, `kicker_headline`, `question`, `numeral`,
`fragment`, `over_media`, `cold_open`.

**7 treatments** — `before_after`, `myth_fact`, `process_montage`, `listicle`,
`how_to`, `comparison`, `feature_demo`.

**Compatibility, not chaos.** `TYPOGRAPHY_FOR_LANGUAGE` and `LANGUAGE_OPENINGS`
say which combinations are coherent, and every language has at least three
typography systems so the rotation is real rather than an alternation.

**Recency is the mechanism.** Language, typography and opening are each chosen
least-recently-used among what fits, from the account's own last six briefs. A
scoring system that lets a strong default win forever reproduces exactly the
problem it was built to solve.

---

## Rendering

Remotion, 1080×1920 at 30fps, with a 1920×1080 twin for YouTube long-form.
`geometry.ts` resolves safe areas, caption band, content column and type scale
from the frame, so the landscape compositions share their components with the
portrait ones — one implementation to be right.

Motion primitives: 6 entrances, 5 camera moves, 4 transitions. A transition is
implemented as a `Sequence` overlap, so it cannot desynchronise from the beat it
belongs to. Parallax is genuinely two planes moving against each other.

Text is fitted to the band **at the size it is actually drawn** — the register's
multiplier is passed into the fit rather than applied after it.

---

## Audio

Two-pass loudness normalisation to −14 LUFS with a sidechain duck. Bed level and
duck depth come from the Music Director rather than a constant.

`music_beds` and `sound_effects` both ship **empty**, and both report why they
are silent rather than substituting. Inventing a licensed track or a licensed
whoosh is the same class of fabrication as inventing product evidence.

---

## What is blocked, and on whom

| Blocked | On | Exactly what is needed |
|---|---|---|
| Music in any video | purchase | Licensed beds imported into `music_beds` with `licence`, `licensor` and any `platform_restrictions`. The mixer, ducking and selection are done and tested. |
| Sound design | purchase | The same for `sound_effects`, tagged by `role`. |
| YouTube custom thumbnails | OAuth scope | `thumbnails.set` needs `youtube` or `youtube.force-ssl`; the channel granted `upload`, `readonly`, `analytics`. Widening it changes what the compliance audit covers and grants full channel write access. |
| YouTube long-form publishing | provider | The compliance audit submission. |
| Landscape and thumbnail templates | operator review | Seeded **disabled**. Enable in `templates` once you have looked at a render. |
| Concept generation at scale | credit | The Anthropic key is out of balance; `LLM_PROVIDER=openai` works and was used for the production run. |

---

## Running it

```
# The full creative chain against production data, publishing disabled.
LLM_PROVIDER=openai npx tsx apps/worker/src/index.ts
```

`settings.publishing_enabled` is the global kill switch and is checked before
every publish. Human approval is required per post regardless.
