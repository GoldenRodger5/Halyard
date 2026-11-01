# Halyard / HyperFrames renderer bake-off — independent recheck

**Date:** 2026-11-01  
**Source baseline:** `feat/recipefix-product-cinema-phase1a-20261028` at `8b27eb3a358cf6c2d00952d0d0d02321853bd9d4`  
**Status:** **Experimental candidate passes expanded non-strict QA after a bounded patch; production renderer migration NOT authorized.**  
**Safety:** No user, account, publish, product-backend or provider mutation; no production dependency upgrade. Changes on this audit branch are limited to the isolated HyperFrames composition and this report.

## What was actually compared

Both candidates demonstrate the same **recorded** RecipeFix outcome: dairy-free Chicken Tikka Masala scaled from four to six servings; heavy cream ½ cup to full-fat coconut cream ¾ cup, plus the recipe-specific instruction to whisk separated coconut cream smooth before adding. This is **not** a new live adaptation and not evidence of a cooked result. The original side-by-side review and source/rights records are in `../README.md` and `../INDEPENDENT_REVIEW.md`.

| | Remotion A v4 | HyperFrames B v2 |
|---|---|---|
| Frames | 690 | 690 |
| Resolution | 1080×1920 | 1080×1920 |
| FPS | 30 | 30 |
| Container duration | 23.0613 seconds (AAC padding) | 23 seconds |
| Original final MP4 | 5,123,968 bytes | 5,723,173 bytes |
| Recorded final wall time | 16.109 s (bundle 0.886 + render 15.223) | 19.664 s |
| Loudness | −20.0 LUFS, peak −10.3 dBFS | −20.0 LUFS, peak −10.3 dBFS |
| Additional generation provider requests | 0 | 0 |
| Creative finding | Better warm food/brand fit | Better quick phone-scale explanatory hierarchy |

**Causality caveat:** These are two different art directions, not the same frame specification rendered through two engines. Neither can establish an engine-induced creative advantage; timings were not a controlled concurrency/thermal/cache comparison. Both still risk feeling like animated case-study slides rather than compelling cinematic social content. Founder sound-on and conversion review remains outstanding; neither is approved for publication.

## Fresh 2026-11-01 tests

Environment: macOS Apple Silicon, Node `v23.10.0`, FFmpeg, existing product screenshots and procedural original sound; all work in a separately created encrypted-T9 build directory. The first attempted subprocess accidentally inherited Node 12 via `bash -lc` and failed before execution; after explicitly prepending modern Node to PATH, the tests below ran. Treat this as a reproducibility prerequisite, not a renderer regression.

**Unchanged HyperFrames 0.8.214 baseline:**
- Expanded `hyperframes check <project> --json --samples=11 --at-transitions --max-transition-samples=36` **failed**: one `#close-arrow` text-box overflow error at ~19.864 s; warnings included four scene-wipe text overlaps near 18.315 s and two intended ingredient-card entrance overflows near 7.15 s; plus six static lint warnings (five nested-scene subcomposition suggestions and one duplicate-media-discovery warning). Runtime, motion, contrast, craft and audio sections had no errors.
- Complete 690-frame MP4 render: **pass**; FFmpeg decode: **pass**. The *unchanged* fresh MP4 was **byte-for-byte identical** to the Oct 28 original, SHA-256 `0abc477fe61a16fc2c8c27c38cfe3a2a50549e83a765044815005e84c439d204`.
- Note: the earlier default-sampling check had passed; the additional transition samples detected the bounding-box problem.

**Bounded composition QA correction on this audit branch:**
- Shrunk/repositioned the close CTA arrow to keep its text box inside its visual parent.
- Marked the incoming ingredient card's intentional off-canvas entrance and the specific old/new text pairs involved in the opaque transition wipe as intentional. These annotations do **not** mute broad runtime or contrast checks. Original moving scene transitions were inspected in final decoded MP4 frames.
- Fresh `0.8.214` expanded check: **PASS** with 0 errors and 0 warnings across runtime, layout, motion, contrast, craft and audio. **Six lint warnings remain** (five subcomposition structure, one duplicate media discovery).
- Full patched MP4 rendered and decoded: **PASS**; local SHA-256 `e4518e404c83728cb7bb42858375c6d90f7c4f135ee737a79e7042570727113d`.
- The checker is **non-strict**. `--strict` would fail on the six remaining lint warnings. Do **not** claim strict-green or zero lint findings.

**Newer HyperFrames 0.8.229 compatibility smoke:**
- Separate dependency installation with pinned `0.8.229`: **PASS**.
- Recheck of the patched composition with the same expanded sampling: **PASS**, same six structural lint warnings; no runtime/layout/motion/contrast/craft/audio findings.
- Full 23-second MP4 render/decode: **PASS**. SHA-256 `40ea3f8e092e95777908d244b10904dbcd1c80227eae693172466766f45fac02`.
- Cross-version visual SSIM on downscaled 270×480 frame sequences: **0.999859** (very close, not identical). The MP4 bytes **are different across versions**, so pin the toolchain and review upgrade output rather than assuming hash stability.
- Latest-version recorded render: ~19.5 s internal / 20.75 s wall. Patched-0.8.214 run happened under unrelated concurrent activity and took ~39.5 s internal. **Do not** interpret these isolated samples as a controlled speed comparison.

**Halyard regressions, read-only:** `tsc --noEmit` for both `packages/marketing/cinema/tsconfig.json` and `packages/marketing/tsconfig.json` passed. Focused marketing `vitest` run: **34 / 34 tests passed**, 6 / 6 files.

## Local QA evidence and videos

Everything generated by this recheck remains in:

`/Volumes/T9/Developer/Builds/hyperframes-bakeoff-20261101/`

Open the local two-player comparison board on the Mac:

```bash
open "/Volumes/T9/Developer/Builds/hyperframes-bakeoff-20261101/review.html"
```

Key files: `hyperframes-retest.mp4` (byte-identical baseline), `hyperframes-qafix.mp4` (patched 0.8.214), `hyperframes-latest.mp4` (patched 0.8.229), `check-fresh.json`, `check-qafix-final.json`, `check-latest.json`, `render-fresh.log`, `render-qafix.log`, `render-latest.log`, `cross-version-ssim.log`, and the focused `halyard-*.log` results.

The comparison board is a **local** artifact, not a public hosted app. Evidence MP4s from the Oct 28 original pilot remain committed in the baseline branch under `../review/`; the newly patched/generated MP4s are not committed or published.

## Decision

1. **Keep Remotion as the Halyard production default.** This bake-off does not justify replacing Halyard's current React/Remotion render stack or modifying MomentCircuitV2.
2. **Retain HyperFrames as an opt-in experimental authoring route** for source-grounded kinetic graphics and browser-native product explainers. The corrected composition on this branch is an explicit candidate, **not** an automatic production integration.
3. Before any production adapter, address the remaining six lints without weakening checks, pin Node/HyperFrames/GSAP, isolate browser/network permissions, require deterministic media manifests and automated MP4 playback/caption/safe-zone checks. Preserve Halyard's existing source-truth/QC/approval gates.
4. Run a second product case with a **matched art-direction specification** and a different actual product event (e.g., a Cook Mode action or KinoLog recommendation), then compare creative review, first-frame clarity, runtime, maintenance, binary size, local cost, and multi-run reliability. Do not generalize from a single RecipeFix creative brief.
5. Publication and user-facing release remain **blocked** until creative founder review, platform safety, licensing, audio taste, and actual product/market evidence are satisfied.

This audit is intentionally a *technical and visual feasibility decision*, not a claim of superior audience retention or successful marketing.
