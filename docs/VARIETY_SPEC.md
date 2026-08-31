# Variety — the spec

**The question this answers:** an account posts three times a week. That is 150
videos a year. What stops them all looking the same?

---

## 1. Where it stands, measured

| Format | Composition | Treatments |
|---|---|---|
| `quiz` | `Quiz` | **5** — `stack`, `rail`, `grid`, `spotlight`, `versus` (§302) |
| `walkthrough` | `Walkthrough` | 1 |
| `history`, `tips`, `recipe`, `myth_fact`, `comparison`, `origin`, `transformation`, `poll`, `behind` | `Narrative` | **5** — `statement`, `anchored`, `split_rule`, `label_lead`, `quiet`, chosen per *beat* by role (§308) |

**Corrected while building.** The first draft of this table said `Narrative` had
one treatment. It has five, and §308 chose between them by the same fit-then-
recency rule §302 used. The range was already there.

What was missing in **both** was the same thing: each chooser seeded its recency
list empty on every call, so both varied *within* a piece and repeated *across*
pieces. The defect was never a shortage of treatments. It was that nothing
remembered which had been used.

### The repetition bug, precisely

`quiz.tsx` picks a treatment per *question* and seeds the recency list empty:

```ts
const used: QuizTemplateId[] = [];   // ← per piece, every time
```

So within one video the questions vary, and **across two videos question one
always gets the same treatment**. Nothing anywhere persists which treatment a
render used, so nothing could do better. Two quizzes generated back to back with
the same filters are visually identical.

That is the defect to fix first. It is also the cheapest.

---

## 2. Three mechanisms, in order of leverage

### 2.1 Recency across pieces — *the guarantee*

A treatment is chosen by **what can carry this piece**, then **what has been
used least recently** — §302's rule, extended past the edge of one video.

The guarantee this buys, stated so it can be tested: **the same format, briefed
the same way, does not repeat a treatment until every treatment that can carry
it has been used.** Five quiz treatments means the sixth quiz may look like the
first, and not before.

Recency must be *persisted*, so:

- `renders.treatment text` — what this render actually drew.
- Written where the composition is chosen, read back as the recency list.

Deterministic and explainable, never random. Random reruns the same treatment
twice often enough to notice and cannot tell an operator why — §302's reasoning,
unchanged.

### 2.2 Treatment families per format — *the range*

One composition per format, several treatments inside it. This is exactly the
`quizTemplates.tsx` shape and it is the architecture to extend, **not** twenty
new Remotion compositions: a composition is a registration, a schema, a database
row and a coverage test, and twenty of them is twenty times the surface for the
same result.

A treatment declares what it can carry, the way `QUIZ_TEMPLATE_INFO` does. A
treatment picked for a piece it cannot draw is how an answer ends up off screen.

**What is worth building, as a creative director would put it.** Each of these is
a genuinely different *way of arguing*, not a different animation:

| Format | Treatments | Why they differ |
|---|---|---|
| `history` | `timeline` · `reveal` · `document` · `then-now` | A date on a line; a claim then its year; an archival card; past beside present |
| `walkthrough` | `numbered` · `checklist` · `progress` · `over-footage` | Big numerals; items ticking off; a bar filling; text over the capture |
| `tips` | `countdown` · `stack` · `single` | Counting down builds; stacking accumulates; one tip at size is a stronger claim |
| `myth_fact` | `strike` · `split` · `correction` | Struck through; two panels; a correction slip over the myth |
| `comparison` | `side-by-side` · `wipe` · `bars` | Both at once; one becoming the other; measured against each other |
| `transformation` | `diff` · `reveal` · `stack` | The change marked; the after arriving; both held together |

The rest — `recipe`, `origin`, `poll`, `behind` — keep `Narrative` until there is
a reason. A treatment invented because a table had a gap is decoration.

### 2.3 Seeded variation within a treatment — *the texture*

Remotion ships `random(seed)`: deterministic pseudorandom from a string or
number. Same seed, same output, across every thread of a render — which matters,
because Remotion renders on many threads and `Math.random()` would differ
between them and tear the video.

Seeded on the **content item id**, so:

- the same piece re-rendered is byte-identical, which is what makes approval mean
  anything;
- two pieces differ in the small things a treatment leaves open — entrance
  direction, accent placement, grain, which corner a mark sits in.

This is the layer that stops two pieces *in the same treatment* reading as
copies. It changes nothing a gate checks: never the palette, never the faces,
never a contrast ratio.

**No new dependency.** `random` is already in `remotion`.

---

## 3. What must not change

- **Palette and type come from the product** (§296). A treatment that chose its
  own colours would make a recipe adapter and a film log look alike, which is
  what the brand pipeline exists to prevent.
- **A re-render is identical.** Every variation is a pure function of the piece,
  never of the clock — otherwise approving a video approves nothing.
- **Nothing is random at render time.** `random(seed)` is not randomness; it is a
  hash. The distinction is the whole reason it is safe here.

---

## 4. Order of work

| # | Step | Why here |
|---|---|---|
| 1 | `renders.treatment` + write it | Nothing can vary across pieces until something remembers. |
| 2 | Cross-piece recency for the quiz | The machinery exists; this is the wiring. Proves the guarantee end to end on the one format that already has a family. |
| 3 | ~~`Narrative` treatments~~ → **`Narrative` recency** | It already had five. It needed the history, like the quiz. Nine formats at once — the single highest-leverage change here. |
| 4 | `Walkthrough` treatments | Its own composition already; add the family. |
| 5 | Seeded within-treatment variation | Texture, once structure varies. |
| 6 | Show it in the console | The Gallery piece says which treatment and why; Master ▸ Templates shows the pool and what has been used lately. |

---

## 5. Definition of done

1. Two pieces of the same format, briefed identically, back to back, **do not
   share a treatment** — asserted by a test that runs the chooser N times.
2. A treatment is never chosen for a piece it cannot draw.
3. Re-rendering a piece produces the same treatment and the same seeded details.
4. Every treatment in a family is reachable — a treatment nothing can pick is
   dead code, and `videoTemplateCoverage.test.ts`'s lesson applies to treatments
   as much as to compositions.
5. The operator can see which treatment was used and why.
