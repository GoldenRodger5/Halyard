# RecipeFix Product Cinema: Phase0 + Phase1A

**Status: two actual rendered candidates, independently reviewed; awaiting founder creative review. No publication approval.** Base `9f9b7005` on `feat/marketing-lean-lane-poc-20261026`. All implementation is isolated here; existing formats, rejected exports, publisher, schemas and RecipeFix application are unchanged.

## Watch the actual films

[Open the comparison board](review/index.html). Each has a 390 px player, sound controls, full-size download and contact sheet.

| | Candidate A | Candidate B |
| --- | --- | --- |
| Direction | Warm editorial product planes, food texture and RecipeFix serif | Bold graphic hierarchy, linked evidence, cream-quantity comparison |
| Final film | [Remotion MP4](review/candidate-a.mp4) | [HyperFrames MP4](review/candidate-b.mp4) |
| Phone preview | [A 390 px](review/candidate-a-390.mp4) | [B 390 px](review/candidate-b-390.mp4) |
| Frames | [A contact](review/contact-a.jpg) | [B contact](review/contact-b.jpg) |
| Source | [React composition](remotion/ProductCinema.tsx) | [HTML/GSAP composition](hyperframes/index.html) |
| Actual export |1080×1920,30 fps,690video frames, H2644:2:0, stereo AAC | Same |
| Duration |23.000 s video; AAC padding extends container to23.061 s |23.000 s |
| Final local run | See final receipt; A4 took16.1s total |19.664s wall /18.5s engine |
| Additional provider/subscription cost |$0 /none |$0 /none |

Full-size original outputs and earlier revisions remain at `/Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/`. Actual raw UI recording: `captures/interaction-raw.webm`. Reviewed final source versions are identified in `review/verification.json`; the earlier failed/rejected draft renders are not approved inventory.

## What the product demonstration proves

The story is a real recorded adaptation of RecipeFix Original Chicken Tikka Masala: Dairy-Free,4→6servings. Heavy cream½cup becomes full-fat coconut cream¾cup. The newly added cream-specific method note says to **whisk separated coconut cream smooth before adding**. Gentle simmering was already in the Original; it is retained/reinforced guidance, not a change from boiling.

The result is the exact stored production response captured2026-10-21 in `src/data/landingRealResult.ts` at RecipeFix `3f32680f`. The payload is committed as [real-result.json](assets/real-result.json). The current public `https://recipefix.app` UI was genuinely clicked and recorded on2026-10-28, with that payload fulfilled locally at the adaptation boundary. A usable authenticated QA session was not available, and this avoids new inference spend/customer writes. **This is a recorded-result/fixture-backed product demonstration, not a fresh live adaptation.** That limitation is disclosed on screen and in the board.

The browser guard fulfills `adapt-recipe` from the recorded response, blocks nutrition/other function requests and Supabase mutations, and suppresses analytics. The receipt logs the exact actual route/selection/capture timings without cookies, headers or credentials. No nutrition numbers appear in the final film. No physical cooking, taste, allergy safety, universal swap ratio or improved nutrition is asserted.

The food image is the licensed **Original recipe photograph**, not the adapted dish. Its source is Unsplash photo1585937421612-70a008356fbe, recorded in product `docs/RECIPEFIX_ORIGINALS.md`; the opening labels it. B's final opening uses actual UI proof rather than food. [Source/rights manifest](source-manifest.json), [capture receipt](capture-receipt.json), [font licenses](assets/fonts).

## What changed after looking at the exports

- A1 had a tiled/corrupted first frame under system Chrome. Reusing the installed Remotion headless-shell and explicitly waiting for local fonts resolved it in decoded exports.
- A's disclosure needed a solid backing; the configuration view needed a larger crop; the closing title and CTA needed distinct positions. These were fixed, preserving the actual UI pixels.
- B1 had a food/headline-only opening, temporarily absent meaningful text at scene entries, a disclosure overlap and a camera crop that competed with its subtitle. B2 shows real ingredient→method proof immediately and preserves outgoing meaning through the payoff transition.
- Both original openings delayed the evidence until7–11s. Independent critique led both to reveal the actual relationship inside the first 2 s, then explain the setup and detailed evidence.
- The same original narration-free score was initially around−30LUFS. It was normalized to−20LUFS in both. No Roger or other rejected voice, paid media model, external music track or third-party audio sample is used.

[Independent review](INDEPENDENT_REVIEW.md) reports actual full muted and unmuted browser playback at 390 px, every second of decoded footage, opening/boundary checks and concrete strengths/weaknesses. It is independent of the authoring agents. It does not grant publication approval. Auditory playback/levels were verified; musical taste remains unassessed and needs founder review. Existing automated critic scores were not used as creative approval.

## Technology decision

