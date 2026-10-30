# Phase 2B sound candidates

Two actual 13.5-second films are ready for founder listening. They use the same director-locked picture v2: the cropped heading is corrected and the floating-tray interval is excluded. Narration is the typed candidate provisionally; no audible naturalness, pronunciation or musical-taste verdict is claimed.

| Full film | Encoded loudness / true peak | SHA256 |
| --- | --- | --- |
| [Narration-led candidate](renders/recipefix-narration.mp4) | −16.39 LUFS / −1.49 dBTP | `5e07e1a7e971fd06b4c260692783ea901017edfa633d0d004a9ad5df2b39e8b6` |
| [Sound-designed comparison, no VO](renders/recipefix-sound-only.mp4) | −16.02 LUFS / −2.29 dBTP | `8156954dd35a8635f6eeda72e2ee7f04ca141da4c00a43f8f1bbcc837a7c4f65` |

Measurements use FFmpeg `loudnorm` input analysis of the final AAC tracks; they are signal checks, not a listening review.

The mix uses an actual metal-tray handling recording at the purposeful 6.5-second match cut, quiet recorded oven ventilation, and a licensed instrumental excerpt. No synthetic pulse sequence, cartoon notification, false sizzling or cooking-done timer is added. The voice version lowers the music bed; both use a final two-pass loudness treatment. These are intentional edit decisions, not a claim that an agent heard the mix.

The single connected Chris v4 take retains the complete locked script, with no word splice or speed change. Its 11.233-second source is delayed by 0.9 seconds so the provider-estimated “Open the recipe” timing lands around the 10-second CTA. The full take fits with room for the ending. [Optional WebVTT captions](narration.vtt) and `evidence/phrase-timing.json` use provider timing, not independently heard transcription. They are separate accessibility assets and are not burned into the locked picture.

## Usage and rights

The fresh preflight confirmed active Starter, 32,113 included credits available and overage disabled. One full-script request was made. The immediate counter lagged; delayed and later settled checks both show 6,685 used versus 6,619 before: **66 observed included credits**, 32,047 remaining. Final check: October 29, 2026, 23:56 UTC. The 1,500-credit/two-take cap was not approached. No second take, new cash charge, subscription change, top-up, cloning or voice creation occurred. This counter delta is not an invoice. Both the immediate and delayed snapshots remain in `evidence/voice-usage.json`; final guard is `entitlement-final.json`.

`sources.json` records primary pages, licenses, download origins and exact hashes. Used kitchen recordings are CC0. The music is “Dirt Rhodes” by Kevin MacLeod, CC BY 4.0; its complete source/license/change credit is included in every platform caption. That credit must accompany **either** film if used publicly. Starter commercial TTS terms apply to the synthetic Chris narration. Existing Google-generated planning imagery and first-party historical RecipeFix pixels retain their original provenance; nothing depicts an actual cooked/tasted adaptation or fresh inference.

## Verification and handoff

Both files completed unmuted browser transport at 360px and 390px: all four runs ended at 13.5 seconds with 405 presented/decoded frames and zero drops. Complete decoded picture hashes match the clean source and each other exactly. Whole-film temporal frames plus critical phone images were inspected; the product six-serving endpoint and specific CTA remain visible. A playback mode of unmuted does **not** establish that an agent heard the sound. Naturalness, intelligibility on a phone, music choice and effect balance remain founder-listening decisions.

Direct marketing TypeScript and all 52 existing marketing Vitest regressions passed. Frozen-contract validation found zero issues in the one parent/three variants; actual file hashes, required credit, decoded caption newlines and variant-specific UTMs were checked. `qa.json` records those results and the explicit sensory limits.

`handoff.json` contains the existing `rf-more-dinner` parent and three new native TikTok/Reel/Shorts voice variants with exact files, copy, UTMs, disclosures and rights. `deliverables.json` lists both full-film comparison roles. This adds zero new parent ideas, no account, no schedule and no publication approval. The original PR #118 comparison remains the director's separate gallery asset.

`audition.py` is a guarded one-take helper, not an automatic queue: it requires an explicit picture/script lock, active Starter, disabled overage, adequate included allowance and the exact selected premade voice. Failed/uncertain outcomes cannot silently retry. **Do not rerun synthesis after this checkpoint.** `mix.py` reproduces the two versions using the packaged licensed excerpt/effects and original voice asset; it refuses to truncate an overlong take and prefers the pinned repo-relative picture when present. `package.py` writes only the existing frozen authoring contract. No new dependencies, subscriptions, production writes or public actions were used. All bulky work stayed on verified encrypted T9.
