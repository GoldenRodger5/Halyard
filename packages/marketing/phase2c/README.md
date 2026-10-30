# The second tray — Phase 2C

[Watch the full film](http://127.0.0.1:4380/#film), [compare the earlier cuts](http://127.0.0.1:4380/#comparison), then read [the checkpoint](CHECKPOINT.md) and [independent whole-film critique](review/FINAL-CRITIQUE.md).

One new 12.8-second, 1080×1920/30fps movie replaces the screenshot-based composition with a food-scene sequence. The recommendation is **REVISE against the premium bar; keep the cohesive direction**. This is private R&D, outside publishing inventory. No new model calls or voice generation were made.

From this worktree, with the existing dependencies and encrypted T9 mounted:

```sh
./node_modules/.bin/tsx packages/marketing/phase2c/prepare-review.mts
node packages/marketing/phase2c/serve-review.mjs
```

The server reuses the Phase2B allowlisted media/range-delivery mechanics and binds only to 127.0.0.1:4380. The generated catalog is ignored; regenerate it after moving a checkout. The older gallery and all editorial/source work remain intact.

Rebuild the same composition without any provider call, using a unique output tag:

```sh
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2c-20261029/scratch ./node_modules/.bin/tsx packages/marketing/phase2c/render.mts unique-rebuild-tag
```

`--draft` produces a 540×960 animatic. The renderer refuses an existing picture output, verifies encrypted T9 and uses the installed browser. Source assets, bundles, frames and media stay on T9. It reuses the original full Chris take and existing licensed sources through the inherited local FFmpeg mixer, with the tray cue moved to the 4.6-second state cut. There is no synthesis endpoint in this render path.

`verify-review.mjs` checks the local gallery and full muted/unmuted playback at 360/390 px. Relevant direct TypeScript and all 52 existing marketing regressions passed. Source hashes and review media are pinned in `source-receipt.json` and `media-manifest.json`; full-playback, mix, independent gates and verification receipts are preserved. A transport/waveform check never establishes audible naturalness or taste.

See the [source-grounded storyboard](storyboard.json), [social caption and attribution](CAPTION.md), and [optional missing-action proposal](ACTION_SHOT_PROPOSAL.md). No additional generation, posting or scheduling follows automatically.
