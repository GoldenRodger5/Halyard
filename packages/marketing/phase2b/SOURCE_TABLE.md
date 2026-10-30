# Phase 2B source and media record

The original Phase2 manifests remain authoritative for preserved material. No new paid image or video generation was used here. Each new mix copies the locked 405-frame H.264 picture stream without re-encoding it.

| Asset | SHA256 | Provenance / scope |
| --- | --- | --- |
| `audio/renders/recipefix-narration.mp4` | `5e07e1a7e971fd06b4c260692783ea901017edfa633d0d004a9ad5df2b39e8b6` | 13.5 seconds, 1080 × 1920 at 30 fps, H.264 + AAC 48 kHz stereo. One Chris continuous synthetic take, licensed music and kitchen effects. Human listening unverified. |
| `audio/renders/recipefix-sound-only.mp4` | `8156954dd35a8635f6eeda72e2ee7f04ca141da4c00a43f8f1bbcc837a7c4f65` |Same locked picture, licensed soundtrack without voice. Taste/unobtrusiveness requires human listening. |
| `video/review/dinner-picture-v2-clean.mp4` | `2ccef680712fce964c250c8e7afaeeb026beac283bc0924e3325106c0729751d` |Root-locked picture after one bounded title-crop correction. Silent picture master,405 frames / 13.5 seconds. |
| PR118 `phase2/cinema/broiler-product-v3.mp4` | `42439fcd73a3f614622de1e7cc929d1ca06cd340cd71189bdafd4d8cf4af41a7` |Byte-exact 12-second baseline; effectively silent. Preserved for comparison, not selected as the finishing candidate. |
| Original `phase2/cinema/assets/broiler-hero.mp4` | `84e86a1b9131d8164fad20caee4cf79645574ae29bb65e03705627edb8ef5e90` |Existing Google-generated 6-second, 720 × 1280 at 24 fps hero. New edit uses source 0–1 seconds and 5.2–6 seconds; excludes the floating/travel section. Same settled tail is reused in two crops. |
| Held `phase2/cinema/contrast-cut/pineapple-contrast-cut-v1.mp4` | `d7fc31b7963ad4bf85d142ac9c86b85efe90b847160a2c4f65b2d7c830c41346` |Licensed preparation/generated-still R&D. No gelatin experiment. Stop further rescue, excluded from candidate inventory. |

Historical RecipeFix result: [first-party pinned fixture](https://github.com/GoldenRodger5/recipe-fix/blob/3f32680f091d06ad9046bb95e4dfb55489d2c264/src/data/landingRealResult.ts). The combined Dairy-Free 4→6 request and method change are from October 21, 2026, not a fresh inference. Genuine settings, Original title / Serves 4, method excerpts and Make it fit pixels retain first-party provenance. The generated food does not claim to be this recipe cooked or tasted.

Exact newly cropped UI assets, cues, source slices and source hashes are recorded in [video/](video/). Inter remains SIL Open Font License. The source 720p versus composed 1080p distinction is preserved in the handoff; no native 4K claim.

Audio sources and local asset SHA256 values are in [audio/sources.json](audio/sources.json):

- [RealSquink: Metal Oven Tray Handling](https://freesound.org/people/RealSquink/sounds/851295/), CC0; finite contact aligned with the editorial state cut, not authentic production sound.
- [Joseph Sardin / BigSoundBank: Electric oven](https://bigsoundbank.com/electric-oven-s0102.html), CC0; quiet ventilation texture.
- [Kevin MacLeod: Dirt Rhodes](https://www.incompetech.com/music/royalty-free/index.html?isrc=USUAN1100542), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); excerpted, faded and mixed. Full required attribution travels in each final caption. No endorsement inferred.
- One included-plan [ElevenLabs](https://elevenlabs.io/) Chris synthetic narration; existing active Starter, no voice cloning or new library voice. Model/request, full-text alignment, usage and account guards are in [audio/evidence/](audio/evidence/). Naturalness has not been established by a human listener.

The optional oven-door recording was researched but not used; no door-close or cooked/done sound was added. Source rights do not establish sonic quality.

All 19 unchanged editorial asset hashes are enumerated in [editorial/asset-inventory.json](editorial/asset-inventory.json), with original manifests retained. Food sources are linked in [editorial/README.md](editorial/README.md); no publisher photos or footage were copied as research references.

Source-level commercial authority is the previously inspected RecipeFix release `81a6bd9e8c892b08c2510fe1bfe9ea0681a51842`, separately reread without changing the current dirty auth-development checkout. Its 90-day retention cleanup is not a returning-cook metric; positive signed-webhook Stripe invoice facts are distinct from trials/client events. See [growth/READINESS.md](growth/READINESS.md).
