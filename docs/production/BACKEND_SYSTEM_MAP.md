# Halyard Backend System Map

**Reviewed baseline:** `bb2fb61306a747c28f021d82d79b70c0d71742ba`. Re-resolve current HEAD before implementation.

This document maps the major backend pathways the redesigned product UI must expose. It is intentionally organized by operator workflow rather than package ownership.

## 1. Runtime architecture

- **Web:** Next.js App Router, server actions/routes, authenticated operator UI.
- **Worker:** durable Postgres `jobs` poller + scheduler on Railway.
- **Core:** deterministic domain logic, agents/model clients, adapters, creative/media/learning logic.
- **Database:** Supabase/Postgres; jobs, products, social accounts, evidence/brain, content, renders/assets, QA/corrections, publications, metrics, learning.
- **Media:** Remotion/Satori/FFmpeg/Whisper plus external image/voice/media providers.
- **Publishing:** direct platform adapters and verified unified transport where configured.

The jobs table remains the orchestration spine. Web requests enqueue durable work; workers claim, run, persist, and enqueue downstream jobs.

## 2. Current worker job families

The handler registry currently includes these major paths:

### Product understanding

- `explore_product`
- `collect_product_evidence`
- `build_product_brain`
- `verify_feature`
- `detect_release`
- `collect_app_store`
- `collect_reviews`

### Discovery / social signals

- `collect_signals`
- `collect_watch_terms`
- `generate_concepts`
- `build_account_intelligence`

### Creative production

- `generate`
- `capture`
- `render`
- `tts`
- `review_media`
- `correct_content`
- `mark_stale_assets`

### Publishing / scheduling

- `reconcile_schedule`
- `publish`
- `refresh_tokens`
- `verify_provider_capability`

### Post-publication / learning

- `collect_metrics`
- `collect_comments`
- `collect_attribution`
- `score_performance`
- `learn_from_performance`
- `cluster_rejections`

### Operator/maintenance

- `digest_email`
- `purge_logs`
- newsletter jobs where still intentionally supported.

Every production UI surface should map to these real stages rather than inventing an unrelated state machine.

## 3. Product onboarding pathway

### Current ingredients

- `products` row carries identity, brand tokens, connector configuration, timezones and brief data.
- Product source discovery supports generic MCP evidence, GitHub/release evidence, websites/store listing/operator inputs, and RecipeFix-specific artifact conversion.
- Generic MCP can describe a product's tool surface but intentionally cannot infer which tool/result is the product's characteristic output.
- Product-specific artifact adapters/rehydrators are explicit extension points.
- Product Brain converts evidence into sourced/reconciled facts.

### Required normalized pathway

`product identity → evidence sources → evidence collection → ProductPack reconciliation → operator review/edits → approved ProductPack → social/creative systems`

The redesigned UI must expose source status, progress, facts, contradictions, confidence/provenance, brand extraction, audience/goals, workflow understanding, destinations, and integration readiness.

## 4. Social account pathway

`platform developer configuration → OAuth/app-password flow → encrypted credential → identity confirmation → capability observation/self-test → product/account routing scope → account usable by Studio`

Important distinctions to preserve:

- developer setup vs user connection;
- connected credential vs operator-marked review state;
- requested vs granted vs approved scopes;
- code support vs provider review/policy eligibility;
- direct vs unified/manual delivery method;
- account identity/routing scope.

The account picker must be product/account-scoped, not merely platform-scoped.

## 5. Creation pathway

Current UI resolves available platforms and carriage/formats, then enqueues generation. The target production grouping should be:

`Production / Request`
→ selected product
→ selected target accounts/platforms
→ operator intent or discovered opportunity
→ campaign/series context
→ concepts
→ selected concept / creative brief
→ one or more platform variants
→ dependent jobs/assets
→ reviewable outputs.

A single multi-platform request should have one durable production ID instead of returning only one child job ID.

## 6. Creative pathway

The current system already includes product evidence, format writing, research, copy, hooks, screenplay, imagery/stock footage, product capture, narration/TTS, creative direction, motion, platform variants, rendering, media review, and bounded corrections.

The target pipeline is:

`request/opportunity`
→ strategy
→ concepts
→ creative brief
→ research/evidence
→ format/script/copy
→ screenplay/storyboard
→ asset plan
→ product capture / licensed stock / generated illustration
→ voice/music/SFX direction
→ platform-specific render
→ technical + visual + audio + evidence review
→ targeted correction
→ final reviewable revision.

