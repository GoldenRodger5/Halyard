# RecipeFix Phase 1B — actual creative experiments

October 29, 2026. **Founder review checkpoint. Nothing is approved, merged into the production pipeline, scheduled or published.** PR104 A4/B2 and its proposed hybrid remain rejected. This phase changes concepts rather than polishing that storyboard.

## Watch

Start the private review server from the worktree root:

```sh
node packages/marketing/phase1b/scripts/serve-review.mjs
```

Open **http://127.0.0.1:4330/**. The clean comparison page contains actual full-resolution playable films, sound-on controls, muted comparison, contact sheets, provenance, criticism, limitations and downloadable MP4s. It is local to this Mac, not publicly hosted. A 350px-wide native player fits the390px phone review; both source files are1080×1920.

| Final export | Duration / revision | Full-quality file | SHA256 |
| --- | --- | --- | --- |
| Follow the yolk |15s / game V4 |[egg.mp4](review/egg.mp4) |`05b3016cdd9a8e0d6d4f1d475ae1b38a0afa345e07b84d9d48503e0c623304a5` |
| The little explosion |13.5s / popcorn V3 |[popcorn.mp4](review/popcorn.mp4) |`2852f0b9488a4c9eb84f7606f520b1536f35d9ea192292229c4a3f0be8c58070` |

## What failed before, and what changed

