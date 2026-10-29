# Phase1C — more dinner, same broiler

October 29, 2026. **Finished creative for founder review, not approved inventory or a proven acquisition campaign.** Built from the current commercial strategy`cd83a303` in a new isolated worktree. PR #104/#105 were read as preserved research; neither was merged into this branch.

## Watch and inspect the actual outputs

**http://127.0.0.1:4340/** — private review page on this Mac. Full playable video with sound/mute controls; five-card Instagram viewer with keyboard navigation, alt text and downloads; X graphic, exact native thread/captions, proof, limitations and measurement plan. Start/restart from worktree root with:

```sh
node packages/marketing/phase1c/scripts/serve-review.mjs
```

- [Final 18.1-second vertical video](review/broiler.mp4),1080×1920 at 30 fps, 543 frames. SHA256`cc517caff8d66a991c476f68dfe5805d129b601593ab02f45d8953bddc4d4f92`.
- Instagram 1080×1350: [1](review/ig-1.png), [2](review/ig-2.png), [3](review/ig-3.png), [4](review/ig-4.png), [5](review/ig-5.png). Individually art-directed; not screenshots of the video.
- [X-native 1200×675 graphic](review/x.png) and distinct three-post draft thread in [posts.json](posts.json), also displayed on the board.
- [Video contact sheet](review/contact.jpg), [independent finished-media critique](INDEPENDENT_REVIEW.md), [exact provenance/hashes](source-manifest.json).

## Audience problem and concept selection

Three problems were considered in [CONCEPTS.md](CONCEPTS.md): scaling a dinner, a protein-target adaptation, and adapt→save→plan weekly use. Scaling won because we have genuine specific production evidence, a visible cooking-space conflict and a natural first-adaptation destination. The available public record does not prove a macro achievement; safe authenticated end-to-end weekly-use capture was unavailable. No fabricated nutritional or save/Plan outcome was substituted.

