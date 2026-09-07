# Finishing the pipeline

The plan of record for closing the gap between "built" and "proven", written
2026-09-03 after an audit found that 4 of 10 image templates, 4 of 7 video
compositions and 9 of 11 formats had ever actually run.

The governing rule is the one this repo already runs on, applied to itself:
**a thing is not done because it typechecks. It is done when it has run and
somebody has looked at the output.**

---

## The standard each piece is held to

Not "it rendered". A social media manager would not ship most of what passes a
gate. Every finished piece is read three ways before it counts:

1. **As the scroller.** First frame, first line, first second. Does it earn the
   next two seconds against a thumb already moving? A piece that is merely
   accurate fails here.
2. **As the target user.** Somebody who actually has this problem. Do they learn
   something they did not know, specific enough to act on tonight?
3. **As a peer.** Would a competent social team put their name on it, or does it
   read as automated — uniform rhythm, a topic label, a stock look, a caption
   that asks nothing?

A piece passes when all three hold. Gates catch the failures that are
countable; these catch the ones that are not, which is most of them.

---

## Progress

**Phase A — done.** `transformation_diff_1x1` and `scaling_math` render well and
ship as they are. `youtube_thumbnail` drew correctly and exposed §534: the
pipeline queued every thumbnail with text and no picture, so every one was dark
type on cream with half the frame empty. It now takes the hero image the piece
already has. Two video compositions turned out to be reachable by nothing
(§535).

**Phase B — done. All eleven formats have now produced a finished render.**

| | |
|---|---|
| `poll` | **done, and it exposed §536** — the whole `story` channel could be selected and produced no render. `story_card` now exists, is enabled product-neutrally, and Halyard's first story is a photograph of the cake with the question over it and two tappable halves. |
| `walkthrough` | **done, by routing around the blocker (§540).** `adapt_and_reveal` requires a sign-in nobody has credentials for; `swap_toggle` requires none, captures against the live product, and demonstrates the thing the product is for. Getting there cost three fixes: §538 (grey padding), §539 (the payoff was cut), §538b (no whisper model on a native worker). |

---

## Phase A — render every unrun template, free

Nine artefacts have never been produced. No model calls are needed to find out
whether they draw correctly, because the render layer takes fixture props.

| | never rendered |
|---|---|
| image | `transformation_diff_1x1`, `scaling_math`, `youtube_thumbnail` |
| video | `Walkthrough`, `ScalingMath`, `SubstitutionExplainer` |
| image, out of scope | three Pinterest templates — excluded by decision |

Render each from fixtures, open every output, fix what is wrong. This is where
§509–§512 and §519 came from last time: every defect found that way was
invisible to the tests and obvious in the picture.

## Phase B — generate the two formats nobody has run

`poll` and `walkthrough` have zero pieces. `walkthrough` additionally needs a
product capture, which is the reason it was skipped. Generate each for the
product it suits, and put the result through Phase A's three readings.

**Phase C — first pass done, on 24 real captions across both products and
three platforms.** Two defects found by reading rather than by any gate: a
dropped full stop that made every downstream measurement wrong (§543), and a
structural tic — 42% of captions hinging a sentence on "so" (§544). Both fixed,
both validated against the corpus rather than fixtures.

## Phase C — read every channel as its own audience

The platforms are not interchangeable and treating them as one feed is the
fastest way to look automated.

| platform | what the piece is competing against | the specific failure to hunt |
|---|---|---|
| TikTok | sound-on, fast cuts, a hook in the first 0.5s | an opening that explains before it provokes |
| Instagram | a saveable carousel or a polished reel | a caption that gives no reason to swipe |
| X | text alone, in a hostile timeline | a thread-shaped idea squeezed into one post |
| YouTube | a thumbnail and a title, then retention | a thumbnail nobody has ever looked at |
| Threads | conversation, not broadcast | a post that invites nothing |

## Phase D — fix, retest, repeat

Nothing moves to the next format until the current one passes all three
readings. Findings are recorded in `DECISIONS.md` as they are fixed, and this
file's tables are updated with what actually ran.

---

## Budget

$15/day, raised 2026-09-03. Phase A is free. Phase B is roughly two videos and
a deck, ~$1.20. Phase C costs nothing but attention. Every paid call is
recorded through `recordPaidCall`, so the ledger is the source of truth for
what this cost.
