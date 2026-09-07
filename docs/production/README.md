# Halyard Production Completion Programme

This folder is the canonical programme for taking Halyard from the current September 2026 implementation to a production-grade, multi-product social creative operating system.

## Read order

1. `HALYARD_PRODUCTION_PROGRAM.md` — phased backend/frontend/product implementation plan.
2. `BACKEND_SYSTEM_MAP.md` — current backend pathways, jobs, product boundaries, publishing, engagement, and learning flow.
3. `PLATFORM_CREATIVE_PLAYBOOK.md` — platform-specific content, discovery, engagement, and adaptation rules.
4. `UI_PRODUCT_REDESIGN_SPEC.md` — product UX, navigation, onboarding, Product Brain, Creative Studio, live agent floor, review, scheduling, and responsive requirements.
5. Existing repository truth: `CLAUDE.md`, `docs/STATUS.md`, `docs/PLAN.md`, `docs/DECISIONS.md`, `docs/DIRECTION_SPEC.md`, and feature docs.

## Baseline

The reviewed baseline was `bb2fb61306a747c28f021d82d79b70c0d71742ba` on `main`. Always re-check current HEAD before implementation; never assume this SHA is still current.

## Product objective

Halyard must let an operator connect a product, build and review a durable understanding of that product, discover relevant social opportunities, generate materially different high-quality content, watch the creative team work in real time, inspect and hear the finished media, request targeted revisions, approve the exact revision, schedule/publish through the declared route, measure outcomes, and improve later decisions.

RecipeFix is a validation product, not the architecture. Kinolog and a third real app available under the operator's `PROJECT_2025` workspace are mandatory cross-product validation targets. Shared code must remain product-neutral; product-specific adapters are allowed only at explicit product boundaries.

## Governing principles

- Agents perceive and create; deterministic code owns policy, measurement, safety, routing, provenance, scheduling, and repeatable transformations.
- A capability is not complete because a file, table, handler, prompt, or test exists. It needs a caller, runtime path, persisted output where needed, downstream consumer, failure behavior, observability, and user-facing state.
- The finished media is the primary creative acceptance surface. Technical validity does not imply publish-worthiness.
- Halyard is autonomous up to publication and never past the configured approval boundary.
- Never fabricate empirical results, product evidence, social evidence, attribution, licensing, or provider capability.
- Multi-app validation happens throughout implementation, not only at final qualification.
- No ordinary operator journey should require SQL, hidden terminal work, or manual database repair.

## Implementation cadence

For each work package: understand the current path → implement the smallest complete vertical slice → add/repair backend/data → wire orchestration → build the UI state → exercise the real path safely → inspect actual output → correct defects → run focused and broad verification → update docs/evidence → commit. External provider/account actions are separated from engineering work and called out explicitly.
