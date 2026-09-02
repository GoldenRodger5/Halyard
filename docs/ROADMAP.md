# Where Halyard is, and what to do next

**Written 2026-09-02.** A companion to `docs/DIRECTION_SPEC.md`, which is the
plan of record for the creative path. That document scoped W1–W12; this one
audits what actually happened, folds in what was found by running the system,
and puts everything left in one order.

---

## What this is for

Halyard exists so that one person gets the output of a social media team.

Not "generate posts" — **run the account.** Attach a product, and the system
learns what it is from evidence, decides what is worth saying, writes it
differently for each platform, makes the pictures and the video and the voice,
checks its own work against rules it cannot argue with, and hands a human
something worth approving. It is autonomous up to the point of publication and
never past it.

The measure of success is not that it produces content. It is that the account
it runs would be indistinguishable from one run by a good team — consistent,
specific, worth following — and that a founder spends minutes a day on it
instead of a day a week.

---

## Where we actually are

Everything below is counted from the database, not from intent.

### Made

| media | made | rendered | failed | **published** |
|---|---|---|---|---|
| video | 47 | 23 | 32 | **0** |
| text | 11 | 6 | 0 | **0** |
| image | 7 | 5 | 0 | **0** |

### By format

Seven of eleven formats have produced a finished render: `history`, `quiz`,
`myth_fact`, `origin`, `comparison`, `behind`, `recipe`.

`tips` has been attempted three times and rendered zero — both failures were
environmental (an orphaned render, an unreadable voiceover) and both causes are
now fixed.

Three formats have never been attempted, each blocked on an input rather than on
code: `transformation` needs a product artifact and the RecipeFix connector is
returning non-2xx; `walkthrough` needs a screen recording; `poll` is a story.

### The number that matters

**Nothing has ever been published, and nothing currently can be.**

```
0 of 6 accounts can receive a post.
  pinterest  not connected      youtube  not connected
  tiktok     not connected      threads  not connected
  x          needs reconnecting instagram waiting on platform approval
```

Every quality judgement in this system is therefore a **craft opinion**. The
hook scorer defers to measurement "the moment three observations exist"; that
moment has never come. `halyard_empirical` is zero everywhere — correctly, and
not because we chose to wait.

---

## Is "finish short video, then the next channel" the right plan?

**Almost — but the order is wrong in one important way.**

Short video is the right channel to lead with. It is where the reach is, it is
the hardest thing to make well, and it is roughly 80% there.

But *finishing* it in isolation has a ceiling, for a reason that is easy to miss:
**we cannot tell whether it is finished.** The remaining work is polish whose
value nobody can measure — mark density, loop endings, how long a beat should
hold — and each of those is a guess until a real post returns a real number.

So the order is:

1. **Prove the loop once, end to end, on one platform.** Generate → render →
   approve → publish → collect. One complete trace is worth more than any
   further polish, because it converts every later judgement from opinion into
   measurement.
2. **Then finish short video**, with signal instead of taste.
3. **Then the next channel.**

Publishing is blocked on operator actions, so while that is blocked, the
code-side work is: make the output demonstrably good, and close the gaps that
would embarrass a real post.

---

## The order

### Now — unblock publication (operator, not code)

Nothing here is a Halyard change and all of it gates everything else.

1. **Reconnect X** — the token expired 2026-08-23. Fastest path to a first real
   post; the adapter is live and the account is the founder's own.
2. **Connect TikTok** — needs the app-review audit, which is the long pole.
   Start it now because it is measured in weeks.
3. **Instagram** is waiting on platform approval; it is a Creator account and
   **no API can publish to one** (`strategy.ts`). Converting to Business is the
   unlock.
4. **YouTube, Threads, Pinterest** — plain OAuth, minutes each.

### Next — what would embarrass a real post

5. **Verify a render with photographs.** Per-beat photography works (every beat
   carries a `backgroundAssetId`), but the two finished videos rendered as flat
   cards because the *bytes* were never written. Storage is fixed; this needs one
   confirmed render.
6. **The marks are dormant.** Three pieces in a row drew none, because §446
   correctly honours a screenplay that asks for none — and the screenplay always
   asks for none. Either the gesture instruction is too timid or marks are not
   worth having; decide by looking, not by leaving it.
