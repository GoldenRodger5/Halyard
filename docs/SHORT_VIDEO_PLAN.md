# Short video — the working plan

The one channel we are on. Nothing moves to `text_post`, `carousel` or
`long_video` until this is production-ready.

Status legend: **done** · *in progress* · not started

---

## The template, and why it is a template

The walkthrough (§298) is the shape everything here reuses: a ground, a subject,
type, and marks that point at things. Swapping what fills those slots is how one
composition becomes many videos — a cook-mode recording and an adaptation
recording are the same template with a different capture, background and voice.

Every slot is a prop, so swapping is a data change and never a new composition:

| Slot | Prop | Swappable today |
|---|---|---|
| Screen recording | `screenSrc` | **done** |
| Ground | `backgroundDataUri` | **done** |
| Headline | `headline` | **done** |
| Callouts | `callouts` | **done** (derived from capture steps) |
| Wordmark | `wordmark` | **done** |
| Type system | `typography` | **done** |
| Voice | `audioSrc` | *prop exists, nothing supplies it* |
| Music | — | not started |
| Logo mark | — | not started (wordmark is text only) |

---

## Open work, in order

1. ~~**Real recipes, not the demo card.**~~ §303. `requires` was declared and
   never read, so every capture ran signed out. It runs the sign-in first now,
   in the same context, and refuses the capture if the sign-in fails rather than
   filing signed-out footage as evidence of the signed-in product.
2. ~~**Touch points land where the tap happens.**~~ §303. The runner records the
   clicked element's centre as a fraction of the viewport, and
   `calloutSourceFromCapture` maps it into **cut** time — the raw offset would
   have pointed at the right control at the wrong moment.
3. **Voice.** `audioSrc` is a prop on every composition and nothing fills it for
   quiz or walkthrough. TTS already works; it is a wiring job.
4. **Music.** Six licensed beds and a selector exist (`selectBed`). Nothing
   mixes one under a short video.
5. **Ken Burns and cuts.** One still for 20 seconds is a slideshow. Multiple
   images, one per beat, cut on sentence boundaries from the word timings §270
   already carries.
6. **Logo.** The wordmark is text. A product supplies a mark; nothing renders one.
7. **UI source picker.** `chooseMediaSource` (§296) decides; an operator cannot
   yet override it per beat from the Studio.

---

## The formats this channel runs

`quiz` **done** (five treatments, §302) · `history` · `tips` · `myth_fact` · `origin` · `transformation`

Only `quiz` has its own composition (§289). The rest render as cards today, which
is why they look like slideshows — each needs a composition or a shared one that
takes their slots.

---

## Credentials

`products.capture_credentials` is jsonb: `{"email","password","loginPath"}`.
Never logged, never in a job payload, never returned to the browser. A capture
reads it at run time and nothing else touches it. The UI to enter it is **not
built yet** — set it directly for now.
