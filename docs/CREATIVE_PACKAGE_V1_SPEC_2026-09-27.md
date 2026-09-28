# CreativePackage v1 — canonical creative contract

**Date:** 2026-09-27
**Status:** implementation contract
**Purpose:** remove parallel creative pipelines by forcing every post-producing entry point through one product-neutral object before production begins.

## 1. Why this exists

Halyard already has good systems for ideas, treatments, screenplays, copy, media direction, rendering, QC and learning. The problem is orchestration: Launch, Campaigns, Floor, daily generation and external visual production can make different subsets of those decisions in different orders.

`CreativePackage` does not replace those systems. It is the canonical container they populate and consume.

A renderer/provider must not infer strategy. A scheduler must not infer the creative. A social adapter must not infer content. All three read an approved package/variant.

---

## 2. Content families

```ts
export type ContentFamily =
  | 'proof_demo'
  | 'transformation'
  | 'teach'
  | 'story_pov'
  | 'entertainment_social'
  | 'creator_style';
```

These are audience experiences, not media formats.

---

## 3. CreativePackage shape

The TypeScript source of truth is `packages/core/src/creative/package.ts`.

Conceptually:

```ts
interface CreativePackage {
  id: string;
  version: 1;
  productId: string;

  origin: {
    kind: 'launch' | 'campaign' | 'daily' | 'manual' | 'opportunity' | 'experiment';
    ref?: string;
  };

  family: ContentFamily;
  objective: GrowthObjective;

  audience: {
    description: string;
    problemOrDesire: string;
    awareness: 'unaware' | 'problem_aware' | 'solution_aware' | 'product_aware' | 'mixed';
  };

  concept: {
    premise: string;
    whyCareBeforeProduct: string;
    hook: string;
    payoff: string;
    emotionalAngle?: string;
  };

  proof: ProofRequirement[];
  evidenceRefs: string[];

  story: {
    targetSeconds?: number;
    beats: CreativePackageBeat[];
  };

  visual: VisualDirection;
  audio: AudioDirection;
  cta: CtaDirection;
  experiment?: ExperimentDirection;

  productionRequirements: ProductionRequirement[];
  platformVariants: CreativePackageVariant[];

  qualityBar: QualityRequirement[];
  status: PackageStatus;
}
```

---

## 4. Proof requirements

Every proof-bearing package states what evidence is required before production.

```ts
interface ProofRequirement {
  id: string;
  claim: string;
  kind:
    | 'product_capture'
    | 'product_artifact'
    | 'verified_fact'
    | 'external_source'
    | 'operator_statement';
  sourceRef: string;
  mustAppearVisually?: boolean;
}
```

Rules:

- `product_capture`: only real browser/native/product footage satisfies it.
- `product_artifact`: real connector output / stored product artifact.
- `verified_fact`: stable Product Brain `FACT:<category>:<key>` provenance.
- `external_source`: researched citation with freshness/provenance.
- `operator_statement`: opinion/intent, never masquerading as measured product truth.

A generated image/video cannot satisfy `product_capture`.

---

## 5. Beat contract

A beat says what the audience must understand and what kind of media is allowed to carry it.

```ts
interface CreativePackageBeat {
  id: string;
  purpose: 'hook' | 'problem' | 'reveal' | 'proof' | 'explain' | 'payoff' | 'cta';
  seconds?: number;
  spoken?: string;
  onScreen?: string[];
  direction: string;
  evidenceRefs?: string[];
  mediaNeed: MediaNeed;
}
```

`MediaNeed` distinguishes truth from illustration:

```ts
type MediaNeed =
  | { kind: 'real_product_capture'; subject: string }
  | { kind: 'real_supplied_media'; subject: string }
  | { kind: 'generated_broll'; subject: string; realism: 'illustrative' | 'photoreal' }
  | { kind: 'generated_presenter'; subject: string; disclosureRequired: true }
  | { kind: 'motion_graphics'; subject: string }
  | { kind: 'template_frame'; subject: string }
  | { kind: 'none' };
```

A proof beat that requires real product capture cannot be downgraded to generated B-roll merely because capture is unavailable.

---

## 6. Visual direction

Visual direction is a creative decision shared by every downstream provider.

It contains:

- visual language;
- pace/rhythm;
- composition hierarchy;
- color/brand references;
- typography intent;
- caption style intent;
- camera/shot direction when applicable;
- realism requirements;
- forbidden visual shortcuts;
- product-proof treatment;
- first-frame requirement;
- final-frame/payoff requirement.

Existing Halyard `CreativePlan`, `DirectionChoice`, `Screenplay`, motion, typography and treatment logic may populate this object rather than being deleted.

---

## 7. Audio direction

```ts
interface AudioDirection {
  narration: 'none' | 'synthetic' | 'founder' | 'creator';
  voiceIntent?: string;
  music: 'none' | 'subtle' | 'driving' | 'editorial' | 'custom';
  musicIntent?: string;
  soundEffects?: string[];
}
```

Audio is not automatic. A text-led or product-sound piece may deliberately have no narration.

---

## 8. Platform variants

The package carries one shared idea plus one variant per intended social identity.

```ts
interface CreativePackageVariant {
  id: string;
  accountId: string;
  platform: string;
  format: 'text' | 'image' | 'carousel' | 'video' | 'pin' | 'story';
  subtype?: string;
  objective: string;
  hook: string;
  captionBrief: string;
  titleBrief?: string;
  targetSeconds?: number;
  beatOverrides?: BeatOverride[];
  destination?: DestinationIntent;
  scheduledWindow?: string;
  productionRequirements: ProductionRequirement[];
}
```