7. **Nothing loops.** §451 asks the screenwriter to bring the last scene's ground
   back to the first, and it obeys in the screenplay — but no rendered piece has
   been checked for it. TikTok rewards replays more than anything else.
8. **The RecipeFix connector is down**, which blocks `transformation` and
   `recipe` — the two formats that demonstrate the actual product.

### Done since this was written

- **§466 — not one caption asked for anything.** Twelve real captions, zero
  questions or invitations. The platform's `primarySignal` reached the format
  writer and never the copywriter, which writes the line people reply to. Fixed
  as *earn*, not *ask*. Found on the way: `question_density` refused **any**
  question in a short caption, so between the two rules a short caption had no
  legal form.
- **§467 — the hook answered its own question.** *"Bread cuts prevent
  blowouts"* is a mechanism, and a mechanism is the answer. Both narrative
  formats now ask for the gap, not the explanation. Plus "And then" as the label
  on every turn, and citation-shaped phrasing with nothing behind it
  (*"Established by BBC Good Food"*, *"2021 salinity testing"*).

- **§468 — the marks were forbidden, not timid.** `generate.ts` never passed
  `locatable`, so the screenwriter was told *"Nothing in the frame can be
  located, so this piece has no gestures"* on every piece it has ever staged.
  §446 then honoured that exactly. The gesture path was dead one argument up
  from where anyone was looking.
- **§469 — the caption ended on a footnote.** *"Wikipedia, Sourdough."* spent
  the most valuable line in the post on provenance the piece was already showing
  on screen. Also wired `preferDomains`, which `research()` has accepted since it
  was written and no caller ever supplied.

- **§471-§473 — the critic became three people, and got a corpus.** The critic
  was one persona, an art director, which is the wrong stance for *would anyone
  stop for this* and *would a cook wince*. Now three, told not to average them.
  And `__fixtures__/realPieces.ts` holds real output with what is wrong with each
  piece — including rows that should pass, which is the only way to show a rule
  is quiet. It corrected the hand critique on its first run.
- **§474-§475 — critique before the render.** Every defect found by reading real
  output this session was visible in the *text*; all were found after a render,
  because that is where the only critic lived. The text critic reads the written
  piece for one call instead of a render, three image generations and a
  voiceover.
- **§476 — an opening the writer would not shorten.** 18 words against a ceiling
  of 12, three times, with the rule in its own brief. Repaired by moving the full
  stop to a clause boundary — but only where the tail can stand as a sentence,
  because splitting *"A, because B"* produces a fragment.

### Then — finish short video

9. **`tips` has never rendered.** Both causes are fixed; confirm.
10. **A capture path for `walkthrough`.** The one format where the footage is the
    claim, and the product demo people actually want.
11. **Series.** The largest *content* gap and the one a social team would name
    first: a brand is a promise repeated. Halyard makes one-offs. Nothing knows
    what "episode 4" means, so nobody has a reason to follow rather than watch.
12. **W11** — fold `creative-director`, `story-architect` and `concept-generator`
    into the screenwriter. Registry hygiene; changes nothing a viewer sees.

### Then — the next channel

13. **Carousel** is the strongest second channel: highest save rate, no
    voiceover, no render pipeline, and `carousel_6` already exists.
14. **Text** works and is cheap; it is the one that keeps an account alive
    between videos.
15. **Story** (`poll`, `behind`) — lowest production cost of anything here, and
    the only channel whose value is the *response*.

---

## What was found by running it, that no test caught

Kept because it is the strongest argument for how to work on this system.

- Three environment gaps in a chain, each hiding the next: no whisper model →
  every `tts` died → no render was ever released → the missing asset directory
  was never reached. **No video had ever rendered locally.** (§457, §459)
- Two workers racing, one with the fix and one without, so a piece's images were
  written and its audio was not — which reads as a storage bug and is not. (§465)
- The daily digest telling the operator to approve things when approving would
  publish nothing. (§461)
- A myth that was true, and a concession that conceded nothing. (§460)
- A card held four seconds ending on a semicolon; "eggplant" and "aubergines"
  four seconds apart. (§463, §464)
- 471 tests skipping silently for want of a database, hiding a real regression.
  (§456)
