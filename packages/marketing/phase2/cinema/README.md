# Current product film and bounded image-first research

The current final product cut is `broiler-product-v3.mp4` (12s,1080×1920). Its native generated hero is `assets/broiler-hero.mp4` (6s,720×1280), trimmed by0.8s in the edit. `assets/broiler-frame-1.jpg` guided motion; `assets/broiler-frame-2-rejected-endpoint.jpg` is retained as the rejected endpoint experiment. The API pilot completed after the founder’s refill/resume, with estimated total usage $0.70–$0.75 under $2; no further paid generation is pending. Exact requests are in google-experiment.py, receipts and usage-estimate.json.

The final film combines AI planning illustration with genuine historical RecipeFix UI/method pixels. It does not claim a filmed cooking/taste test or automatic appliance detection. The tray self-propels; that artifact remains disclosed. The edit is silent, with all voice generation held. Independent whole-edit v2 review recommended KEEP for founder review; root verified the final v3 crop and full playback. Source720p is upscaled in the1080p edit, not native4K.

Reproduce the final edit without another provider call:

```sh
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/integration/scratch ./node_modules/.bin/tsx packages/marketing/phase2/cinema/render.mts unique-product-tag --product
```

The two built-in generated style frames are saved as `assets/fresh-pineapple-style.png` and `assets/canned-pineapple-style.png`. Their exact prompts and route are preserved below. `contrast-cut/pineapple-contrast-cut-v1.mp4` is a separate10.5s licensed-preparation/generated-still rewrite, not I2V or a gelatin experiment. It is R&D, not automatically qualified inventory. Prior cuts remain for comparison.

---

# Image-first visual proof

The founder's [PR116 quality reset](https://github.com/GoldenRodger5/Halyard/blob/954c5463b4d03645a4b01f831daa471acd5c42cb/packages/marketing/strategy/2026-10-29-CINEMATIC-VISUAL-QUALITY-RESET.md) rejects the PR115 protein-grid film. This folder is a bounded proof, not another production batch or a new publishing pipeline.

Two coherent generated macro style frames replace generic fruit/scissors primitives: a wet fresh pineapple wedge above **unset liquid**, and an unbranded pineapple can beside an illustrative gelatin dessert. Both were made with the built-in image tool, without API keys, new subscriptions or external reference imagery. Exact prompts are recorded below. Generated art is not a photographed experiment or a RecipeFix cooking result.

`pineapple-proof-v1.mp4` is a 13-second **licensed-real-footage alternative**: 9.5 seconds of actual pineapple-cutting action, then 3.5 seconds of generated canned-fruit art and practical payoff. It is not an image-to-video result. Silent by design; voice generation remains held. `proof.json` binds the gallery to exact files/hashes. It is experimental reference media, outside the six-parent/fourteen-variant production packet, with no account, schedule or release approval.

