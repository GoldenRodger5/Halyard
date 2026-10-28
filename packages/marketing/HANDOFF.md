> **2026-10-28 owner steering:** Plan and review the posting batch collaboratively every two weeks. Unattended creation is not the objective. The owner rejected the Roger finished mix as robotic and the current caption-over-motion format as uninteresting. All seven remain held; three current Roger cuts are explicitly rejected. No replacement voice is selected. Read `CREATIVE_RESET_2026-10-28.md` first. Eight real continuous auditions and the critical review are in `runs/2026-10-28/voice-quality/index.html`. Do not make another batch by substituting a preset voice or more generic stock. No public posting/scheduling authorization.

# Marketing pipeline: full handoff (2026-10-27)

Written for whoever picks this up next (human or agent). Read this whole file first, then
`PLAYBOOK.md` (plan, cadence, review lessons) and `CREATIVE_STRATEGY.md` (sourced research on
sound, platforms, pacing, AI labels, the bridge to the product).

- Repo: `/Users/isaacmineo/PROJECT_2025/halyard-marketing-lean-lane`, package
  `packages/marketing`, CLI `pnpm mk …`.
- Branch: `feat/marketing-lean-lane-poc-20261026`, draft PR #100. Everything is committed and
  pushed.
- Product being marketed: RecipeFix (`/Users/isaacmineo/PROJECT_2025/recipe-fix`,
  https://recipefix.app). Its `CLAUDE.md` describes the product; never change that repo from
  marketing work without the owner.

---

## 1. The mission and the owner's bar

Build an autonomous organic marketing machine for RecipeFix. It:
- finds topics and makes varied posts (list videos, carousels, image + answer threads, recipe
  videos, before/after transforms, later app intros);
- verifies every claim against a quoted primary source;
- reviews each post like a viewer and improves it;
- schedules a two-week buffer across TikTok, Instagram, YouTube Shorts, X and Threads
  (Pinterest later), via Blotato.

**Goal:** views, genuinely helpful content, not seeming AI-made, followers, and eventually
RecipeFix users.

**The owner's words, as standing preferences:**
- "Not dumb, not cringe, not AI. Looks like a pro marketing team posts it."
- Don't be too strict; the videos largely look great. The owner is the final gate, not the
  AI reviewer.
- **Calm and readable:** "still moving too fast" (twice). Slow pacing, soft motion.
- **No "bing" sound effects.** They are removed.
- **No clip-art / Canva look and no blank space.** Paper cards, boxes and pills were
  rejected; full-frame moving imagery with captions was approved.
- **Variety in the queue:** never the same look back to back.
- **Hooks must make sense** ("Cook halal? Check these 5" was rejected).
- **Move fast; don't hedge or patch.** Find the root cause and change the system.
- In the last session the owner said "no more agents", meaning: do the work directly.

## 2. Hard rules (never break)

1. **Never post publicly or schedule live posts.** No Blotato live publishing until the owner
   says the RecipeFix accounts are connected and approves posts. The current Blotato
   workspace belongs to Moment Circuit (another brand). Never post or draft from it.
2. **Every on-screen claim is sourced.** List items point at `facts/food-facts.yaml` entries
   with a verbatim `source.quote`. Highlights must appear verbatim in the quote; the code
   throws otherwise (`quoteExcerpt`). Don't invent numbers.
3. **Copy rules:**
   - no em dashes;
   - no forbidden claims from the RecipeFix knowledge pack ("any recipe", "safe for celiacs",
     "tested", drifting counts, referral promises);
   - no unverifiable teases ("#4 surprises everyone", "most people miss");
   - qualify claims ("some", "classic", "often");
   - allergy content must not read as medical advice;
   - frame diets as cooking around a diet, never weight loss.
4. **AI disclosure:** any generated image or synthetic voice sets TikTok `isAiGenerated` and
   YouTube `containsSyntheticMedia` (`needsAiLabel` in `src/publish.ts`, from asset
   provenance). Keep it.
5. **OpenAI spend:** marketing shares RecipeFix production's OpenAI organization. On
   2026-10-27 the org hit its spend limit and RecipeFix production's OpenAI went down with
   it. The pipeline refuses the shared key unless `MK_SHARED_OPENAI_OK=1`. The owner
   currently allows sharing (raised the limit; "no separate key needed yet"). Keep runs
   modest, and check RecipeFix health if 429s appear.
6. **Git:**
   - never bypass hooks or force-push;
   - commit in small steps with clear messages;
   - downloaded third-party videos (calibration) live in `runs/_calibration/` (gitignored)
     and must never be committed or posted.
7. **Never use publisher photos** from RecipeFix's `saved_recipes` in marketing.

## 3. How to run

```sh
cd /Users/isaacmineo/PROJECT_2025/halyard-marketing-lean-lane
set -a; . /Users/isaacmineo/PROJECT_2025/Halyard/.env; set +a
export MK_SHARED_OPENAI_OK=1
pnpm mk list                      # list ids
pnpm mk batch list all            # render all lists + 3-review critique + owner review page
pnpm mk list check-halal          # one list (default look: native)
pnpm mk critique runs/<date>/<run> # median of 3 viewer reviews
pnpm mk slides quiz <set>         # quiz carousel (IG / TikTok photo / X)
pnpm mk image <fact-id>           # single image + answer thread (X / Threads)
pnpm mk transform tikka-dairy-free
pnpm mk recipe <original-id>
pnpm mk app --voice               # app intro (real screens, ElevenLabs voice)
pnpm mk plan-week --start 2026-11-02   # planWeek({days:14}) via tsx for two weeks
pnpm mk publish <run-dir>         # DRY RUN only (prints Blotato targets). Never --live.
npx vitest run packages/marketing # tests (34)
(cd packages/marketing && npx tsc --noEmit -p .)   # typecheck
```

Outputs go to `runs/<date>/<format>-<id>/`:
- the mp4 and `photos/` (carousel stills);
- `record.json` (posts per platform, QA, sources, assets, disclosures);
- `critique.json`;
- `qa-frames/` and `preview.html`.

The review page is `runs/<date>/review/index.html` plus `v/`. The owner's published copy is
https://claude.ai/artifact/FWLVJ7jyDDh97tpdkUA94o (v2: 7 native lists + 14-day queue). Codex
cannot publish Claude artifacts. Give the owner the local `review/index.html`, or ask them.

**Machine note:** other projects (e.g. `margin-v2-interests`) sometimes run heavy Playwright
suites, with load averages of 300–800. A list render then takes 15+ min instead of ~2.
- Check `uptime` before batches.
- Before starting a batch, check `ps … | grep "cli.ts batch"` for an orphaned old one. Two
  overlapping batches write the same run dirs.
- If you kill a render mid-way, `git restore` any half-overwritten tracked run folder.

## 4. Architecture (what each file does)

- **`src/formats/list.ts`:** the list builder.
  - Reads `facts/lists.yaml`, validates facts and highlights, generates or caches images
    (`generatedPhoto`, OpenAI `gpt-image-2.5-sunburst`, cached in `runs/_cache/img`).
  - Timeline at `READ_WPS` 2.5 (`MK_READ_WPS`).
  - Renders `ListShort` and exports `photos/` stills for a TikTok photo carousel.
  - Builds posts for tiktok, instagram_reel, youtube, x, threads and tiktok_photos, each with
    a `pinned_comment` (the RecipeFix bridge, UTM link).
  - QA (`qaFrame`: OCR read-back, safe zone, contrast, overlap, size), length guard 22–46 s,
    copy rules.
- **`video/ListShort.tsx`:** looks `native` (default), `editorial`, `magazine` and `sticker`.
  - Native: a full-frame photo with slow push/pan, captions in three beats (name → "Hidden: X"
    pill → takeaway + source), and a caption band for contrast.
  - The close is a checklist over a blurred photo with an optional note (allergy caveat).
  - A loop seam fades back to the cover.
- **`src/critique.ts`:** the viewer review.
  - gpt-5.5 via the Responses API, 1 labelled frame per second.
  - The median of 3 reviews; majority votes for cringe and "pro team".
  - Judged within the "no live footage" format.
  - Bar 7/7/6/7 and cringe-free. "Pro team would post" is advisory.
- **`src/qa/image.ts`:** OCR QA (Apple Vision + Tesseract).
  - A word crossing the safe edge is re-read on a safe-box crop before failing (OCR boxes run
    ~40–100 px wide on large type).
  - Single-character boxes inside longer lines are ignored.
  - Duplicate words are attribution, not overlap.
- **`src/schedule.ts`:** `planWeek({ start, days })`.
  - An explicit WEEK template (one video and one static slot a day, per-platform posts).
  - List facts are reserved; one image post per source quote; a list's photo carousel stays
    ≥4 days from its video; a dry format falls back to a neighbour.
- **`src/reviewPage.ts`:** the owner review page (540p previews, score bars, notes, caption,
  sources).
- **`src/publish.ts`:** the Blotato publisher.
  - `--live` requires a "post" critique.
  - `needsAiLabel` sets AI flags from asset provenance.
- **`src/keywords.ts`:** the search lead (must be a real question or a hand-picked phrase),
  tiered rotating hashtags, series numbers.
- **`src/openaiKey.ts`:** the shared-org guard.
- **Other formats:**
  - `src/formats/slides.ts` (quiz carousels, swap guide, image posts);
  - `quiz.ts`;
  - `transform.ts`;
  - `history.ts` and `versus.ts`;
  - `recipe.ts` and `app.ts`.
- **`facts/`:**
  - `food-facts.yaml` (69 sourced facts plus quiz sets);
  - `lists.yaml` (7 lists);
  - `slides.yaml` and `history.yaml`;
  - `versus.yaml` (USDA numbers);
  - `data/transforms.yaml` (one real RecipeFix result).

## 5. How I worked (keep doing this)

1. **Render, then look at the frames myself** (ffmpeg stills, tiled) before trusting any
   score. Several "failures" were the reviewer's sampling or loose OCR boxes, not the video.
2. **Review = the median of 3** (single reviews swing ±1). Read the problems and fixes, and
   group them across all videos (91 notes → 4 root causes) before changing anything.
3. **Fix the system, not the instance:** the template, the copy rules, QA or the scheduler.
   One change per round, so we know what moved the score.
4. **Never loosen QA to pass.** Make the check verify itself instead (crop re-read), or fix
   the design (inset, contrast band).
5. **Tests:** when a test is added or rewritten, mutate the code and confirm the test fails
   (gotcha 14 in RecipeFix `CLAUDE.md`). Back up the file to the scratchpad first; never
   `git checkout` a file that holds uncommitted work.
6. **Calibrate the judge:** two real food-media Shorts scored below ours (Tasty 2/4/2/5,
   Business Insider 7/5/4/6). Asking the judge "describe the 9/10 version of this exact
   post" gave a concrete spec (section 7).
7. **Commit after each step, push at the end,** and keep `PLAYBOOK.md` and this file current.

## 6. What worked and what didn't (evidence)

| Change | Effect |
|---|---|
| Quiz VIDEOS (single, set, myth), all themes | Plateau at stay 4–6 / engage 3–5. Out of rotation. Facts ship as carousels/images instead. |
| History and this-or-that videos (5 rounds each) | 6/5/3/7 and 6/4/3/6. Out of rotation. |
| List videos | The best format: 7/7/6/7 range. |
| Surprising, sourced CONTENT (FARE hidden-dairy items) | The biggest single jump (stay 8, "would leave at never"). |
| Layout variants (sticker → editorial → magazine → quote card → guess beat) | All within ±1. Design tweaks stopped moving the score. |
| Brand row / RecipeFix CTA in the video | Always read as "an ad". The bridge is now a pinned comment and caption only. |
| Generic engagement asks ("Save this", "Comment your score") | Read as bait. Comment-keyword or useful checklists are better. |
| 1 fps labelled review frames | Removed false "duplicate slide" and "blank frame" complaints. |
| Reading-paced timing (owner request) | More readable; the AI reviewer's "stay" dips by about 1 on longer videos. The owner's preference wins. |
| Paper "label shot" (proof as its own shot) | Owner: "clip art and Canva, blank space". Rejected. |
| **Native look** (full-frame motion, captions in beats) | Owner: right direction. Current default. |
| Sora video API | `sora-2` is listed, but `POST /v1/videos` returns 404 (likely needs org verification). |
| FreePD music | The site is closed. |

**Root cause of the ~7 ceiling:** it's a slideshow of still images. Viral food lists use
moving footage with big captions. **Next lever: real motion** (stock clips or Sora), then
music, then stronger and more surprising content.

## 7. The judge's "9/10 spec" (use as the target, at the OWNER's calm pace)

- **Hook (first 1.5 s):** huge text plus a fast montage of all items with number pops, then
  a freeze on the headline. No unverifiable teases.
- **Each item, two shots:** a food clip (motion), then a "reveal" moment for the hidden
  ingredient. Big text, one clear risk plus one clear alternative, the source tiny at the
  bottom.
- **Ending:** a clean checklist and a comment-keyword ask ("Comment PART 2…") that we will
  actually honour with a part 2.
- **Caption:** the search phrase first, one line of value, a question.

## 8. Plan status (PLAYBOOK §8, P1–P11)

| Step | Status |
|---|---|
| P1 formats | Done (lists, carousels, images, X, transform, recipe, app; quiz, history and versus videos parked). |
| P2 keywords / hashtags | Done (search leads are real questions or hand-picked phrases). |
| P3 transform | Built; one real result only. Needs more real RecipeFix results, bigger type and a faster open. |
| P4 fact bank | 69 facts. One data bug: `bake-soda-acid` has the wrong quote. Fix before use. |
| P5 perfection loop | Lists at about 7. Owner likes the native look. Next: motion and music. |
| P6 Pinterest pin | Not built. |
| P7 analytics loop | Not built (needs connected accounts). |
| P8 UTM attribution | Pinned comments carry UTM links. The RecipeFix side (`source()` attribution) is not built. |
| P9 assist kit | Not built. |
| P10 nightly runner | Not built. |
| P11 bank the 2-week buffer and queue it in Blotato | Plan ready (`planWeek({days:14})`). Waiting on owner approval plus connected accounts. |

## 9. Next steps, in order

1. **Real motion.**
   - As soon as the owner provides a Pexels key (`PEXELS_API_KEY`), add a
     `stockClip(query)` helper: vertical, ≥1080p, no faces; record licence and URL as an
     asset. Use clips in `NativeItem` and the hook (Remotion `OffthreadVideo`), with a slow
     push.
   - Or, if the owner verifies the OpenAI org, generate 4 s Sora clips per item (about
     $0.40 each).
   - Keep the generated still as the fallback.
2. **Music beds.** The owner picks one of:
   - Epidemic Sound Business (about $20 a month; files cleared on one channel per
     platform);
   - TikTok/IG in-app libraries added by hand;
   - Pixabay or GarageBand loops (free).
   Wire `bed` into `ListShort` per `CREATIVE_STRATEGY` §1.5 (−14 LUFS, bed under captions,
   0.3 s fade in, 1 s fade out).
3. **Hook montage** per section 7 (calm version), and bigger cover type.
4. **Re-render the quiz carousels** with the latest fixes: `pnpm mk slides quiz kitchen-math`,
   `kitchen-myths`, `food-history`, `label-detective`, `thanksgiving-swaps`. Then review.
5. **Restyle the transform and recipe videos in the native look** (they still use older
   styles), and the app intro (week 4+). Feature videos (meal plan, pantry) are not built.
6. **More lists from surprising sourced facts.** The two-week queue uses 6 lists; aim for 12
   or more.
7. **A 4:5 Instagram carousel layout for lists, and the Pinterest 2:3 pin.**
8. **Fix `bake-soda-acid`** (find the King Arthur quote that supports "needs an acid").
9. **Once the owner connects the RecipeFix accounts in Blotato:** a dry-run publish of the
   approved posts, then queue the 14 days only after explicit owner approval. Then
   analytics (P7) and the nightly runner (P10).

## 10. Waiting on the owner

- Approve or reject the 7 lists on the review page.
- Music choice (step 2).
- A Pexels API key (https://www.pexels.com/api/), or OpenAI org verification for Sora.
- Connect the RecipeFix accounts in Blotato (they said: later).
- Separate OpenAI key: not needed for now (owner's call).

## 11. Spend

The ledger (`runs/ledger.jsonl`) records about $11–12 to date (estimates; images are booked
at $0.05 each). One list render costs about $0.3–1.0 (images are cached), and one 3-review
critique about $0.05.
