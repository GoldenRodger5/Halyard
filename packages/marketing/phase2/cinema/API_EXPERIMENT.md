# Reviewable background-generation experiment

Status: **founder approved the capped $2 experiment on October 29, 2026**, after reviewing the exact scope below. This authorizes only these two style frames and one six-second background video, with no automatic retry or voice generation. The key was found in the actual archived Scrapbook checkout, read in memory for one official model-catalog GET, and was not copied, displayed or committed. That GET returned 200. Catalog visibility is not proof of paid generation entitlement; actual results and usage must be recorded separately.

## Exact scope and cap

Authorize at most **$2 total additional usage**, no subscription, trial, upgrade, top-up or automatic retry; voices remain held. At most **two Nano Banana style-frame generations and one six-second Gemini Omni Flash video generation**, one output per call. Use 720p motion and 1K stills. Stop after the three requests or the conservative cap, whichever comes first. A rejected generation is a stop, not permission to try another provider/model. No production app/account/billing changes.

Use official background/API execution rather than a Flow browser wrapper. Preserve an explicit receipt before each generation, its model/request ID and successful output metadata; redact all credentials and signed download URLs. A network timeout after a submitted video must lead to status/readback, never blind resubmission. Actual footage may be rejected after generation; no automatic premium verdict follows.

Current official [image documentation](https://ai.google.dev/gemini-api/docs/image-generation) recommends `gemini-nano-banana-2.1` for efficient multi-reference work. [Pricing](https://ai.google.dev/gemini-api/docs/pricing) lists $0.0336 per 1K image output, plus input/text/thinking. `gemini-omni-1.1-flash` video is about $0.10/second at 720p plus input/text, so six seconds is approximately $0.61 video output. Conservative expected total is below $1; the $2 ceiling provides input/thinking margin, not a recurring budget. Constrain duration/output tokens in each request and refuse any preflight estimate exceeding the remaining budget. No search grounding, tools, voice or open-ended agent calls.

Google [retired the Gemini API Veo 3.1 preview endpoints on October 22, 2026](https://ai.google.dev/gemini-api/docs/video). The current model catalog obtained with this exact key lists Nano Banana 2.1/Pro and Omni 1.1 Flash but no Veo model. Use current documented models rather than stale tutorial IDs. A Flow subscription/free allowance is separate from API billing.

## Creative test: “Your recipe scaled. Your oven didn’t.”

This addresses the actual high-intent RecipeFix problem, rather than making another generic food-fact background video. The shot must earn attention through material detail and a physical constraint. It is generated planning illustration, never a claimed cooked/tasted RecipeFix result.

Two coherent style frames establish one believable kitchen, same pans, same food, lighting and camera axis:

1. Macro view of richly textured red-spice-marinated chicken pieces on an uncrowded foil-lined metal baking sheet beside a compact upper broiler. Real food scale, wet irregular fibers and believable foil crinkles. A second matching prepared sheet waits beside it. Dramatic warm upper light and cool slate counter, no generic cream/green UI scene, no typography or labels.
2. The same world pulled back enough to show one sheet in the single upper broiler chamber and the second sheet waiting outside. Deliberately unambiguous capacity and sequence. No cooked-color transformation, finished curry, smoke cloud, invented ingredient label, fake test result or extra equipment.

The one six-second image-conditioned moving shot starts with the macro food, follows the first sheet sliding into the single chamber, then reframes to reveal the waiting second sheet. Food stays attached to each sheet, no teleporting pieces, morphing cookware, overlapping geometry or duplicated food. Natural cinematic camera/action, not a zooming slideshow. No hands/faces or dialogue required; no generated narrator.

If the actual shot passes independent inspection, compose one 10–15-second proof with a short opening hook, this physical reveal, genuine recorded RecipeFix method pixels (“broil one sheet at a time”) and a clean practical/product payoff. Add exact typography in Remotion, where emphasis can be timed and checked; do not ask the model to fabricate app UI or source text. Use bold color/weight when it clarifies the beat, not as a substitute for action. Do not automatically replace the held film or expand the batch.

## Acceptance and stop rules

Inspect the entire actual export at native and 390px size: the first two seconds, realistic food texture, coherent sheet/rack movement, object continuity, no uncanny morphs, readable minimal copy and a visible payoff. Compare against the toy-like held broiler film and the licensed-food alternative. One independent critic must be able to explain a substantial improvement. If it remains boring or visibly artificial, mark it rejected and stop this experiment. No typography/material loop or second paid clip is automatically authorized.

The existing licensed real-food proof and two built-in macro style frames are already reviewable without approving this proposal. Narration is generated only at the very end for clips the founder selects to post.

## Actual outcome

The initial image request was rejected with HTTP402. The founder refilled credits and explicitly resumed under the same cumulative $2 ceiling. Both style frames and the single six-second shot then succeeded. Independent review rejected frame2 as an enforced endpoint because food state/layout changed, so the one motion call used frame1 alone. The resulting shot passed independent continuity review, retaining an explicit self-propelling-tray artifact. The final12-second edit uses5.2s of that shot, genuine recorded settings with a readable endpoint hold, exact method pixels and CTA. Root verified the final clean crop, entire encoded timeline and full phone playback. No further generation is authorized or pending. See usage-estimate.json and receipts.