Public cooks asking about [scaling Bolognese](https://www.reddit.com/r/Cooking/comments/1rgiapg/tips_for_scaling_up_recipes/) and [carbonara for eight](https://www.reddit.com/r/Cooking/comments/1rvq2bd/recipe_scaling/) support the relevance of pan capacity/batching as a real question. They are need signals, not prevalence estimates or RecipeFix testimonials. No quote/avatar is reproduced.

For the selected problem, the independent gate chose **Broiler Tetris** over an expanding dinner-invitation story and a UI-driven “one-thumb rescue.” Those alternatives added metaphors or returned to proof cards. The winner opens on a crowded broiler as the chicken amount grows; actual RecipeFix input/result becomes the intervention; the same 18 illustrative objects redistribute into two sheets that take turns in the same rack. Sauce finish preserves the real method's next step. A short Original-recipe invitation provides a practical next action. No seamless-loop, actual tray-capacity detection or physical cooking-success claim.

## What RecipeFix actually changed

Source: RecipeFix`3f32680f091d06ad9046bb95e4dfb55489d2c264`, `src/data/landingRealResult.ts::LANDING_REAL_RESULT`, captured from productionOctober 21, 2026. The exact JSON is preserved and automatically compared with the pinned source, not hand-authored.

- Combined request: **Dairy-Free, 4 → 6 servings**, not a fresh scaling-only inference.
- Ingredient0: **1½ lb → 2¼ lb boneless, skinless chicken thighs**.
- Step 4 / displayed step 5: a single uncrowded layer on **two foil-lined baking sheets**, **broil one sheet at a time**; the full source says 8–10 minutes per sheet, then promptly transfer each batch into simmering sauce to finish cooking, to 165°F (74°C) internally. Timing is not presented as total elapsed dinner time or proof of doneness. [USDA source](https://ask.fsis.usda.gov/article/What-is-a-safe-internal-temperature-for-cooking-meat-and-poultry) agrees on poultry internal temperature.

Actual current public RecipeFix interface was recorded October 29. Adapt and nutrition functions were intercepted: Adapt returned this exact historical payload locally; nutrition was disabled; Supabase POSTs were blocked. Capture receipt and destination verification are committed. No new paid inference, account creation, customer recipe, save or app-production change. The source UI remains pixel-unaltered; the recording is cropped/edited and 1.25× slower for legibility. Its apparent speed is not an inference-performance claim.

## Native executions and conversion path

The video tells a physical problem/intervention/plan story. Instagram is a saveable cooking-plan swipe: Original meal idea→quantity math→batch sequence→actual method→try. X is a standalone scaling point and a genuine cooking question, followed by distinct source and optional trial replies. One self-contained video serves TikTok/Reels/Shorts; no extra edit is created merely to increase output count. Shorts gets its own title/description/destination.

[PLATFORM_PLAN.md](PLATFORM_PLAN.md) and [posts.json](posts.json) contain the complete audience/value/CTA, platform captions, alt text, exact UTM destinations and measurement contract. The destination is verified: `https://recipefix.app/original-recipes/chicken-tikka-masala`→**Make it fit**. It is not an invented direct-adapt state or merely the homepage.

QA locally verified campaign/content/source tags surviving into Adapt, with`channel=social`; the current bundle is`index-D18VC9ff.js`. This proves route/parameter continuity, not analytics ingestion. Existing PostHog attribution can attach first/last UTMs. The first-party acquisition-session source still folds social into`referral`, so it cannot alone distinguish these variants. Source-backed events include`first_value_success`,`recipe_recalibrated`,`save_completed` and Cook events; no new event or purchase pixel was invented.

**Readiness is partial:** owned social accounts/profile links are unverified and were not configured. Shorts descriptions/comments are not clickable; use a verified channel profile link. TikTok/Instagram website/profile capability must be verified before using a profile-link CTA. Measure tagged qualified visits→genuine completed adaptations→save/useful return→provider-verified paid Plus. Frontend success-page events are not revenue. No post, campaign, signup, adaptation or paying-customer outcome is asserted here; unknown is not zero. The founder's very small verified billing baseline is context, not a new performance result.

## Actual critique and meaningful revisions

The earlier app films failed because they exhausted their proposition, then asked viewers to read. The games/science films changed the experience but did not give relevant cooks a reason to try RecipeFix. This pilot centers a real headcount/cooking constraint and a specific method change.

V1 review found weak crowding, an input crop that hid the six-serving control and actual method, a food crossfade instead of material continuity and a long static tail. Revisions filled the original tray credibly, showed actual diet/counter/Adapt controls, used an exact current-UI two-sheet excerpt, retained the same food objects as they moved into the new plan, and cut 20 → 18.1 seconds. V4 darkens the low-contrast orange, enlarges the historical disclosure and removes a dashed line crossing helper text. Instagram/X spacing and the X title/diagram gutter were corrected; evidence copy was retained because deliberate swiping supports reading.

The [independent review](INDEPENDENT_REVIEW.md) is bound to the actual final media. Root and reviewer challenged a perceived glyph-corruption warning: exact encoded header masks were identical across the alleged bad/clean frames, so that false alarm was withdrawn rather than treated as a rendering defect. Evidence is retained in`review/header-stability-v3.json`. Critics surface questions; their perception and scores are not approval.

**Producer recommendation:** this is a more commercially relevant test than the previous pilots and merits founder consideration for a small, measured release after exact selection and working account links. It is still stylized illustration, not exceptional food cinema; the proof beat asks for reading, and its app benefit is based on one historical example. If the founder dislikes the underlying illustrated treatment, another typography pass will not solve that. A genuinely different treatment would be preferable to endless polishing. No acquisition uplift or publication permission follows from finished media or tests.

## Verification and limits

- 34/34 existing marketing regressions across 6 files pass; marketing and Phase1C TypeScript checks pass; script syntax checks pass. No new architecture/dependency or root package/lock change.
- Full actual 390px mobile and native-resolution video inspection, muted and unmuted transport; independent temporal/boundary inspection. Root board test verifies complete playback, all five carousel cards/dimensions/alt text, keyboard controls and actual caption loading. Exact logs are committed/retained on T9.
- Actual export:1080×1920/30fps,543 H.264 4:2:0 frames, stereo AAC at 48 kHz. Video 18.1s, container 18.154667s from audio padding. Requested yuv420p; actual full-rangeyuvj420p is recorded, not silently called limited-range. Social-platform transcoding remains untested.
- Critical-copy QA: **11/12 full-frame/static samples pass** at unchanged 24px minimum/4.5:1 contrast and established safe zones. The remaining actual input-UI sample finds 4.09:1 Dairy-Free chip and 3.44:1 muted servings text in the untouched product capture. It remains a recorded failure, not a lowered gate. The actual primary request caption is independently measured from the same encoded frame: **passes at 8.48:1** with original size/contrast thresholds. No claim that every source-UI word is AA-compliant. See [verification.json](review/verification.json) and [actual annotation crop](review/annotation-proof.png).
- Original deterministic sound design, no narrator: plucked rhythm, crowding/click/material accents, a brief breath before the new plan and a resolving ending. Final EBU R128: **−17.6 LUFS, −2.0 dBTP, 7.8 LU LRA**. Synchronization/levels/transport were inspected; **tools cannot directly hear timbre or musical taste**, and no listening approval is claimed.

## Rights, cost and reproducibility

Original SVG scene geometry and procedural audio were authored through AI-assisted code. Current first-party UI and exact historical output are identified. The photograph is the licensed **Original**, not an adapted meal: Unsplash photo `1585937421612-70a008356fbe`, rights documented in RecipeFix`docs/RECIPEFIX_ORIGINALS.md` at the source pin; [Unsplash License](https://unsplash.com/license). Inter and Instrument Serif carry bundled SIL Open Font Licenses. No publisher recipe photo, protected reference footage, synthetic narrator, paid generated video, customer quote or cooked test enters these exports. Future platform media-label settings require the exact public-variant review; none was silently marked exempt/approved.

**$0 additional provider/media spend, 0 paid model calls, $0 new subscriptions.** Local compute/editorial time is unpriced. No production RecipeFix/DB/migration, social account/profile, scheduler, public posting or outbound engagement operation.

Use existing installed dependencies/browser. Bulky capture/render/review evidence stays on verified encrypted T9, UUID `B1ADFFB0-BCCF-441A-8086-365120C88DB7`, under `/Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029`. New branch/worktree: `feat/recipefix-acquisition-pilot-phase1c-20261029` at `/Volumes/T9/Developer/Worktrees/halyard-recipefix-acquisition-pilot-20261029`, based directly on `cd83a303`, not the stacked rejected R&D branches. Existing dirty worktrees and all earlier results are preserved. Last measured internal availability 101.02 GiB; no cleanup or relocation was performed.

```sh
python3 packages/marketing/phase1c/scripts/make-sound.py
ffmpeg -v error -i /Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029/audio/score-raw.wav -af loudnorm=I=-19:TP=-2:LRA=9 -ar 48000 packages/marketing/phase1c/assets/score.wav
./node_modules/.bin/tsx packages/marketing/phase1c/scripts/render.mts BroilerStory broiler-new
./node_modules/.bin/tsx packages/marketing/phase1c/scripts/render.mts Companions companions-new
./node_modules/.bin/tsx packages/marketing/phase1c/scripts/validate.mts
node packages/marketing/phase1c/scripts/verify-board.mjs
```

Render sequentially with new output names; existing renders cannot be overwritten. `validate.mts` intentionally returns nonzero while preserving the known source-UI contrast finding; consult its recorded report/supplement rather than claiming all checks passed. No more creative iteration is required before the founder sees these exact assets. Do not publish or bulk-promote the R&D inventory.
