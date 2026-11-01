# RecipeFix cinema — hybrid quality direction (Remotion + HyperFrames)

**Date:** 2026-11-01  
**Status:** Creative direction and engineering acceptance contract, not a shipped renderer integration or approved public post.  
**Scope:** The recorded RecipeFix ingredient→method adaptation from the Oct 28 benchmark, plus one future *new* verified product action. This is an isolated proposal; no changes to Halyard production, MomentCircuitV2 or the live RecipeFix application.

## Decision

**Remotion owns final edit, audio, caption timing, legal/source disclosures, final platform-safe 9:16 master, and all Halyard QC/publishing gates.** HyperFrames remains an **optional graphics authoring tool** for tightly scoped deterministic HTML motion components, title reveals, illustrated ingredient changes, and proof annotations. Export optional overlay assets/segments (PNG sequence or transparency-capable container, with alpha checked at import) rather than running two independent full renders for every finished post. When a component can be implemented simply in Remotion, prefer the already-installed Remotion code. Do not create a premature global renderer router.

The benchmark established that either engine can produce working 1080×1920 30fps video; it **did not** establish that one causes higher creative quality. Change the film, not the logo on the renderer.

## Audience proposition

One causal claim, grounded by a recorded source: a dairy-free change to this recorded Chicken Tikka Masala result affects the ingredient and an instruction. 4→6-serving quantities ½ cup heavy cream → ¾ cup full-fat coconut cream are context-specific; **not** a universal conversion ratio. The recorded result adds the instruction to whisk separated coconut cream smooth before adding; the Original already simmered gently. This demo is *fixture-backed recorded material*, not a fresh live generation or cooked dish proof.

Avoid declaring the adapted dish looks or tastes better; do not show a generated altered finished dish as product proof. Source screenshots and modified footage must retain a visible "Recorded-result demo" disclosure.

## V3 creative brief: one idea, purposeful five-act edit (22–25 seconds)

| Time | Beat | Visual evidence & motion | Why viewer continues |
|---|---|---|---|
| 0.0–1.4 | **Hook**: "Dairy-free shouldn't break dinner." (Alternative only if grounded: "Change the cream. Not just the ingredient list.") | Start on **real ingredient row AND linked method note** with bold/quiet editorial type, punchy causal arrow; never open on a logo or empty canvas | Immediate conflict + proof |
| 1.4–4.0 | Show user intent | **Real captured** Dairy-free / Serves 6 state, clear readable selection, one purposeful tap/push, no fake UI navigation | Demonstrates it is an app, not a static recipe card |
| 4.0–8.2 | Ingredient conversion | Track in on actual ½→¾ ingredient row. Typography and arrow can be HyperFrames-made overlays, but UI stays genuine | Concrete transformation |
| 8.2–14.5 | **Payoff — method changes with it** | A match-cut follows the new coconut ingredient to the genuine instruction: "Whisk separated coconut cream smooth before adding." Reveal source note on screen while a short human-readable verb card guides the eye | Product differentiation; the changed instruction is the hero |
| 14.5–19.5 | Finished recipe interface | Real actual adapted-result card with source/disclosure. Brief movement across the actual UI. No nutrition panel or generated cooked outcome | Earn trust, not hype |
| 19.5–23.5 | Conversion close | "Your recipe. Made for you." or more literal "Ingredients and method, adapted together." + recipefix.app + a product-centered closing frame | Rememberable benefit and action |

**Do not imitate a slideshow:** No static screen longer than ~2–3 seconds without meaningful internal change, focus shift, or revealed information; no excessive whooshes/zooming solely to create movement. Pacing must be reviewed as a *whole film*, not optimized by formula alone.

## Art direction synthesis

