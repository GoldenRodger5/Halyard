# One free contrast-cut experiment

A single editorial rewrite of the existing pineapple proof, 10.5 visual seconds / 315 frames / 1080×1920 at 30 fps. Silent, voice held, no new artwork, audio or provider call. Current R&D candidate, not approved to post or labeled premium.

The question changes to “Gelatin tonight? Fresh or canned?” over actual knife/ring action. A short fresh macro insert is followed by the can reveal at 3.2s, rather than 9.5s in the previous proof. A second actual preparation excerpt provides brief context for the enzyme explanation, then the can/gelatin illustration delivers the practical answer and recipe instruction. Native action occupies 5.2s; existing generated stills occupy 5.3s. The stills have only camera reframing, not native motion or I2V. Neither image is a filmed gelatin experiment.

Source assets are read from `../assets`, preserving the original proof and both original PNGs. Actual video excerpts use source 0–2.6s and 5.4–8.0s; no loop or claimed second recorded angle. The latter excerpt is cropped more closely. Existing source/rights metadata is in `../proof.json`; science sources remain UGA Extension and EatRight. Inter font/OFL are reused locally.

Output: `/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/integration/cinema/contrast-cut-v1/pineapple-contrast-cut.mp4`. Contact, browser playback logs/screenshots and render receipt are in the same external directory. Output tag is fixed for this one experiment; rendering refuses an existing directory to preserve evidence.

From repository root, with existing dependencies and verified encrypted T9:

```sh
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/integration/scratch ./node_modules/.bin/tsx packages/marketing/phase2/cinema/contrast-cut/render.mts
```

Remaining limitation: this improves question/reveal timing, not the underlying absence of a real gelatin consequence shot. The fresh-to-canned illustrations must stay clearly labeled, and the final still hold is still less engaging than actual coherent food action. No soundtrack/voice judgment is claimed. Root owns review and integration; this worker did not stage or commit the root worktree.