The UI should surface these as understandable stages without requiring the operator to understand job kinds.

## 7. Asset/evidence pathway

Assets must preserve:

- owning product;
- source/provider;
- provenance;
- licence/proof/restrictions;
- evidentiary vs illustrative role;
- input/output lineage;
- durability/storage state;
- platform restrictions;
- content usage history.

Real product capture is the valid evidence source for product behavior. Stock/generated media may illustrate but cannot prove the product performed an action.

## 8. Review/correction pathway

`rendered revision → technical integrity → visual/editorial review → audio review → product/evidence review → defects → smallest valid correction → invalidate affected stages → regenerate/re-render → re-review → operator`

Review state must distinguish failure, clean pass, unavailable, malformed, skipped and unmeasured.

Approval binds to the exact revision/target. A later material change invalidates affected approval.

## 9. Scheduling pathway

Current scheduling already supports slot resolution, deterministic jitter, same-platform spacing, cross-platform same-idea spacing, founder/brand separation, density warnings and daily caps.

The completed system must add/ensure:

- account identity in schedule candidates;
- true local-day/timezone/DST reasoning;
- declared maximum same-idea gap enforcement where required;
- concurrency-safe placement;
- campaign/series sequencing;
- explicit configured vs heuristic vs learned timing basis;
- user-visible reason for each placement or deferral.

## 10. Publishing pathway

Current publish handler preserves important safety behavior:

1. kill switch first;
2. load exact content item/account;
3. require approved/scheduled state;
4. enforce production audio provenance;
5. preflight duplicate publication;
6. claim unique publication row before network send;
7. platform adapter/unified capability routing;
8. result recorded as direct publication vs awaiting-manual state;
9. downstream collection scheduled only for real public publication where appropriate.

Keep these strengths. Add exact revision binding and robust remote-uncertain reconciliation before retries.

## 11. Engagement pathway

Current worker can collect comments on real publications and store them, with capability observations. The existing social-intelligence layer builds recommendations from repeated commenters and watch hits.

The target extends this to:

`owned/external conversation discovery → context normalization → relevance/permission decision → grounded draft → operator review → context/eligibility recheck → send/manual action → remote confirmation → relationship/content opportunity record`

No automated unsolicited engagement should bypass operator policy.

## 12. Metrics / attribution / learning pathway

Current path:

`publication → metrics polling → attribution collection → performance score → learned insights → account intelligence`

Current deterministic insight machinery appropriately distinguishes unmeasured from zero and uses account/platform/global scopes. The completion work must:

- make product scoping explicit at every learning scope;
- prevent repeated processing of the same evidence from falsely increasing corroboration;
- extract far more creative features from actual productions;
- distinguish operator taste from audience performance and acquisition;
- configure app-specific activation outcomes;
- make later decisions record which learned insight influenced them.

## 13. Public API/web route families

The Next.js app currently includes route handlers for product selection, OAuth start/callbacks, platform/webhook callbacks, media delivery, legal/data deletion surfaces and internal server actions for Studio workflows. During completion, inventory every route and classify it as:

- public unauthenticated;
- authenticated operator;
- provider callback/webhook;
- media delivery;
- internal-only/server action.

Add authentication, CSRF/state/signature, rate-limit and idempotency expectations per class. The redesigned UI must use existing server actions/routes rather than building a parallel backend.

## 14. Product-neutrality boundary

Shared layers must not know that a product is RecipeFix, a recipe app, Kinolog, or a film app. Product specificity belongs in:

- source/artifact adapters;
- capture flows;
- ProductPack evidence/content;
- product-configured activation/destinations;
- product brand assets.

Shared strategy, editorial formats, discovery, creative directors, rendering primitives, review, scheduling, platform adaptation, analytics, learning, and Studio should operate from typed product data.

Every shared-system change is validated against RecipeFix, Kinolog, a third accessible real `PROJECT_2025` app, and an unfamiliar fixture.

## 15. Backend completion rule

A feature is not complete because the module exists. For each declared capability verify:

`producer/caller → job or direct execution path → persistence → downstream consumer → failure/retry policy → observability → operator UI state`

No orphan jobs, read-only/write-only tables without explicit intent, unreachable agents, stale production workers, or hidden manual repair steps are acceptable in the final production scope.
