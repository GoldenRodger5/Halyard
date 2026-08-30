# How the agents are actually ordered, and why it produces uncomposed work

Traced from `apps/worker/src/handlers/generate.ts`, not from the docs. Line
numbers are where each call sits today.

## What the code does now

| # | Line | Agent / step | What it is given | What it produces |
|---|---|---|---|---|
| 1 | 860 | `selectFormat` | account, recent formats | which shape (quiz, history…) |
| 2 | **874** | **`writeDraft`** | the **idea**, platform | **the caption** |
| 3 | 1076 | `selectTypography` | visual language | card faces |
| 4 | **1128** | **`writeToFormat`** | subject, audience | **the piece's actual content** |
| 5 | 1166–1183 | `subjectFromFormat` → `photographicSubject` → `generateHeroImage` | the format's opening slot | the photograph |
| 6 | 1230 | `slidesForFormat` | filled slots | carousel slides |
| 7 | 1387 | `videoForFormat` | filled slots | composition + props + narration |
| 8 | 1481 | `chooseVideoComposition` | artifact | fallback composition |
| 9 | 1523 | `directVoice` | brief | delivery settings |
| 10 | **1604** | **`writeVoScript`** | **`draft.body`** — the caption | **the voiceover** |
| 11 | 2023 | `chooseOpening` | hook text | opening composition |
| 12 | 2099 | `beatsForRender` | plan | render beats |
| 13 | **2344** | **`runHookStage`** | the finished draft | **a better first line** |

## Four ordering faults, in severity order

### 1. The caption is written before the content exists

`writeDraft` (line 874) runs **250 lines before** `writeToFormat` (line 1128).

So the caption is written from the *idea* — a title and an angle — and the
piece's actual content is written afterwards, independently. Two drafts of the
same piece, neither aware of the other. A caption that says "three things about
flour" and a video that asks five questions are both correct and describe
different pieces.

**A caption is a description of the thing. It cannot precede the thing.**

### 2. The voiceover is written from the caption, not from the content

Line 1604 passes `body: draft.body` to `writeVoScript`.

The caption was written for a feed, from the idea, before the content existed.
The voiceover is then derived from *that*. So the words a viewer hears are two
removes from the words on screen — which is exactly the defect §306 found and
patched for the format path (`videoForFormat` builds its own narration from the
slots), leaving the artifact path still doing it the old way.

Two narration systems now exist. That is not a design; it is a repair that did
not reach the whole surface.

### 3. The hook is optimised last, after the piece was built around a different one

`runHookStage` sits at line 2344 — after the composition, the images, the
voiceover and the beats.

The hook is the single most consequential line in a short video; every channel
brief in `channels.ts` says the viewer decides in the first half-second. Choosing
it after the piece has been designed around a different first line means either
the new hook is ignored, or the piece no longer matches its own opening.

### 4. The picture is chosen before the scenes exist

`generateHeroImage` (line 1183) runs before `videoForFormat` (1387).

§313 already moved it *after* the content, which fixed a real bug — the picture
used to come from an unrelated artifact headline. But it still precedes any
description of the piece's scenes, so one photograph is generated for a video
whose beats are not yet known. A hook and a payoff wanting different grounds
cannot have them.

## What the docs say it should be

`HALYARD_CREATIVE_GAP_AUDIT.md` §7:

> `signal/discovery → idea → strategy → concepts → selected concept →
> **creative brief/storyboard** → platform creative plans → assets →
> voice/music/SFX → timeline → platform render variants → QA → correction →
> approval → scheduling/publish → metrics → learning`

The important word is **storyboard, before assets and before voice**. The docs
have been right about this since before the screenplay layer was written; the
code has never had that step.

`CREATIVE_STUDIO_BUILD_PLAN.md` says the same and adds *"first-class
storyboard/beat representation"* as a named gap.

## What an expert social-media team would actually do

A team producing this work has a fixed order, and it is not the one in the code.

1. **Brief.** What is this piece for, who is it for, what does it have to do.
   → `selectFormat` + the Brain. *Exists.*
2. **Research.** Find the facts and the *real sources*. Nothing is written
   before this.
   → **Missing.** This is why the Kinolog quiz fails on 404s: the writer is
   told to cite and has never been given a source, so it invents URLs. No
   amount of retrying fixes an agent asked to remember something it was never
   told.
3. **Script.** Write the content — the questions, the answers, the story.
   → `writeToFormat`. *Exists, runs too late.*
4. **Storyboard.** Stage it: scenes, emphasis, what is said versus read, what
   the ground is, what moves, what is marked, what the score does.
   → `writeScreenplay`. *Exists, not in the pipeline.*
5. **Assets.** Now the pictures, because now you know what each scene needs.
   → `generateHeroImage`. *Exists, runs before the storyboard.*
6. **Voice, music, sound.** Read the script; score the storyboard.
   → *Exists, reads the caption instead.*
7. **Assemble and QA.**
8. **Caption last.** A caption describes the finished piece, and on most
   platforms it is written after seeing the cut.
   → `writeDraft`. *Runs first.*

The current order is roughly **8 → 3 → 5 → 6 → 1**. Almost exactly inverted.

## The single change that fixes most of it

Put the screenplay between step 3 and step 5, and make everything downstream
read it:

```
selectFormat → research → writeToFormat → writeScreenplay
    → assets (per scene)  → voice (from scene.spoken)  → music (from scene.score)
    → marks (from scene.gestures) → render → QA → caption (from the finished piece)
```

Each of those arrows already exists as a function. What is missing is that the
screenplay is not the thing they read.

## What that buys, concretely

- **The voice says what the screen shows**, because both come from the same
  scene, rather than the voice coming from a caption written before the content.
- **A hook can be a hook**, because the piece is designed around it instead of
  having one attached at the end.
- **Assets are per-scene**, so a hook and a payoff can want different grounds.
- **Music becomes punctuation** rather than a bed that runs at one level,
  because `scene.score` says enter, duck, lift, drop out.
- **Marks are earned**, because `scene.gestures` says which moment deserves one
  and why — instead of a capture's tap positions deciding.
- **The caption describes the piece**, because it is written last.

## What is genuinely missing, not just misordered

1. **A research step.** The one true gap. Nothing finds real sources before the
   writer is asked to cite them. Every 404 in the Kinolog run traces here.
2. **Per-scene asset requests.** `generateHeroImage` produces one image per
   piece. A screenplay implies one per scene that needs one.
3. **A concept step.** The docs call for several concepts and a human choosing
   one. The code goes straight from idea to draft, so an operator never sees an
   alternative.
4. **The directors do not read the screenplay yet.** Motion, annotation and
   music still decide independently.

## Honest status

- `writeScreenplay` runs, is checked, and produces producible screenplays for
  two different products.
- It is **not in `generate.ts`**. It has been exercised through a script that
  calls `writeToFormat` first and stages its output, which is the correct
  sequence, but that is not the production path.
- Nothing downstream consumes a screenplay.
