# Post types, platforms, and the pipeline

**The short version:** one pipeline, made of stages. The **post type** decides
which stages run. The **platform** is a destination, chosen after, and derived
from what each adapter can actually carry.

## Why post type and not platform

A short video for TikTok, Reels and Shorts is **one production** — same
screenplay, same voice, same music, same render — differing only in a crop, a
caption length, and whether trending audio is reachable. Organising by platform
would build that piece three times.

A caption-only post and a video share almost nothing but a brief. Running both
through one sequence means deciding by `if` at every step, which is what
`generate.ts` does today.

So the split is: **post type decides what is made and which stages run;
platform decides where it goes and what it must be trimmed to.**

## The post types

Deliberately finer than the six channels. The rule for splitting: *two things
are different post types when they need different **stages**, different
**constraints**, or different **destinations**.* Not when they merely look
different.

| Post type | Media | Why it is its own type |
|---|---|---|
| `caption_only` | text | No render, no assets, no voice |
| `caption_link` | text | A link changes cost on X (~$0.015 → ~$0.20), changes where the link goes on every platform, and changes what the copy must do |
| `single_image` | image | Assets + render, no screenplay, no voice |
| `carousel_images` | carousel | A sequence: needs ordering and emphasis, no voice |
| `carousel_mixed` | carousel | A moving slide is a separate render, and constrains every still beside it where one aspect ratio is required |
| `short_video` | video | Every stage |
| `long_video` | video | Chapters, different length budget |
| `story` | image | Disposable, interactive, no save-oriented close |
| `reply` | text | Responds to something; no format to fill |
| `pin` | image | Keyword-forward, and the link is the point |

## Platforms are derived, never listed

`channels.ts` carried a hand-written `platforms` array per channel. It had
**already drifted**: `carousel.platforms` was `['instagram']` while the Threads
adapter had declared carousel support all along, and the TikTok adapter said
`video` only although TikTok has carried photo carousels for years.

Two hand-maintained lists, already disagreeing — gotcha 1 at architecture scale.

`canCarry(postType, platformSupport)` derives it from the adapter's own
`PlatformConstraints`. A platform that gains a capability gains the post types
that need it, with no second list to update.

What it checks, and why each is a real impossibility rather than a preference:

- **format** — the adapter's `supportedFormats` must include it
- **carousel** — a platform taking single media only cannot carry a sequence
- **link** — `linkStrategy: 'bio_only'` means the platform will not carry a link
  in the post. A `caption_link` there is a post whose whole purpose is
  unreachable, not a post with an awkward link
- **runtime** — X caps video at 140s, so a long video is genuinely impossible
  there

### What that derives today

| Post type | Platforms |
|---|---|
| `caption_only` | x, threads |
| `caption_link` | x, threads |
| `single_image` | x, threads, instagram, pinterest |
| `carousel_images` | instagram, threads, **tiktok** |
| `short_video` | tiktok, instagram, youtube |
| `long_video` | youtube |
| `story` | instagram |
| `pin` | pinterest |

**TikTok carousels are new.** The adapter said video-only; TikTok's own Content
Posting API reference documents `/v2/post/publish/content/init/` with
`media_type: "PHOTO"` and *"an array containing up to 35 photo content URLs"*.
Verified against the documentation, not assumed. Every carousel Halyard could
have made for TikTok was silently unavailable.

## The pipeline is stages, selected per post type

`planProduction(postType)` returns the stages that run **and the ones that do
not, with a reason** — because "it did not happen" and "it was not needed" look
identical in a log.

```
brief → research → write → screenplay → assets → voice → music → marks
      → render → qc → caption
```

| Post type | Stages it runs |
|---|---|
| `caption_only` | brief, write, caption |
| `single_image` | brief, write, assets, render, qc, caption |
| `carousel_images` | brief, write, screenplay, assets, render, qc, caption |
| `short_video` | all eleven |

`canStart(stage, completed)` refuses a stage whose input has not run. That is
not defensive tidiness: it is precisely how a voiceover came to be written from
a caption, because nothing required a screenplay to exist first.

## Ordering rules the stages encode

- **Research before writing.** A writer given no sources invents them (§344).
- **Screenplay before assets.** A picture chosen before the scenes exist cannot
  suit any of them.
- **Screenplay before voice and music.** The voice reads the scenes; the score
  is written against them.
- **Caption last.** A caption describes the finished piece and cannot precede
  it.

## Platform variants come last

A short video posted to three platforms is one production and three finishes:

| | TikTok | Reels | Shorts |
|---|---|---|---|
| Opening budget | ~0.5s | ~1s | ~1–2s |
| Caption | 2200 chars | 2200 | description |
| Link | bio only | bio only | description |
| Trending audio via API | no | no | no |

That is a **trim step**, not a separate pipeline.

## Status

- `postTypes.ts` — built, 13 tests, checked against the adapters' real
  constraints
- `productionPlan.ts` — built, 14 tests
- TikTok carousel support — corrected against TikTok's documentation
- **Neither is wired into `generate.ts` yet.** That is the next build, and it is
  the change that makes all of the above real rather than declared.
