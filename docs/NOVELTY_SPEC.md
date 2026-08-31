# Not saying the same thing twice

**The complaint, precisely:** run the pipeline twice and it returns the same
facts about gluten and asks the same quiz questions. `docs/VARIETY_SPEC.md`
made a piece *look* different. This is about it *saying* something different,
which matters more — a viewer forgives a familiar layout and does not forgive
being told the same fact twice.

---

## 1. Four levels, and we enforce none of them

A social team does not research a topic from scratch each time. They keep a file
of what has already been said, and the next post takes an angle that is left.
Halyard has four places that could hold that file and reads none.

| # | Level | The repetition it causes | Mechanism today |
|---|---|---|---|
| 1 | **Topic** | "gluten history" twice in a fortnight | **Fixed, §403.** `selectIdeas` always refused an idea under 0.15 novelty and had never once refused one: nothing wrote `ideas.embedding`, so every idea scored the unmeasured 0.5 and cleared the floor. `embed.ts` writes the vectors; the floor was already right. |
| 2 | **Angle** | Same topic, same take | Nothing. The idea's `angle` is written once and never compared. |
| 3 | **Facts** | *The* visible one. Same Beccari/1728 fact every time. | **Fixed, §401.** `ResearchRequest.avoid` carries what the account already published, injected into the prompt rather than filtered after, so the researcher looks elsewhere instead of returning fewer facts. Read from `content_items.claims` by `alreadySaid.ts`. |
| 4 | **Surface** | A new fact asked as the same question | Nothing. The format writer sees no previous questions. |

A fifth level — *how it looks* — was fixed in §394 for video treatments and
§395 for stills. It is the least important of the five, and fixing it first made
the repetition of the other four more obvious, not less.

A **sixth** turned out to sit underneath all of them, and it is the one an
operator sees first: *the photograph*. §402. `heroPrompt` chose a mood by visual
language, `generate.ts` passed `undefined`, and every hero image Halyard has
ever generated carried the same styling clause. Fixed by directing a **shot** —
framing, light, surface — with each axis rotated against `assets.shot`.

### The same shape, six times

Every one of these was a mechanism that existed and whose answer nothing
supplied. `renders.treatment` did not exist; the still recency list was seeded
empty; `content_items.claims` was written from the beginning and never read;
`ideas.embedding` was read and never written; `assets` had no column for how a
picture was taken. **In no case was the rule wrong.** The rule was asked a
question it had no data to answer, and returned the same answer every time —
which is indistinguishable from working, right up until an operator reads two
posts in a row.

### The memory already exists

`content_items.claims` holds every fact a piece used, with its text and source.
**22 of 39 pieces have them.** Nothing ever reads them back — the same shape as
`renders.treatment` before §394: the thing that would enable variety is
recorded, and no one consults it.

```json
[{"text": "Check at 22 minutes instead of 35 to avoid overbaking",
  "source": "explanations[2]"}]
```

---

## 2. What to build

### 2.1 Facts — exclude what has been used *(highest leverage)*

`ResearchRequest` gains `avoid: string[]` — the claims recent pieces already
made — and the prompt says so plainly: *these have been used; find something
else.*

Not a filter after the fact. Asking the model for ten facts and discarding the
seven we have used produces three, then none, and eventually a piece that
cannot be written. The exclusion belongs **in the request**, where it changes
what is proposed.

Bounded by recency and by product, because a fact used a year ago is available
again and a fact used yesterday is not.

### 2.2 Surface — exclude recent openings

The format writer gains the same treatment for its **hooks and questions**: the
last N openings, with the instruction not to repeat their shape or their
subject. A new fact asked as "What year was X first identified?" for the fourth
time is still repetition.

### 2.3 Topic — measure novelty without an embedding API

`noveltyScore` needs `ideas.embedding` and nothing writes it. Two options:

- **Embed on write.** Correct, and adds an API call and a dependency per idea.
- **Token distance against recent idea titles and angles.** Deterministic, free,
  explainable, and enough to stop a literal repeat.

