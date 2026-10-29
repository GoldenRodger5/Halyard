# Food studio checkpoint

Two finished parent ideas, deliberately authored as images: `rf-salt-volume` (kitchen math) and `rf-allspice-quiz` (pantry quiz). Each has an Instagram carousel and a separately composed X image. No TikTok or YouTube slideshow is being passed off as a video.

Open `review.html` for the actual seven exports. `handoff.json` contains final copy, titles, ALT text, SHA256 hashes, dimensions, disclosures and source links using the shared authoring contract. Cost: $0 provider spend, zero provider calls, zero new dependencies or subscriptions. Everything is silent by design. Founder decision remains unreviewed; nothing is scheduled or published.

The salt scene is an original local Blender illustration. The 8g/16g comparison is explicitly King Arthur Baking’s published tablespoon reference for the named kosher salts, not a staged live weighing. The allspice fruit photo is Brian Arthur’s real photograph under CC BY2.5 with linked credit and disclosed crop/blend. Both allspice panels use the same globally CC BY2.5 licensed source photograph, with different crops. An explored1915 botanical plate was removed rather than carrying unclear global reuse rights into the finished packet. See `sources-and-rights.json` and archived image metadata.

## Reproduce

Use the already installed dependencies from the prepared worktree. The render script verifies the encrypted T9 UUID and requires the existing Remotion Chrome executable; it does not download a browser. Large bundles and scratch output stay on T9.

```sh
./node_modules/.bin/tsc --noEmit -p packages/marketing/production-checkpoint/food/tsconfig.json
./node_modules/.bin/tsx packages/marketing/production-checkpoint/food/scripts/render.mts rebuild-1
```

The second command writes all seven images under `/Volumes/T9/Developer/Builds/recipefix-social-team-20261029/food/renders/rebuild-1` and refuses an existing output directory. Current handoff generation intentionally binds to the reviewed `v3` export set:

```sh
./node_modules/.bin/tsx packages/marketing/production-checkpoint/food/scripts/handoff.mts
```

The source 3D still can be regenerated with the already installed Blender5.2.2. Use a new tag; existing source renders are preserved. Verify storage headroom before additional heavy work.

```sh
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-social-team-20261029/food/scratch FOOD_STILL_TAG=rebuild-1 /opt/homebrew/bin/blender -b -t 4 -P packages/marketing/production-checkpoint/food/scripts/salt_scene.py
```

The included still remains the reviewed input until a newly rendered image is deliberately copied into `assets/salt-material.png`, final exports regenerated, hashes rebuilt, and media reviewed again.