Actual footage: [Mateusz Feliksik / Pexels 13603935](https://www.pexels.com/video/close-up-view-of-cutting-pineapple-13603935/), downloaded from `https://videos.pexels.com/video-files/13603935/13603935-hd_1920_1080_25fps.mp4`. The [Pexels license](https://www.pexels.com/license/) permits free use, modification and promotion, without implied endorsement. Original source is preserved on T9 at `food/scratch/pexels-13603935.mp4`. A bounded 0–9.5s crop `(608,1080,x650,y0)`, scaled to 1080×1920/30fps, is included in `assets/pineapple-preparation.mp4`; original audio is excluded. This is preparation footage only. Roman Odintsov's alternative was inspected and not used.

Science sources: [UGA Extension tropical-fruit/gelatin lab](https://extension.uga.edu/content/dam/extension/programs-and-services/science-behind-our-food/documents/tropicalfruitgelatinlab.pdf), [Academy of Nutrition and Dietetics pineapple article](https://www.eatright.org/food/food-groups/fruits/all-about-pineapple). Fresh bromelain can prevent gelatin setting by breaking down proteins; canning heat inactivates it. Follow the recipe's fruit instructions. There is no already-set dessert liquefaction demonstration or actual comparative trial here.

Existing Remotion, FFmpeg and licensed Inter font compose the export; no runtime/dependency/model was installed. `render.mts` verifies encrypted T9, preserves prior output, uses PNG frames and BT.709 and stores bundles/render scratch externally. Reproduce with installed dependencies:

```sh
TMPDIR=/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/integration/scratch ./node_modules/.bin/tsx packages/marketing/phase2/cinema/render.mts unique-rebuild-tag
```

The first bundle attempt failed a TSX syntax check before media output; the corrected source passed TypeScript and rendered `integration/cinema/proof-v2/pineapple-proof.mp4`. The source/render-tag distinction is deliberate: that is the exact file archived as the first playable proof. Prior output is not overwritten. Actual playback, independent taste judgment and any free Flow shot are recorded separately; still images alone do not satisfy the cinematic movie gate.

## Exact built-in generation prompts

### Fresh frame

Use case: ads-marketing. Asset type: vertical 9:16 cinematic food-science style frame, 1080x1920 or taller portrait. One frame only, no panels, no typography. Primary request: a richly tactile photorealistic macro food image for a short explaining why fresh pineapple can prevent gelatin setting. Scene: a single triangular wedge of FRESH pineapple suspended a few centimeters above a shallow, round clear glass dessert bowl containing translucent pale amber liquid gelatin mixture. A couple of tiny juice droplets are falling from the pineapple toward the liquid; the mixture is LIQUID, not a formed dessert collapsing or melting. Pineapple fibers, tiny wet juice highlights, irregular rind and green edge naturally detailed, appetizing, editorial commercial food cinematography. Camera three-quarter low macro view, close enough to see liquid meniscus and crisp pineapple fibers; coherent soft directional side light, dark blue-green slate background, warm golden fruit contrasting with cool glass, elegant slightly moody real kitchen light. Narrow depth of field but fruit edge and bowl rim sharp, believable glass refraction, physical scale, no magical glow. Keep bowl and wedge completely in the central 65 percent of the frame with room above for later tiny headline. No hands, no faces, no scissors, no protein grid, no text, no labels, no logo, no watermark, no splash explosion, no already-set jelly liquefying. This is illustrative generated art, not evidence of a performed kitchen test.

### Canned frame

Use case: ads-marketing. Asset type: single vertical 9:16 portrait cinematic food-science style frame, 1080x1920 or similar portrait. Primary request: a photographic illustrative companion scene for the cooking fact that canning heat inactivates pineapple bromelain. Scene: a plain unbranded brushed tin can with opened pull-tab lid folded safely backward, filled with golden canned pineapple rings in juice, on a dark blue-green slate kitchen surface. In front, a low clear round glass dessert dish with one small beautiful translucent pale golden gelatin dessert, side-lit with rich optical detail. The can is clearly a tin food can, absolutely no printed label, no fake ingredient label. One pineapple ring leans naturally inside the can opening. Same coherent material palette as a moody macro food commercial: warm golden fruit, cool smoky teal shadows, real sharp fruit fibers and glass refraction, beautiful side light from upper left, tasteful falloff and shallow depth of field, believable relative scale, slight irregularity, not a flawless 3D primitive. Three-quarter low macro camera, centered composition with objects occupying middle two-thirds; uncluttered negative space above for later small readable copy. No people, no hands, no text, no lettering, no logo, no watermarks, no arrows, no scissors, no flat icon graphics, no steam from a room-temperature can, no scientific experiment measurements. This generated art illustrates an ingredient choice, not a photographed kitchen test or proof of a recipe result.

No CLI/API fallback was invoked. Project assets are saved here, with the tool's original generated copies left intact in Codex's generated-images folder.
