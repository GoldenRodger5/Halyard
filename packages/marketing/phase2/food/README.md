# Founder-rejected baseline — Dessert sabotage

**STOP: the founder rejects this exact film as flagship marketing.** It is preserved for comparison and source evidence only. The accessibility fix does not make it a KEEP candidate or qualified publishing inventory. Decision: `954c546`, `2026-10-29-CINEMATIC-VISUAL-QUALITY-RESET.md`.

[Play the archived film](exports/pineapple.mp4) · [Full-resolution poster](exports/pineapple-poster.png)

One new parent, one 11.5-second film, three platform video variants. The original pink gelatin wobbles from frame 0; an illustrated protein network is severed and collapses; the final scene compares fresh and canned pineapple. The gelatin, network, scissors and pool are original illustrations, not a kitchen experiment or a cooked RecipeFix result.

This was an attempted replacement for the stopped allspice execution; the founder rejected this exact result. Two materially different approaches were actually exported before selection: a cobalt pan-area comparison and a yellow/fuchsia gelatin-science treatment. Root selected the pineapple premise and original gelatin material. The pan idea remains an unselected prototype, not a finished calendar slot. Existing salt and autumn pieces were not changed.

`handoff.json` uses the frozen shared `CreativeIdea` and `PlatformVariant` contracts. It contains final copy, ALT description, dimensions/duration, full repository asset paths, SHA256 hashes, source URLs and disclosures. `sources-and-rights.json` records the primary UGA/Academy sources, original assets and font license. `prototype-receipt.json` identifies the actual tested prototype files and selection. All source stills, frames, bundles and evidence were produced on encrypted T9 with existing tools. Provider spend/calls, new dependencies and subscriptions: 0.

There is no voice, music or effects soundtrack. The encoded AAC track is silence by design; no subjective audio judgment is claimed. Founder decision: rejected. No accounts, schedule, publication or exact founder approval are supplied.

## Reproduce the archived baseline

Run from this worktree with the already installed dependencies. These commands do not install a browser, model, runtime or package. Use a new output tag; previous renders are preserved.

```sh
./node_modules/.bin/tsc --noEmit -p packages/marketing/phase2/food/tsconfig.json
./node_modules/.bin/tsx packages/marketing/phase2/food/scripts/render.mts rebuild-1 --video --video-only
```

The 60 included 640px RGBA source frames preserve real frame-to-frame original mesh/camera changes and can render the entire edit without Blender. The output is 1080×1920 at 30fps. The exact reviewed source is `final-v5/pineapple.mp4` on T9; the handoff builder deliberately binds to it rather than silently selecting a newer render:

```sh
./node_modules/.bin/tsx packages/marketing/phase2/food/scripts/handoff.mts
```

To reproduce the full actual muted phone playback, choose a render tag whose playback evidence folder does not yet exist:

```sh
./node_modules/.bin/tsx packages/marketing/phase2/food/scripts/playback.mts rebuild-1
```

The server is temporary and loopback-only; it closes when the check completes. Playback evidence is written under `/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/food/evidence/<tag>`.

The optional Blender source rebuild is bounded to one original still and 60 motion frames; verify storage headroom before extending it. Existing scene outputs are never overwritten. Use the same unique `FOOD_SCENE_TAG` for both commands:

```sh
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/food/scratch FOOD_SCENE_TAG=rebuild-1 /opt/homebrew/bin/blender -b -t 4 -P packages/marketing/phase2/food/scripts/jelly_scene.py
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/food/scratch FOOD_SCENE_TAG=rebuild-1 /opt/homebrew/bin/blender -b -t 4 -P packages/marketing/phase2/food/scripts/jelly_motion.py
```

The source scripts verify T9’s encrypted UUID. Replacing reviewed source frames requires deliberately copying the rebuilt frames, rendering again, rebuilding hashes and repeating media review. No source frame is a measured physical result or a protein simulation.
