# Halyard v2 implementation plan — social-growth architecture

**Date:** 2026-09-27
**Governing docs:** `HALYARD_SOCIAL_GROWTH_V2_ARCHITECTURE_2026-09-27.md`, `CREATIVE_PACKAGE_V1_SPEC_2026-09-27.md`.

## Principle

Do not rewrite Halyard. Migrate it onto one canonical creative contract while keeping current production usable and publishing disabled during calibration.

## Phase 0 — protect the current system

- Preserve the current Product Brain/rescan, Blotato mapping, delivery reconciliation and test isolation work.
- Keep the publishing kill switch off.
- Keep existing content items readable throughout migration.
- Do not require a big-bang data migration before CreativePackage can be tested.

## Phase 1 — foundational contracts

### 1. CreativePackage core types

Add product-neutral types and validators under `packages/core/src/creative/package.ts`.

Required helpers:

- package validation;
- proof/media truth rules;
- package readiness;
- package-to-variant lookup;
- package diversity/family helpers;
- stable feature extraction for learning.

### 2. ProductionRouter

Add `packages/core/src/production/` with:

- provider/capability registry;
- deterministic route planner;
- provider refusal reasons;
- cost/quality preference inputs;
- fallback rules;
- truth-critical routing rules;
- `ProductionRecipe` output.

No network calls in the core router.

### 3. Persistence

Migration `0085_creative_package_v2.sql` (package/recipe lineage) plus `0086_production_provider_calibrations.sql` (human-reviewed automation permission) extends the existing creative model rather than duplicating it:

- `concepts` becomes the persisted package core;
- `creative_briefs` carries platform-variant creative/production requirements;
- `platform_variants` remains the platform delivery lineage;
- add `production_recipes` as the missing provider-routing lineage;
- add only the package fields the existing tables cannot represent;
- preserve current `content_items.concept_id` / `brief_id` lineage;
- RLS/agent rules match the existing creative tables.

## Phase 2 — converge entry points

### Launch

Instead of staging bare content items first:

1. plan concept packages;
2. persist CreativePackage;
3. derive platform variants;
4. create content items linked to variants;
5. write native copy;
6. stop at review/production policy.

### Campaigns

Campaign planner selects/packages concepts. Campaign goal/brief become package origin/objective, not a second creative schema.

### Floor / manual make

Manual choices pin fields on a CreativePackage. The same router and QC run afterward.

### Daily/automatic generation

Strategy selects or creates a package. There is no special creative shortcut.

## Phase 3 — production providers

### Halyard Capture

Promote current browser/native capture into a first-class provider contract. Truth-critical requirement.

### Higgsfield

Implement server-side adapter using official Higgsfield API credentials:

- env-only credentials;
- model/capability map;
- reference-driven generation;
- idempotent job submission/polling;
- cost estimate/preflight;
- asset provenance;
- no product-UI fabrication.

Initial routing should use a small approved model set, not the whole catalog. Candidate classes:

- fast/affordable B-roll;
- premium cinematic hero/source shot;
- reference-driven source shot;
- creator/tutorial candidate.

Models are replaceable configuration, not strategy constants.

### Canva

Implement an adapter around brand-template datasets/autofill jobs or use the connected Canva workflow during calibration until server OAuth is configured.

Templates are curated per product/creative family. Autofill is deterministic content placement, not generative strategy.

### Descript

Integrate only after one calibration use case proves it improves creator/spoken edits. Keep behind `transcript_edit` capability.

### ElevenLabs

Keep current Halyard voice pipeline; expose it through ProductionRouter rather than special-casing video generation paths.

### Blotato

Retain unified transport. Demote Blotato visual generation to fallback/legacy after v2 production recipes are ready.

## Phase 4 — final asset QC

Unify artifact review around the finished asset.

For video:

- frame sampling at opening, beats and cuts;
- caption safe-area/legibility checks;
- product-capture proof checks;
- audio loudness/voice timing;
- generated-artifact critic;
- pacing/retention critic;
- platform-native critic;
- slop critic;
- human review during calibration.

For carousel/static:

- slide-by-slide density;
- hierarchy;
- repeated layout penalty;
- crop/safe zones;
- image artifact inspection;
- proof/source integrity;
- visual variety.

QC output should identify the smallest correction target: hook, screenplay, source shot, text overlay, crop, audio, final edit, caption, etc.

## Phase 5 — frontend convergence

Migrate normal workflow toward:

