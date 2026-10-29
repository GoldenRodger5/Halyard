# More dinner: dimensional planning film

Phase 2 rebuild of parent idea `rf-more-dinner` (P02). Work is a candidate for review, not approved marketing inventory. No posting, account selection, scheduling or founder approval is attached.

Two actual five-second prototypes preceded selection. Root rejected the unrelated real-food preparation approach and selected the dimensional capacity story. The final intentionally stylized CGI world shows four place settings becoming six, illustrative pieces crowding one sheet, actual RecipeFix setting interaction on a physical screen, redistribution across two sheets, and sequential use of one illustrated broiler chamber. The same pieces transfer into an illustrated sauce pot. It is not a cooked or tasted result; piece counts do not measure servings.

Historical product evidence: combined Dairy-Free 4→6 Chicken Tikka Masala response recorded Oct 21, 2026, source `GoldenRodger5/recipe-fix@3f32680f091d06ad9046bb95e4dfb55489d2c264`, `src/data/landingRealResult.ts`. Current captured UI bundle `index-D18VC9ff.js`; capture uses the historical fixture response and made no fresh provider call or production write. Actual setting capture is preserved, resampled 20→30 fps for the 3D screen. Cropped method pixels show the exact phrase “broil one sheet at a time”; complete response is in `assets/real-result.json`.

Rebuild with installed Blender 5.2.2, FFmpeg and existing Remotion dependencies. No dependency/model downloads. Big output and temporary files must remain on verified encrypted T9. `scripts/full-film.py` uses `scripts/kitchen-space.py` as its deterministic original geometry/material library; `scripts/sound.py` makes an original 23-second score and synthetic illustrative foley without samples or voices. `scripts/render.mts NAME MoreDinner` assembles the 23-second 1080×1920 / 30 fps final. Source assets and review exports are deliberately scoped here; do not stage dependency symlinks.

Voice generation is held until locked clips are selected to post. No Apple system TTS, Roger, cloned voice or paid narrator appears. Sound-on exports enable human review; automated transport, loudness and peak checks cannot establish that the soundtrack sounds good.

Remaining quality limit: food has richer red/orange texture and motion continuity but still looks like stylized nuggets/blocks rather than convincing chicken. Camera/action materially improve the capacity explanation; this does not establish premium food craft. A human should judge appetite appeal and soundtrack before choosing this candidate.

## Rebuild and comparison files

From the repository root, using existing dependencies and the committed final source movie/audio/fonts:

```sh
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch ./node_modules/.bin/tsx packages/marketing/phase2/video/scripts/render.mts more-dinner-rebuild MoreDinner
```

Use a fresh output name; the wrapper refuses to replace review exports. `review/prototype-a.mp4` and `review/prototype-b.mp4` are the two actual five-second experiments, clearly rejected/prototype references, absent from current handoff variants. `review/more-dinner-v1-phone.mp4` and its contact preserve the pre-fix comparison; the native v1 is also preserved externally in Build renders.

Full procedural geometry regeneration has an explicit verified-T9 dependency, not an untracked media dependency. `scripts/full-film.py` writes the native 690 frames and source scene into `/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch/full-v1`; `scripts/revise-staging.py` reuses its first 514 frames and renders 515–690 into `full-v2`. The correction requires that freshly generated original scene/frames. The only captured UI input is committed `assets/modal-action.mp4`: 1.5s / 20 fps / 30 original frames. Resample it to 45 frames before either Blender pass:

```sh
~/.local/bin/storage-headroom --require-t9
mkdir -p /Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch
ffmpeg -v error -i packages/marketing/phase2/video/assets/modal-action.mp4 -vf fps=30 /Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch/ui-%04d.png
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch /Applications/Blender.app/Contents/MacOS/Blender -b --python packages/marketing/phase2/video/scripts/full-film.py
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch /Applications/Blender.app/Contents/MacOS/Blender -b --python packages/marketing/phase2/video/scripts/revise-staging.py
ffmpeg -v error -framerate 30 -i /Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch/full-v2/frame-%04d.png -c:v libx264 -crf 17 -pix_fmt yuv420p -movflags +faststart packages/marketing/phase2/video/assets/dimensional-v2.mp4
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch python3 packages/marketing/phase2/video/scripts/sound.py
```

Preserve existing Build frame directories and the committed movie before a full source regeneration; do not overwrite unique evidence. The last FFmpeg command intentionally refuses an existing movie. The sequence images and Blender files are generated by these commands, not required downloads. Root's approved bounded v2 correction changes tray/food/camera geometry only after frame 514; no materials, source result, duration or voice changed.