Take the second. It is the same reasoning as choosing recency over `random()`
for treatments: a deterministic rule that can be explained beats a better score
nobody can audit. `noveltyScore` keeps its contract — the *unmeasured* branch
simply stops being the only branch.

### 2.4 Angle — rotate deliberately

A topic with several angles is an asset, not a problem. The idea proposer should
be told which angles on a subject are spent, the same way research is told which
facts are.

---

## 3. What must not happen

- **Never invent a fact to be novel.** Every claim still goes through
  `verifySource` and the citation gate. Novelty is a *preference among verified
  facts*, never a licence to relax verification.
- **Never fail to produce because everything is used.** Exhausting a subject is
  a real state and it means *pick a different subject* — not lower the bar. The
  run says so rather than writing something weaker.
- **Deterministic, and explainable.** "This fact was used on the 12th" is a
  reason an operator can check. A random draw is not.

---

## 4. Order

| # | Step | Why here |
|---|---|---|
| 1 | Facts exclusion | The visible repetition, and the memory already exists. |
| 2 | Recent openings | Cheap once the same reader exists. |
| 3 | Topic novelty | Makes `noveltyScore` mean something for the first time. |
| 4 | Angle rotation | Depends on 3. |

## 5. Done when

1. The same subject briefed twice produces **different facts** — asserted with
   the second run given the first's claims.
2. A fact is never excluded into non-existence: a subject with nothing left says
   so, and does not lower the sourcing bar.
3. Every exclusion is visible in the run — which facts were avoided and why.

---

## 6. The photograph (§402)

The axis an operator sees before reading a word, and the one that had no
mechanism at all.

`heroPrompt` looks a mood up by visual language; `generate.ts` passed
`visualLanguage: undefined`. So every hero image Halyard has ever generated
carries `DEFAULT_MOOD` — *"natural light, honest and unstyled, shallow depth of
field"*. Nine moods written, one ever used.

Passing the language would barely have helped: `MOOD_FOR_LANGUAGE` is keyed on a
vocabulary that is **not** `VISUAL_LANGUAGES`. Two of its nine keys
(`editorial_calm`, `geometric`) are not visual languages, and six real languages
have no entry — the map could only ever have hit on seven of thirteen.

### Why this is the axis that shows

The generated hero photograph is not decoration. `render.ts` reads it back —
`assets` joined through `content_items.attached_asset_ids` where
`source = 'generated'` — and passes it as `backgroundDataUri`, which every quiz
and narrative composition renders **full-bleed behind the type**, with a scrim
scaled to its measured luminance.

So one styling string for every image meant one look for every video:

```
chooseShot → heroPrompt → gpt-image-1 → assets.shot
           → attached_asset_ids → render.ts → backgroundDataUri
           → the full frame behind every word
```

### A shot, not a mood

A mood varies the light. Ask a photographer for two pictures of one loaf and
they do not relight it, they **move**.

| Axis | Vocabulary |
|---|---|
| **Framing** | `overhead_flat_lay` · `macro_detail` · `three_quarter_plate` · `wide_table` · `low_hero` · `hands_at_work` |
| **Light** | `window_soft` · `hard_sun` · `overcast_even` · `warm_low` · `cool_morning` |
| **Surface** | `worn_wood` · `pale_marble` · `linen_cloth` · `dark_slate` · `matte_ceramic` |

Each axis rotates on **its own** history, least-recently-used first. Rotating the
combination instead would let framing repeat three posts running so long as the
triple differed — precisely the sameness that gets noticed. Per-axis rotation
means the next picture is framed, lit *and* set differently.

Recorded as `framing/light/surface` on `assets.shot` (migration 0072), read back
by `recentShots`. Fit before recency, as everywhere else: a format may refuse a
framing that would misrepresent it — hands mid-action promise a method, which is
right for a walkthrough and a lie on a quiz.

Pure function of its inputs, so a re-render reproduces the picture rather than
quietly shooting a new one.