- Today
- Create
- Review
- Calendar
- Learn
- Advanced

First UI implementation target: Review details show CreativePackage (assembled from concept + brief + variant) + ProductionRecipe + actual asset together.

Do not remove current rooms until equivalent workflow exists.

## Phase 6 — RecipeFix calibration

Create a deliberately small calibration matrix, not a bulk launch.

Minimum:

1. Product-proof short using real UI + generated B-roll.
2. Educational short with no synthetic UI.
3. Human-designed/autofilled carousel.
4. Pinterest utility asset.
5. Text-native X/Threads pieces.

For each short, compare at least two opening/source treatments when cost permits. Human visually critiques actual exports.

Lock only the recipes that pass.

Then run a 3-day rolling RecipeFix wave with publishing still individually approved.

## Phase 7 — KinoLog proof

Connect KinoLog through the normal product UI and Rescan.

No KinoLog-specific production code is permitted.

Expected strategy/content should emerge from its own Brain: prediction receipts, taste-vs-crowd, Tonight, Find, Movie Night, imports, taste patterns, film conversation/trends.

Calibrate distinct visual recipes appropriate to entertainment/movie culture. They must not look like RecipeFix with different text.

## Phase 8 — automation widening

Only after calibration data:

- allow approved production recipes to auto-generate media;
- keep operator publication approval until separately authorized;
- widen rolling window from 3 days toward 7/14 where performance is stable;
- maintain exploration budget so the system does not converge on one repetitive template.

## Engineering acceptance gate

Every phase requires:

- unit tests;
- SQL planner/schema tests for migrations;
- typecheck/lint;
- browser/runtime verification for changed operator flows;
- actual render/provider fixture when production code changes;
- visual inspection of representative media;
- docs/status update;
- clean commit and remote branch state.

"The tests passed" is not sufficient for a visual-production phase. Representative output must be opened and critiqued.


## Implementation checkpoint — 2026-09-27

### Implemented and tested

- Phase 0 safety/test isolation.
- Phase 1 CreativePackage, ProductionRouter, persistence and production-recipe lineage.
- Phase 2 convergence for Launch, Campaigns, Floor-selected concepts and ordinary daily generation.
- Capability-specific production calibration persistence and Review acceptance/rejection.
- Artifact-level recipe state transition from media QC.
- Server-side Higgsfield submit/status/cancel client with mocked HTTP tests.
- Review monitor support for externally attached provider assets.

### Deliberately not claimed complete

- Halyard has no `HF_API_KEY`, Canva OAuth access token or Descript API token configured locally, so those providers are not yet executable by the Halyard worker.
- Higgsfield model selection is not hard-coded. The first live calibration must select a small verified model/recipe set from the current provider catalog, generate representative assets, and visually review them before capability acceptance.
- Canva brand-template server automation and Descript worker execution are still adapter work; the router capability contracts exist but the provider execution layer is not complete.
- No unattended generative visual capability is accepted for RecipeFix yet. That is intentional until an actual calibration asset passes visual review.
- KinoLog has not yet been connected through the v2 calibration path; it remains the product-agnostic proof after RecipeFix recipes are accepted.

## Release checkpoint — 2026-09-27 evening

The foundation phases above are now implemented through the real operator flows:

- Launch, Campaign, Daily and Floor/manual creation converge on one package/brief/variant/recipe lineage.
- `production_provider_calibrations` is live in schema `0086` and is product/provider/capability specific.
- Finished-media QC advances a calibration recipe to `review_required`; Gallery separately accepts/rejects the automation recipe.
- Higgsfield REST submit/status/cancel client exists and is tested, but is intentionally unavailable until `HF_API_KEY` is installed on the Halyard worker.
- Launch scheduling refuses past/too-soon opening runs; Campaigns omit past slots instead of silently scheduling them.
- Full release verifier is green: 301 test files / 3,991 tests, generated types, migration replay, typecheck, lint (0 errors) and production web build.
- Focused browser acceptance for Launch/Campaign/production calibration is 9/9.
- Final visual QA passed the operator surfaces after fixing scheduling and Review-layout defects.
- Live publishing remains disabled; 0 RecipeFix publications exist; old pre-v2 launch drafts are rejected/superseded.

The next phase is **real RecipeFix creative calibration**, not more abstract architecture: configure provider credentials, create a small set of actual assets, visually critique them, accept only strong recipes, then prove the same system on KinoLog.
