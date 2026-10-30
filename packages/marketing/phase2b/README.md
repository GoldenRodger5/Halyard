# RecipeFix Phase 2B founder review

Start with the [checkpoint](CHECKPOINT.md), then [watch and listen](http://127.0.0.1:4370/#sound-comparison). The gallery contains the actual two complete finishing films, PR118 baseline, four retained editorial families and clearly separated stopped science references. Nothing is published or scheduled.

From this worktree with the existing installed dependencies and encrypted T9 mounted:

```sh
./node_modules/.bin/tsx packages/marketing/phase2b/prepare-review.mts
node packages/marketing/phase2b/serve-review.mjs
```

Open `http://127.0.0.1:4370/`. The local server binds only to 127.0.0.1, serves hash-checked catalog assets and supports video byte ranges. The generated `catalog.json` is ignored. Do not reuse stale catalog paths after moving a worktree; rerun preparation. `RECIPEFIX_AUDIO_ROOT` and `RECIPEFIX_EDIT_ROOT` can point to the specialist worktrees before their focused commits are integrated.

This is a thin review adapter over the existing frozen Social Studio contracts, not a new scheduler. It assembles only five selected parent ideas/eleven variants, verifies exact asset hashes, excludes rejected science from typed candidates, and refuses invented account/time authority. `finished-media.json` adds the no-voice comparison without inventing extra publishing ideas. Actual review records remain founder-unreviewed; queue readiness stays false.

For a new bounded gallery verification, keep evidence outside source:

```sh
RECIPEFIX_REVIEW_EVIDENCE=/Volumes/T9/Developer/Builds/recipefix-phase2b-20261029/integration/evidence/final-gallery node packages/marketing/phase2b/review-check.mjs
```

It checks 360/390 layouts, all carousel navigation, exact media delivery/byte ranges and full muted/unmuted transport of both final films and the PR118 baseline. Transport is not a claim that a reviewer heard or approved audio. Independent picture/mix evidence is in [editorial/](editorial/); narration alignment, usage, licenses and loudness are in [audio/](audio/). Existing render mechanics are reused; no dependency/model download is required.

See [CALENDAR.md](CALENDAR.md), [SOURCE_TABLE.md](SOURCE_TABLE.md) and [growth/READINESS.md](growth/READINESS.md). Stop for founder creative and listening review before another production wave.