**Creative preference: B for quick mobile clarity.** A better preserves RecipeFix's warm food/brand character. Both still have deliberate case-study/deck pacing; neither is declared premium from a successful export.

**Keep Remotion as the core renderer; retain HyperFrames as an optional isolated authoring route.** B shows that a small HTML/CSS/GSAP composition can be edited and rendered locally without hosted generation. The pilot does not establish that HyperFrames caused the stronger direction: Remotion can reproduce its art direction, and the implementations differ. Warm run times are close and are not a controlled benchmark. Do not migrate existing formats or add another renderer abstraction from one example.

| Dimension | Evidence and implication |
| --- | --- |
| Flexibility | Both support actual UI crops, typography, camera/spatial motion and shared audio. No unique required feature forced HyperFrames. |
| Iteration | React remains familiar to Halyard. B's editable HTML timeline/preview is useful for a graphic-first film. |
| Reliability | Both exported; A's initial browser/font issue was fixed. B check warnings and transient wipe-overlap findings are retained in [results](hyperframes/RESULTS.md), not hidden. |
| Performance | Final warm local runs on the same Mac,2workers, roughly20s. Concurrency/cache/art direction differ; no broad speed winner. |
| Dependencies | A uses installed Remotion 4.0.507. B pins HyperFrames 0.8.214 and GSAP 3.15.0 outside root/workspace dependencies;78 local packages installed in3 s. Existing Chrome/FFmpeg reused. |
| Licensing | Remotion uses its existing [license](https://www.remotion.pro/license). HyperFrames is [Apache2.0](https://github.com/heygen-com/hyperframes/blob/main/LICENSE); [GSAP's separate terms](https://gsap.com/standard-license/) and the photo/font rights remain applicable. No blanket relicensing is implied. |
| Cost | No provider requests sent, paid media, subscriptions or hosted render fees. Local electricity/time not priced. |
| Maintenance | Keep the two small source compositions and one asset/receipt contract. No new schema, scheduler, account connection or pipeline rebuild. |

## Reproduce without a paid API

T9 is an existing encrypted relocated-project dependency on this Mac. Before large output, run `~/.local/bin/storage-headroom --require-t9`; verify the expected mounted encrypted volume. Do not create a replacement `/Volumes/T9` directory on internal storage. Reuse existing dependencies. Default output is on T9.

From the repo root:

```sh
./node_modules/.bin/tsx packages/marketing/cinema/scripts/render-a.mts candidate-a.mp4
```

The renderer uses the committed assets, existing Remotion headless-shell, local fonts and a custom entry, not `ListShort`. Its common font-ready wait and accurate source crops can inform later scenes without changing the old formats. To refresh product capture, inspect `scripts/capture-product.mjs`: it remains guarded/fixture-backed and must not be relabeled live inference. Do not remove its request interception.

For B, use [the pinned local-tool setup and commands](hyperframes/README.md). Its helper defaults to these committed assets. It copies into a regenerable T9 project and leaves root dependencies unchanged. Disable telemetry. Never run cloud/generate/publish commands for this pilot.

Relevant checks:

```sh
./node_modules/.bin/tsc --noEmit -p packages/marketing/tsconfig.json
./node_modules/.bin/tsc --noEmit -p packages/marketing/cinema/tsconfig.json
./node_modules/.bin/vitest run packages/marketing/src --maxWorkers=1 --minWorkers=1
./node_modules/.bin/tsx packages/marketing/cinema/scripts/qa-exports.mts
```

The actual export/critical-copy checks and all material limitations are in `review/verification.json`. Frames are checked from the encoded files, not the source prompt. Relevant existing34 marketing regression tests passed. No claim is made that unrelated database-backed/platform-wide suites ran.

## References and next experiment

[Five-reference board](PHASE0_REFERENCE_BOARD.md) records exact primary URLs and what was actually observed. Three app excerpts were freshly played0–24 s muted; two food examples were observed earlier in this conversation and are explicitly labeled as such. External reference footage stays outside Git and is not used in either film. We did not claim unviewed endings or reference audio assessment.

After founder review, make a second product-cinema episode around one real saved adaptation or Cook Mode action, with a new visual rhythm and a real product event as the opening. Carry the strongest graphic hierarchy into RecipeFix's warmer palette. Other pilots (food game, editorial carousel, optional paid motion) remain unstarted and separately scoped. No founder filming, creator hire or personal narration is required.

**Founder decision is still required on creative direction. No public post, account change, schedule or publication approval occurred.**

Export detail: ffprobe reports A as full-range `yuvj420p` and B as `yuv420p`. Both are H2644:2:0 and completed actual browser decoding; the raw metadata is retained. No social-platform transcoding test is claimed. The initial verifier incorrectly assumed both would report the same range flag; it was corrected to report the actual supported4:2:0 encodings, without changing any text/contrast threshold.
