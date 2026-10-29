# Candidate B: graphic product cinema

A deliberately isolated HTML/CSS/GSAP challenger to the existing Remotion engine. This is an experiment, not a new default format or publication approval.

## Story and truth contract

23 seconds,1080×1920,30fps. Same shared source evidence as Candidate A:

- 0–3: V2 immediately shows actual ingredient-change proof linked to the actual changed-method note, seeded visibly at frame0. V1 food/headline aperture is preserved only in its prior export.
- 3–7: actual captured RecipeFix interaction; dairy-free, six servings.
- 7–11: heavy cream½cup → full-fat coconut cream¾cup. The output also scales the recipe4→6; no universal substitution ratio is claimed.
- 11–18: source-backed method notes to whisk separated coconut cream smooth before adding and keep the sauce at a gentle simmer.
- 18–23: actual result header, product takeaway and recipefix.app.

The source is a stored production result from2026-10-21 presented in the current RecipeFix UI using fixture responses. It is not a new live adaptation. A persistent 'Recorded-result demo' disclosure remains in the composition. No nutrition, cooking success, taste, allergy-safety or guaranteed outcome claim appears. The food image is the licensed Original image, not an adapted cooked result. No narrator, generated media, paid API or publishing integration is invoked.

## Small local toolchain

`tool-package.json` pins hyperframes0.8.214 and GSAP3.15.0 in a separate tool directory; it is not a workspace/root dependency. Actual tool installation was made only in:

`/Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/hyperframes-tool`

Install used npm `--ignore-scripts --no-audit --no-fund`, with npm cache on T9. The initial install added78packages in3seconds. Node23.10.0, macOSarm64, existing systemChrome and FFmpeg/FFprobe7.1.1 were detected. No browser or speech model was downloaded. Telemetry is disabled through `HYPERFRAMES_NO_TELEMETRY=1` in the process environment. Commands run without project/provider credentials.

HyperFrames engine/CLI: Apache2.0. GSAP uses its separate [standard no-charge license](https://gsap.com/standard-license/), not Apache2.0; preserve its license. Font and source-media licenses remain independently applicable. [Pinned CLI metadata](https://registry.npmjs.org/hyperframes/0.8.214), [engine source/license](https://github.com/heygen-com/hyperframes).

## Prepare and render

After all shared assets exist:

```sh
node packages/marketing/cinema/hyperframes/prepare.mjs \
  /Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/assets \
  /Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/hyperframes/project \
  /Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/hyperframes-tool
```

The helper defaults to the shared committed `../assets` directory for offline reproducibility; explicit source/output/tool arguments still work. It verifies required files and at least2seconds of interaction media, copies shared assets and existing Inter fonts, and keeps all bulky output on T9. T9 output requires the volume to be mounted and encrypted before directory creation. It never requests or invents app output. The HTML remains the source of truth; the prepared directory is regenerable.

Run the pinned tool's `lint`, `check --json` and snapshots on the prepared project, then its local preview. The requested finished video may then be rendered without an intermediate owner stop:

```sh
HYPERFRAMES_NO_TELEMETRY=1 /Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/hyperframes-tool/node_modules/.bin/hyperframes render \
  /Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/hyperframes/project \
  --fps 30 --quality delivery --workers 2 \
  --frames-cache-dir /Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/hyperframes/frame-cache \
  --output /Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/hyperframes/candidate-b.mp4
```

Use actual CLI spacing (`--fps 30`, `--workers 2`); metadata and measurements from completed runs belong in `RESULTS.md`. Do not run cloud/publish/media-generation commands. `doctor --json` returns0 even for failures; inspect relevant checks.

## Creative self-review before first render

The graphic approach should make the ingredient-to-method relationship clearer than captioned stock. Risks to inspect in the actual render: source UI text could shrink below phone readability; fixed image fit may reveal too much irrelevant UI; the selection capture must show a coherent real interaction; huge type and match cuts must earn their timing rather than become generic poster animation. Actual source crops and decoded interaction frames were inspected before rendering. The shared source recording had gray unused canvas; the corrected common interaction-viewport.mp4 removes only that unused upper-left390×844 viewport padding. B uses the real2.28s once, then holds the actual choose.png configuration; no looping or fabricated inference. No quality verdict is inferred from these intentions.

V2 is the current delivery candidate. V1 remains an unchanged comparison export. See `RESULTS.json` and `RESULTS.md` for both runs and independent-review limitations. The new adaptation-specific method instruction is to whisk separated coconut cream smooth; the Original already said to simmer gently, so the gentle-simmer beat retains/reinforces existing guidance rather than inventing a new heat change.