Variants may share source shots but must not be forced to share final media.

A platform may be omitted entirely when the idea has no strong native expression there.

---

## 9. Production requirements

Requirements describe capabilities, not vendors.

Examples:

```ts
{ capability: 'real_product_capture', required: true }
{ capability: 'cinematic_broll', required: true, quality: 'premium' }
{ capability: 'branded_carousel', required: true }
{ capability: 'synthetic_narration', required: true }
{ capability: 'final_video_assembly', required: true }
{ capability: 'transcript_edit', required: false }
```

The `ProductionRouter` chooses providers later.

This separation lets Halyard replace Higgsfield/Canva/Descript without changing campaign strategy.

---

## 10. Provider recipe

After routing, the variant receives a reproducible `ProductionRecipe`.

```ts
interface ProductionRecipe {
  variantId: string;
  steps: ProductionStep[];
  estimatedCostUsd?: number;
  estimatedSeconds?: number;
  reasons: string[];
}
```

Each step stores:

- capability;
- provider;
- model/template/treatment where relevant;
- input refs;
- output role;
- whether the step is truth-critical;
- cost estimate;
- fallback policy;
- deterministic reason for provider selection.

A recipe is versioned so metrics can later answer whether one production approach outperforms another.

---

## 11. Provider policy v1

### `halyard_capture`

Use for real product UI/behavior and any proof that must show the app itself.

### `higgsfield`

Use for generated illustrative video/B-roll, presenter/tutorial treatments and premium synthetic source shots. It never satisfies truth-critical product capture.

### `canva`

Use for approved autofillable branded templates: carousel, infographic, static educational/saveable assets.

### `halyard_render`

Use for deterministic final assembly, motion graphics, overlays, real captures, captions, split screens and unsupported static layouts.

### `elevenlabs`

Use for synthetic narration when narration is intentionally part of the creative.

### `descript`

Use when a piece benefits from transcript-native edit/reframe/polish. Optional, not a universal stage.

### `blotato_visual`

Legacy/fallback visual producer only. Must not be the default once the v2 production providers are configured and calibrated.

### `blotato_transport`

Not a production provider. Publishing/scheduling boundary after finished asset approval.

---

## 12. Quality requirements

A package can define format-specific hard requirements such as:

- meaningful first frame;
- first verbal hook <= 1.5s;
- no dead visual segment > N seconds;
- minimum meaningful visual changes;
- real product capture appears by second N when the creative promises product proof;
- text stays inside platform safe areas;
- no generated UI;
- no visual artifact above severity threshold;
- no fake customer/testimonial framing;
- narration WPM range;
- caption does not transcribe the video;
- final creative has a clear payoff;
- CTA is absent unless the strategy explicitly needs one.

These become QC assertions against the rendered artifact where measurable, plus structured critic judgments where perceptual evaluation is required.

---

## 13. Lifecycle and status

```text
draft
  ↓
strategy_ready
  ↓
creative_ready
  ↓
production_planned
  ↓
producing
  ↓
review_required
  ↓
approved
  ↓
archived
```

A package may be `rejected` at any pre-publication stage.

`approved` here means the creative package/asset is approved for downstream scheduling. The global publish switch and content-item/platform approval boundary remain separate.

---

## 14. Relationship to current Halyard objects

### Keep

- `ideas`: upstream opportunity/concept candidates.
- `CreativePlan`: treatment/evidence-derived story structure; becomes package/story input.
- `Screenplay`: detailed video staging for a video variant.
- Creative Director: fills visual direction.
- Media Director: translates beat needs into production requirements/candidates.
- format-specific copywriter: writes platform variant copy.
- `content_items`: the concrete social deliverable / publication unit.
- assets/renders/QC/publications/metrics/learning.

### Change

- Launch, Campaigns, Floor and automated generation must create/select a Creative Package before content items start production.
- `content_items` keeps its existing `concept_id` / `brief_id` lineage; `concepts.id` is the CreativePackage id and `platform_variants` closes the platform link.
- render/external-provider jobs consume a `ProductionRecipe`, not ad-hoc generation metadata.
- expensive provider calls cannot happen before package/variant policy permits them.

### Deprecate over time

- entry-point-specific creative decisions that duplicate Package fields;
- direct "caption → visual vendor" flows;
- provider-specific strategy embedded inside external visual handlers;
- format decisions inferred independently by separate downstream stages.

---

## 15. Acceptance test

A valid v1 implementation must prove:

1. Launch and Floor can start from different UI actions and converge on the same package schema.
2. A RecipeFix proof beat requiring product UI routes to real capture and refuses a synthetic substitute.
3. An illustrative food shot can route to Higgsfield without contaminating product-proof provenance.
4. A branded carousel can route to a Canva template when configured and to Halyard native render when it is not.
5. A video variant can route narration to ElevenLabs and final assembly to Halyard.
6. A creator/spoken variant may insert Descript without making it mandatory for other video.
7. Blotato receives a finished asset/caption, not an open-ended creative prompt.
8. Package/variant/recipe IDs survive into `content_items` and publication metrics.
9. Artifact QC evaluates the actual finished result.
10. A rejected creative can be revised without losing lineage to the package and prior production recipe.
