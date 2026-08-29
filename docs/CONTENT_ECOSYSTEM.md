# The ecosystem: beyond conversions

An account that only posts "here is a recipe, converted" runs out of road. The
conversions are the product demonstration, and a feed made only of product
demonstrations is a catalogue. This is the plan for the rest of it.

Three separate ideas, in the order they pay off.

---

## 1. Show the actual app

**The gap is one hop, and everything else is built.** Three Playwright capture
flows exist and run on a schedule — `adapt_and_reveal`, `swap_toggle`,
`cook_mode_timer` — and production holds nine captured assets. The card
templates take a `screenshotDataUri`. **Nothing has ever connected them:**
`screenshotDataUri` has no caller anywhere in the repo, so every capture ever
taken has sat in the assets table unused.

That is the single highest-value fix on this page, and it is small.

### What to capture beyond what exists

The flows today capture the *result*. What sells software is the *transition*:

| Flow | What it shows | Why it earns attention |
|---|---|---|
| `adapt_and_reveal` (exists) | Paste a URL → adapted recipe | The core promise, in one shot |
| `swap_toggle` (exists) | Toggling one substitution | Control, not magic |
| `cook_mode_timer` (exists) | Cook Mode running | The moment the phone would have locked |
| **`photo_to_recipe`** (new) | Photograph of a page → parsed recipe | The most cinematic thing the product does |
| **`mode_tour`** (new) | Scaling, nutrition, shopping list | Range — most people know one feature |
| **`refine_in_place`** (new) | "Make it spicier" → the recipe changes | Conversational editing reads as alive |

### The loading problem

Generation takes ~26 seconds and nobody watches a loading spinner. Three honest
options, in order of preference:

1. **Cut it.** The capture already has `wait` steps; the edit skips them. A
   time-lapse card — "26 seconds, sped up" — is honest and standard.
2. **Show the work.** If the app streams its reasoning, that *is* the content:
   watching it identify the gluten sources one at a time is more interesting
   than the finished card.
3. **Never fake it.** Speeding up is an edit; cutting to a result that took
   longer than implied, with no marker, is a claim about product speed nobody
   measured. `EVIDENTIAL_ROLES` already governs this — a `demo` beat must carry
   a real capture, never a generated or misleadingly-cut one.

---

## 2. The quiz format

**The strongest idea here**, because it is the one format that is native to the
platform rather than adapted to it, and because it works without a product
demonstration at all.

> "Five questions in thirty seconds. When was gluten first identified?"

Why it fits Halyard specifically:

- **Deterministic to render.** A quiz is a fixed structure — question, options,
  a beat of suspense, an answer. That is a Remotion composition with data, which
  is exactly what this system is good at. No new rendering technology needed.
- **Retention by construction.** An unanswered question is an open loop, and the
  research on short-form retention says open loops every 10–15 seconds is the
  single most reliable pacing device. A five-question quiz is five of them.
- **Comments by construction.** People answer in the comments. Comment volume is
  weighted heavily, and Halyard already has a comment-reply system.
- **No product claim to verify.** A quiz about food history makes no claim about
  RecipeFix, so it never touches the claims gate — which also means it must
  never *imply* one.

### The one hard requirement

Every question needs a **sourced, checkable answer**. "When was gluten
identified" has a real answer (Jacopo Beccari, 1728) and a citable source. A
quiz that gets a fact wrong is worse than no quiz — it is the most screenshot-
able kind of mistake, and this is an account whose entire pitch is *we know what
is in your food*.

So: quiz facts go through the same evidence discipline as product claims.
Sourced or not published. Gotcha 9 applies here exactly as it does to metrics.

---

## 3. Adjacent content pillars

The ecosystem, in decreasing distance from the product:

| Pillar | Example | Product distance |
|---|---|---|
| The fix | "Your dusting flour is not gluten free" | Zero — this is the product |
| The technique | "How to get gluten-free bread to rise" | One step out; useful alone |
| The science | "Why gluten does what it does" | Two steps; explains the fix |
| The history | "Gluten was identified in 1728" | Three; pure attention |
| The culture | "How paleo went from a diet to an identity" | Three; the widest net |

The rule that keeps this from becoming a general food account: **every pillar
has to end somewhere the product is relevant**, even if the post never mentions
it. A history of gluten-free bread is interesting *and* it is the reason
substitution is hard, which is the reason the product exists.

Distance from the product should also decide the format. The further out, the
less it should look like a product card and the more it should look like
something a person made — which is where the quiz and the archive-image formats
belong.

---

## 4. Captions and type: not everything is a shout

The current caption is 52px, heavy, high-contrast, centre-bottom on every video,
and the layouts default to display weights. That is right for a **hook** and
wrong for everything else, and using it everywhere is itself the tell — real
accounts vary emphasis because not every sentence is the most important one.

Proposed hierarchy, driven by beat role rather than applied uniformly:

| Role | Treatment |
|---|---|
| Hook | Display weight, large, high contrast — as now |
| Narration | **Light, ~34–38px, lower contrast**, sitting under the frame |
| Detail / caveat | Small, quiet, close to the thing it qualifies |
| Payoff | Back up to display weight, once |
| CTA | Small and plain — a shouted CTA reads as an advert |

The typography systems already carry `body` and `label` roles at real weights
and nothing uses them for captions. This is a mapping, not new design.

---

## 5. Remotion: confirmed, and here is the actual answer

I recommended staying on Remotion. Having now looked at what the clean AI
content on TikTok is actually made of, I am more confident, and the reason is
different from the one I first gave.

**Composition and generation are different jobs.**

- **Remotion** composes: layout, type, captions, timing, safe areas,
  reproducibility. Deterministic, free to re-render, and diffable.
- **Veo 3.1 / Sora** generate *footage*: a few seconds of moving imagery from a
  prompt. Non-deterministic, $0.15–0.40 per second through the Gemini API
  ($4.50–12 for a 30-second piece), and not re-renderable to the same output.

The polished AI content you are seeing is almost always **both**: generated
footage, composed and captioned by a compositor. Replacing Remotion with a video
model would mean giving up the thing that makes captions land on the right frame.

**So the upgrade path is not "replace Remotion" — it is "give Remotion better
material."** In order of value per pound:

1. Generated **stills** as backdrops (already built — §268 — at $0.04 each)
2. Real **app capture** as the demo beat (already built, unwired)
3. Generated **b-roll clips** for one or two beats, Veo Fast, only where a still
   cannot carry it
4. Never a fully generated video: it cannot hit a caption cue, and it cannot
   show the product truthfully

### NotebookLM

Worth answering directly since it is the right instinct. NotebookLM's Cinematic
Video Overviews use **Gemini 3 as a director, Nano Banana Pro for images and Veo
3 for video** — Gemini makes the structural and stylistic decisions and the
models render them.

**There is no public API.** Consumer NotebookLM has none; the Gemini Notebook
API is enterprise-preview only. An unofficial Python wrapper exists and drives
the web app, which is fragile and outside its terms — not something to build a
publishing pipeline on.

But the useful part is that **the components are all available directly**, and
Halyard already has the piece NotebookLM's architecture is actually built
around: *a director that makes structural decisions before anything renders.*
That is what §228's Creative Director is. Halyard is closer to this design than
it looks; what it lacks is the generative visual layer underneath, which is the
ordered list above.