- Use RecipeFix's food-appropriate warm cream/sage, editorial serif for major story statements, strong black/green contrast for proof labels and active-state accents. The HyperFrames lime/ink visual hierarchy is good, but the full fluorescent field is less aligned with the food product than Remotion A.
- Borrow B's exact quantity comparison and method verb hierarchy. Borrow A's brand texture and warmer product atmosphere.
- Motion is spatially causal: the ingredient moves/changes, a line traces to the revised method instruction, and the result becomes a composed recipe screen. A graphic should never travel if it conveys no story.
- Keep the product screenshot sharp on a 390px viewport; never warp/tilt it into illegibility.
- On every format, include the initial semantic content at frame 0 and through every scene cut; no blank early frames.
- Audio: inspect actual music bed listening, not merely LUFS measurements. One cohesive original licensed bed; purposeful small cues at UI tap, ingredient transformation, and method reveal. Re-measure integrated loudness and true peak on the *encoded output*. Don't make loudness alone a taste approval.
- Use no unearned "AI magic" titles, bogus confidence statistics, synthetic cooking proof, or unlicensed image/audio assets.

## Implementation boundaries

1. **V3 creative is a separate branch/worktree.** Do not edit the active Halyard root, publish adapters, or MomentCircuitV2. Pin Node 22+/23 as required, pinned HyperFrames, GSAP and existing Remotion versions.
2. Render first draft in **Remotion** using its existing audio/captions/FFmpeg pipeline. Use source manifest by exact content hashes and provenance; no new AI provider calls needed for initial visual assembly.
3. Prototype one **HyperFrames overlay only**: animated proof connector plus headline or quantity transformation. Export 1080×1920 with alpha to a verified transparent PNG sequence (or lossless alpha-carrying MOV) and confirm alpha/pixel bounds. Reuse the same screenshot as Remotion for fairness.
4. Compose overlay in Remotion. Compare **Remotion-only** V3 and **hybrid** V3 with identical timing/creative brief/props; if hybrid yields no perceptible craft advantage, keep the simpler Remotion-only implementation.
5. No automatic posting, no live paid-media/provider generation, no browser writes. Preserve Halyard's claim verification, media safety, privacy, platform compliance, operator approval and cost budget.

## Acceptance gate (all must pass before recommending publication)

- **Grounding:** Every on-screen quantity and instruction matches the recorded result; 4→6 context and recorded-result disclosure are visibly readable. No false new simmering instruction. Independent source review passes.
- **Technical:** Decode 100% of MP4, exact frame count/duration, no codec/pixel-format surprise, mobile playback reaches `ended`, no missing/duplicate frames, no unexpected opacity 0 moments.
- **Visual:** Inspect frame 0, 0.3, 0.7, 1.5, exact cut boundaries, 1 fps sweep, ending, and responsive phone-scale playback with sound off/on. No accidental text overlap, truncated claims, transition seams, ultra-small source text or color contrast failures.
- **Audio:** Measured integrated loudness/true peak + human listening for musical fit and cue timing; no clipped or hidden audio.
- **Creative:** Independent critique and founder review evaluate hook strength, product understanding, novelty, emotional tension, food-app brand fit, rhythm, sound design and clear action. Do not call something premium because it passed automated tests.
- **Performance:** Benchmark warm & cold at least three runs, control browser/threads/cache, record wall time, CPU/memory, film bytes and failure/retry rate. Source video and motion assets are the same; compare only the added authoring approach.
- **Economics:** Report local media rendering costs separately from AI/video-generation provider costs. No claims of ROI or high-retention without posted, measured campaign evidence.

## Explicit stop/go decision

**GO:** Produce a high-quality V3 creative draft with Remotion as the final assembly tool and one small optional HyperFrames overlay experiment.  
**NO GO:** Wholesale Halyard renderer replacement, automatic publishing, changing customer app code, deploying this as an ad, migrating MomentCircuit's clipping pipeline, or saying the blended result meets premium quality before a founder sound-on/art-direction review.

**Existing evidence:** `packages/marketing/cinema/hyperframes/QA_RECHECK_2026-11-01.md`, `packages/marketing/cinema/INDEPENDENT_REVIEW.md`, archived original and fixed candidate MP4s on /Volumes/T9.