The rejected product films gave away their entire proposition early, then asked viewers to read successive source crops and a five-second closing. Renderer, color and type could not supply a developing story. The latest founder rejection in [PR104](https://github.com/GoldenRodger5/Halyard/pull/104#issuecomment-6500212414) explicitly withdrew the hybrid. Both old files and their technical evidence are preserved untouched.

Three concepts were storyboarded in [CONCEPTS.md](CONCEPTS.md). The independent pre-production reviewer chose the food game and the micro food-science story. The guest-list/product-machine concept was killed: too many metaphors, old cream story, risk of implying physical recipe repair. No third full cut was justified.

The game has a fair question, path crossings, an attempted shell escape, a visible answer and a second comic reward when the yolk escapes the late chopsticks. The story follows a recognizable kernel, water, pressure, a splitting hull and continuously expanding starch. It does not demonstrate RecipeFix functionality or a physically cooked adaptation. Neither ends with an app-sales slab.

## References actually inspected

The [compact reference board](REFERENCES.md) documents complete official PES *Fresh Guacamole*, Birdbox *Toast*, Ordinary Folk *Creation* and BUCK/Coda films, including endings and perception limits. Mechanisms: object transformations, an object rule violated once, silhouette/scale continuity, and physical motive→consequence. PES is explicitly historical; contemporary studio craft is not TikTok performance proof. A fresh TikTok attempt was obscured by sign-in UI and is reported as an access-limited gap, not a newly watched reference. No competitor footage, drawings, music or characters are used in the finals.

## Meaningful revision history

| Version | Actual criticism | Change |
| --- | --- | --- |
| Game V1 |Yolk protruded under the shell, spoiling the game; floating shells overlapped the title. |Concealed the yolk during play while preserving ownership and actual paths; adjusted lift geometry and clipped shell speckles. |
| Game V2→V3 |Generic “Still with it?”/“Wait for it” retention prompts; unclear intervention. |One genuine “Which shell?” beat; returning empty shell reacts to the chopstick tap. |
| Game V3→V4 |Reveal answered an easy question, then mostly reset. |Replaced bounce/reset with a callback: fair middle reveal, yolk rolls away, same chopsticks arrive late and miss; “OH.” is a reaction. Sound follows escape/miss. Not claimed as a seamless loop. |
| Popcorn V1 |Seven seconds of nearly static cutaway with changing captions; fluffy replacement image, long beauty hold. |Cut17s to13.5s; earlier water/camera motion, visible pressure waves and hull strain; continuous aligned-contour starch expansion and physically separating hull. Resynchronized sound to frame250. |
| Popcorn V2→V3 |Amber fragments looked like eyes; radial folds resembled a flower. |Moved hull pieces to the outer edges, removed central fragments/full ring; added asymmetric raised folds and a warm central cavity. |

All drafts remain on verified encrypted T9 at `/Volumes/T9/Developer/Builds/recipefix-creative-breakthrough-20261029/renders`. Final visual review is bound to the hashes above, not source code or just six screenshots.

## Independent criticism and decision

[INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md) contains actual full playback and temporal inspection, including earlier failures. Advice remains advisory: founder feedback outranks it, and no rubric was changed to manufacture acceptance.

**The game deserves founder consideration first.** It has a question, readable action and a callback ending. Its shell-game premise is familiar, its drawings are simple and its audience appeal is unproved. The popcorn film is more causally coherent and dimensional than its first export, but remains a restrained educational illustration: the cutaway middle and final settled object can still feel slow, and the stylized shape may retain a floral association. It is not established as immersive cinema or exceptional food art. Both are a direction test, not proof of a creative breakthrough or organic growth.

## Sound: deliberate arc, explicit sensory limit

No narration or rejected Roger audio. `scripts/make-sound.py` authors deterministic original stereo plucks, material-like taps, motion accents and pressure noise; no library samples or models. Game rhythm stops before the answer and returns for reveal/escape. Popcorn builds tension, leaves a short breath, releases at8.333s/frame250, then resolves. These are illustrative synthetic sounds, not real food recordings.

Measured from final AAC with FFmpeg EBU R128: game approximately−18.1LUFS/−2.0dBTP/3.3LU LRA; popcorn approximately−17.9LUFS/−1.7dBTP/6.8LU LRA. The separate loudnorm analysis is retained with its method identified; it is not substituted for the R128 meter. Audio padding makes container duration15.061333s/13.546667s; video remains exactly450/405frames. Review tools verify muted/unmuted transport, actual event timing, loudness, peaks and envelopes. **They cannot directly hear musical taste or timbre. No agent claims to have listened or approved the soundtrack.** Founder sound-on review remains the taste check.

## Technology and reproduction

Existing Remotion4.0.507 + React + original SVG geometry, gradients, clipping, finite procedural particles, camera transforms and FFmpeg. No new dependencies or package/lock changes. Motion Canvas could help a longer teaching timeline; Satori is for a later static companion; HyperFrames/GSAP remains optional. The scene did not need another engine, a GPU model or paid AI motion.

```sh
python3 packages/marketing/phase1b/scripts/make-sound.py
ffmpeg -v error -i /Volumes/T9/Developer/Builds/recipefix-creative-breakthrough-20261029/audio/egg-raw.wav -af loudnorm=I=-19:TP=-2:LRA=9 -ar 48000 packages/marketing/phase1b/assets/egg.wav
ffmpeg -v error -i /Volumes/T9/Developer/Builds/recipefix-creative-breakthrough-20261029/audio/popcorn-raw.wav -af loudnorm=I=-19:TP=-2:LRA=9 -ar 48000 packages/marketing/phase1b/assets/popcorn.wav
./node_modules/.bin/tsx packages/marketing/phase1b/scripts/render.mts YolkGame egg-new
./node_modules/.bin/tsx packages/marketing/phase1b/scripts/render.mts PopcornStory popcorn-new
```

Render sequentially; output names cannot overwrite existing films. Installed browser and dependencies are reused. Renderer and sound script require the actual encrypted T9 identity. Last measured warm local renders: game13.1s, popcorn9.9s; isolated observations, not a rigorous benchmark. SVG trajectories are deterministic functions of frame, with a checked equal-length contour invariant. No timer-driven animation or new architecture.

## Engineering and rights evidence

- Existing marketing regressions:34/34 across6files passed. Marketing and Phase1B TypeScript checks; source syntax/whitespace checks.
- Actual full390px and native-resolution playback, muted and separately unmuted; continuous player ranges/end states, no media errors. Root comparison-board playback is separately recorded in `review/playback.json`; independent evidence is on T9.
- Existing critical-copy OCR/contrast/safe-zone gate:8/9 sampled frames pass unchanged (minimum24px,4.5:1, x90–920/y240–1460). The two-letter “OH.” returns zero word boxes in the shared tokeniser, so its automatic failure is **retained**, not called a pass. Independent actual-frame pixel measurement gives bounds454,308–628,390 and about10:1 contrast, plus visual read-back. See `review/export-text-qa.json` and `review/media-verification.json`.
- Both actual films:1080×1920,30fps,H2644:2:0/AACstereo48kHz,450/405frames. Renderer requestedyuv420p but actual output is full-rangeyuvj420p; this is reported accurately. Actual browsers decode it; social-platform transcoding remains untested.
- All food/character geometry and sound are original procedural assets authored through AI-assisted code. No image/video-generation service, photoreal synthetic food, stock, publisher image, synthetic voice, customer data or app response enters these films. Inter is SIL Open Font License; source and license files are bundled. AI/media-label decisions for a future public variant remain separate from this private experiment.
- Popcorn explanation is sourced to [ACS](https://www.acs.org/content/dam/acsorg/education/whatischemistry/adventuresinchemistry/secretscience/popcorn/secretscience-popcorn.pdf) and [Popcorn Board](https://www.popcorn.org/All-About-Popcorn/What-Makes-Popcorn-Pop): moisture/starch, pressure, hull rupture, fluffy starch. Illustration simplifies structure and time; no measured temperature/pressure, nutrition, universal cooking instruction or actual cooking outcome claim.
- **$0 additional provider/media spend,0paid calls,$0new subscriptions.** Local compute/editing time unpriced. No production RecipeFix/DB/schema changes, distribution account writes, scheduler or public publishing.

## Git and next step

Dedicated worktree: `/Volumes/T9/Developer/Worktrees/halyard-recipefix-creative-breakthrough-20261029`; branch `feat/recipefix-creative-breakthrough-phase1b-20261029`, starting8b27eb3 atop the preserved PR104 R&D source. Integration branch remains pinned9f9b7005. A separate review PR compares against the Phase1A branch so rejected files are not presented as newly selected inventory. Existing dirty worktrees, dependencies, media and live services were preserved.

Next: founder watches these actual films and selects/rejects the creative direction. If the game resonates, develop a small family of different food games/comic actions, with a static carousel only when it genuinely suits the idea. Do not mass-render the same shell game or buy AI motion to solve an uninteresting premise. Keep product transformations for a clearer standalone dramatic concept. No merge or distribution step is authorized by this report.
