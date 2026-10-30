# Phase 2D — spending gate, not a generated result

**Status: the exact one-shot request is prepared. Separate founder spending approval has not been received. No paid generation POST has been sent and no Phase2D action shot or new complete film exists yet.**

The [Phase2D brief](</Users/isaacmineo/.codex/attachments/5040e0bb-05f2-4465-a6ff-31b4ac1fa00a/Pasted text.txt>) explicitly says: **“This new paid request is not yet authorized.”** It requires preparing the request and stopping at the spending gate. The earlier completed $2 pilot is not reused as permission.

## Review the concrete request

[request-plan.json](request-plan.json) freezes the full prompt, provider body and reference binding. Request-plan SHA256: `2f2e56e4a78d8df1d8e2c590fa1946007c91c1c4c3db2df984c6c5ea7a866308`.

- One six-second portrait 720p image-to-video output from `gemini-omni-1.1-flash`.
- [Existing first-frame reference](../phase2/cinema/assets/broiler-frame-1.jpg), SHA256 `4bd686e2689d1c17ef128965fe7ab4a9c9a3fbd5f9b01839aee40475841b4bbd`.
- The mitt contacts/supports the foreground sheet before it moves, maintains support onto the existing rack, and releases only after the rack supports it. The second sheet waits outside. Same world/food/lighting; no morphing, collision, cooked-color change, steam or fabricated kitchen test.
- Exactly one generation attempt, no automatic retry/fallback, no new still, voice, subscription or top-up. Failed/uncertain admission or unusable physical action ends the attempt.

## Fresh preflight and cost control

The existing key received HTTP 200 for model metadata and the non-generating tokenizer. The exact public image/prompt counts 606 input tokens. [Model](model-preflight.json), [token](token-preflight.json) and [pricing](pricing-preflight.json) receipts are separate from a paid execution.

[Google pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-omni-flash) lists input at $1.50/million tokens and video output at $17.50/million; 720p video uses 5,792 tokens/second. Six seconds nominally costs $0.60816 in video output. Expected total remains about $0.62–$0.70. The prepared request tightens the earlier 45,000-output-token proposal to **40,000**, including thought/output tokens under the [Interactions limit](https://ai.google.dev/gemini-api/docs/thought-signatures.md). A 20,000-token input reserve plus all 40,000 output tokens priced conservatively at the highest output rate gives **$0.73 modeled maximum**, below the **$1 total approval cap**. No tool grounding or prior conversation is included.

Read-only AI Studio showed the Scrapbook project's Paid 2/prepay status, more than $1 credit and auto-reload Off. It also displayed an existing identity/payment verification notice. No verification, payment, account setting or credit purchase was performed. API metadata/tokenizer access is proven; generation admission is not. Any 402/403/error stops without a second generation or account repair. The exact key-to-project UI row was not exposed by the current page, so no stronger association or entitlement guarantee is claimed. [Sanitized account readback](account-preflight.json) excludes identifiers/payment details.

`submit_one.py` defaults to an offline plan. It requires an approval record binding this exact request hash, founder, one request and $1 before reading a credential or making a paid POST. It checks token/rate/source drift and fresh preflight, and creates a fixed exclusive submission marker before the only POST. Success, timeout and uncertain outcomes all consume that slot. Four fake-transport guard tests pass, including no approval/no network, changed hash/budget and blocked duplicate submission after success or timeout. No approval record exists yet.

```sh
python3 packages/marketing/phase2d/submit_one.py
python3 packages/marketing/phase2d/test_submit_one.py
```

## Why another free edit cannot supply the missing action

The [independent local audit](review/local-action-audit.json) inspected actual source media and rights, including 102 files across eight relevant Build roots, 29 older cached-video midpoint checks and five complete source/candidate playbacks. No suitable supported tray-loading alternative was found within that bounded inventory. Licensed skillet/marinade clips have action but a different food setup, cookware and world. Existing hero copies share the unsupported lift; procedural sources are not performed loading. No attributable usable Higgsfield/Kling output was found in the audited caches. This is a bounded finding, not a claim about every file on the Mac. No new stock download or provider call was made by the critic.

PR118, PR123 narration and PR124 were freshly replayed to completion (360/405/384 frames respectively, 0 dropped). Prior source hashes match. The old problems remain visible in the actual media. [Current complete film/comparison](http://127.0.0.1:4380/) is still PR124; it is not relabeled as a new Phase2D result.

## One complete editing pass, only after an acceptable shot

Aim for approximately 10 seconds: a short native-speed setup, the new action near native speed, and a same-world CTA resolution no longer than about 2.2 seconds. Remove the 3× soft macro and stretched one-second opening. Do not repeat tiny motion tails or count idle source seconds as performed action. Log actual action intervals for review; no numeric score/percentage automatically grants KEEP.

Make the muted benefit explicit during the action with one restrained, source-true RecipeFix batch-plan attribution. The factual scope remains historical October 21 Dairy-Free 4→6, chicken 1½→2¼ lb, two foil-lined sheets, one sheet at a time, sauce finishing—not oven detection, fresh inference or measured/cooked output. Stage actual text/cues against the returned scene, not guessed geometry.

Reuse the existing Chris take where it fits. A continuous excerpt through “two sheets, one at a time,” ending in the following pause, can omit the old named-recipe CTA sentence; no word stitching or new casting. Locally align licensed sound to the actual contact/release. The new invitation is to bring a recipe to **`https://recipefix.app/adapt`**, freshly verified HTTP 200 at 390px with first/last UTMs retained and all non-GET/HEAD requests blocked. Founder listening remains required. A no-voice mix is optional if useful, not an additional idea.

Apply the [independent one-shot/one-edit stop gate](review/ONE-SHOT-GATE.md). Bad support/anatomy/food continuity: reject the shot and stop. If one complete edit remains ordinary/static/artificial or commercially weak, **PIVOT**; no new crop rescue, model search or second paid candidate. A source-grounded yogurt-swap/coating story is a distinct possible pivot, not another generated task authorized here.

## Preserved work and pending handoff

All 19 editorial images across four families/eight variants remain byte-exact and independently reviewable; see [editorial-continuity.json](editorial-continuity.json) and the [retained gallery](http://127.0.0.1:4370/#rf-salt-volume). No calendar regeneration, account change, post, schedule, production RecipeFix modification or merge was made.

The isolated branch `feat/recipefix-phase2d-final-action-20261029` starts at refreshed PR124 head `e4c2365f03197f7cc39e8269c1787db2728fce21`. The [latest independent review](https://github.com/GoldenRodger5/Halyard/pull/124#issuecomment-6512827340) was read. Prior worktrees, media, narration and rights remain intact. All new output is on verified encrypted T9. New spend so far: $0; new generation requests: 0; new voice credits: 0.

After separate approval and one accepted shot, the pending deliverables are the actual new film, four-generation comparison, full native/360/390 playback, encoded sound/source/cost receipts, relevant TypeScript/marketing checks and independent KEEP / REVISE MINORLY / PIVOT verdict. None is falsely marked complete by this preflight packet.
