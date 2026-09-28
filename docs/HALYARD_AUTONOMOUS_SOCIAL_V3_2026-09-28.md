# Halyard Autonomous Social V3 — 2026-09-28

## Goal

Halyard V3 moves the system from a strong production pipeline that a person triggers into a product-neutral social operating system that can observe, decide, build, quality-check, stage, and later learn — without turning autonomy into blind posting.

RecipeFix is the calibration product only. Shared V3 logic contains no recipe/diet assumptions; synthetic KinoLog Product Brain fixtures exercise the same discovery-term and planning contracts.

**Public posting remains OFF for this phase.** The autonomous system creates strategy decisions and drafts only. It has no executable auto-approval job and no autonomous handler enqueues `publish`.

## Autonomous loop

Product Brain → Brain-managed discovery topics → external/product/performance observations → signals with provenance/freshness/velocity → free deterministic editorial controller → one signal/account/platform decision → auditable strategy_decision → one targeted mature V2 generation job → production/render → technical + creative + coherence + retention + critic QC → pending_approval → human review.

## Editorial controller

New job kind: `plan_editorial`.

- Runs every 6 hours.
- The planner itself makes no model/provider calls.
- At most one autonomous decision leaves one pass.
- At most two autonomous decisions per product/day.
- At most one autonomous decision per account/pass.
- One signal normally fans out to at most one account/cycle.
- Recent signal/account pairs are suppressed for 14 days.
- A platform-specific signal stays on its observed platform.
- Strategy is persisted before paid generation, not reconstructed after.
- The targeted `generate` job carries the real signal id, strategy decision id, account, platform, and autonomy lineage.

Each strategy row records objective, why-now, audience, rationale, preferred/avoided treatments, timing window, success metric, review window, confidence, and explore/exploit mode.

## Explore vs exploit and variety

The controller uses account portfolio intelligence so a measured winner does not consume the whole feed. Cold or under-explored accounts receive bounded exploration; mature accounts may exploit measured/current evidence. Exploration is only a tie-breaker and cannot rescue a weak opportunity.

Existing portfolio anti-repetition remains downstream. Recent treatments, visual languages, openings, typography, media mode, and account mix continue to be checked by the mature V2 pipeline.

## Platform routing

General signals are not assigned by account ordering. A small deterministic platform-fit term uses the existing platform strategy model.

- Fast-moving trends lean recommendation surfaces.
- Recurring audience questions lean reply/search/explanation surfaces.
- Seasonal/saveable intent leans Pinterest/Instagram.
- Product activity leans demonstration/save/completion surfaces.
- Platform-specific observations remain native.

Signal/opportunity value remains the dominant score; platform fit only answers where a strong idea belongs.

## Trend and signal inputs

### Product Brain

Verified Product Brain facts already become grounded `product_activity` signals.

### Product-Brain-managed watch topics

A model-free term builder derives up to 8 discovery topics from verified Brain facts. Priority categories are content pillars, jobs to be done, personas, workflows, users, differentiators, and App Store positioning.

Managed rows are tagged `watch_terms.managed_by='product_brain'` and retain their source fact ids. Operator-created terms remain unmanaged and are never overwritten or disabled by Brain sync.

A successful Product Brain rebuild now immediately enqueues a **sync-only** watch-term refresh. The handoff uses an explicit empty source set, so it updates Halyard-owned discovery vocabulary without making Reddit/Pinterest/RSS requests or spending provider budget. If the current verified Brain yields no valid discovery topics, previously managed terms are disabled rather than left stale. Managed rows also refresh their source/min-occurrence policy when re-derived.

RecipeFix-shaped and synthetic KinoLog-shaped tests prove the derivation is product-neutral. Real-Postgres regression coverage also proves stale Brain-managed terms are retired without touching operator-created rows.

### Pinterest Trends

Authenticated official Pinterest trend data now retains WoW/MoM/YoY growth, time-series data, and bounded velocity. A Pinterest trend is an aggregate momentum observation, so it becomes a `source='trend'`, `platform='pinterest'` signal immediately rather than being discarded because it is not phrased as a question.

### Reddit

Recurring questions create editorial signals. Separately, accelerating engaged discussion clusters compare the last 7 days against the prior 7 and create general trend signals with bounded velocity.

### RSS / product / performance

RSS/product/news signals continue through the existing clustering/relevance pipeline. Product activity and later measured account performance feed the same signal/decision contract.

### TikTok / YouTube discovery

V3 does not add brittle public scraping and does not pretend Halyard has official general-trends APIs it does not have. TikTok/YouTube platform selection consumes legitimate general signals plus Halyard's own performance and platform-fit model. Future official connectors can write the same `signals` contract.

## Cadence ordering

Lower queue priority number executes first.

Every 6 hours:
1. `collect_signals` — priority 18.
2. Pinterest-only `collect_watch_terms` — priority 20.
3. `build_account_intelligence` — priority 24.
4. `plan_editorial` — priority 30.

Daily Reddit/RSS question watching remains daily. Daily `score_performance` now executes before `learn_from_performance`; the earlier priority ordering contradicted the comments and was corrected.

## Finished-video quality gates

Production quality is measured from the actual export, not inferred from the plan.

### Resolution

Final video short edge must be at least 720px. Below that is blocking `media.low_resolution`.

### Blur

FFmpeg `blurdetect` was calibrated on reviewed Halyard outputs:
- normal reviewed food video: about 5.6–7.1;
- intentionally moderate blur: about 9.58;
- deliberately destroyed blur: about 23.98.

Rules:
- >10: `media.soft_focus` warning;
- >14: `media.severe_blur` blocking error.

### Actual motion / frozen runtime

FFmpeg `freezedetect` measures the final file when the production contract promised motion.

Calibration examples:
- stronger YouTube edit: ~43.9% closed-freeze runtime;
- rejected static TikTok: ~81.7%;
- repaired TikTok: 0%.

Current conservative thresholds:
- >60% frozen: warning;
- >75% frozen: blocking error.

This is intentionally separate from blur: the rejected static TikTok was technically sharp but creatively static.

### Existing integrity retained

Missing/silent narration audio, no-faststart MP4, truncation, dead tail, and narration overlap remain measured.

## Media quality is now authoritative

Render-time integrity is mirrored into a normal `media` gate. Video approval refuses unmeasured file integrity or a failed integrity verdict. Production-recipe acceptance uses the same boundary, so a blurry/low-resolution recipe cannot earn unattended reuse.

The correction controller now requires the media gate for video.

## Deliberate correction limit

There is not yet a safe bounded `replace_media_source` correction action. Halyard can independently revise copy, claims, narration, voiceover, caption treatment, timing, and scene order; it cannot yet swap one bad visual source while freezing every other correct component.

Therefore low resolution and severe blur hard-stop/escalate instead of triggering a wasteful full regeneration. Adding bounded source-media replacement is the next correction-system extension.

## Approval / publication safety

- No executable `auto_approve` job exists.
- No autonomous controller enqueues `publish`.
- Autonomous output ends at `pending_approval`.
- Production recipe acceptance is still a separate stronger human permission.
- The pure `evaluateAutonomousApproval()` helper is dormant and has no caller; it documents a future safety contract only.
- `publishing_enabled=false` remains the external action kill switch during calibration.

## Operator visibility

Numbers → Learned → Decisions now exposes autonomous/manual mode, explore/exploit, platform/account, triggering signal, why-now, rationale, preferred/avoided treatments, success metric, publishing window, and built/planned content status.

## Budget

Calibration ceiling is now $15 total. Spend before this V3 pass was $4.682611, leaving about $10.32. V3 architecture, trend, scheduler, and deterministic media-QC work used no additional paid model/provider calls before live draft calibration.

## Validation checkpoint

Before reconciliation with newer `main`, the V3 worktree passed the complete release verifier on schema 0097:

- every migration applies to a fresh real Postgres;
- generated DB types match schema;
- typecheck passes;
- lint has 0 errors;
- **311 test files / 4,067 tests pass**;
- real Remotion video render tests pass;
- production Next build passes.

Additional focused coverage includes real-DB editorial decisions, real jobs constraint, Pinterest trend promotion, Reddit momentum, Product-Brain watch-term bootstrap, synthetic KinoLog term derivation, scheduler ordering, blur/freeze probes, review-media regression tests, and approval boundary tests.

### Current-main hardening checkpoint

After V3, PR #25 and the later MomentCircuit-only dependency commits landed, current `main` was re-audited from a separate clean worktree at `de7bc4e`. The commits after PR #25 change only `apps/web/package.json` and `pnpm-lock.yaml`; they do not modify the autonomy/quality paths. GitHub CI for `de7bc4e` is green.

Focused validation on the exact current-main tree plus the immediate Brain→watch refresh hardening first passed **40/40 targeted tests** against real Postgres. The complete release verifier then passed fresh migrations, generated DB types, every package typecheck, lint with **0 errors**, **312 test files / 4,078 tests**, the real Remotion render path, the production Next build, and browser E2E with **123 passed / 6 explicitly opt-in visual-baseline tests skipped**. This hardening used **$0** provider/model spend. Public publishing behavior was not changed.

## Rollout sequence (still no public posting)

1. Reconcile this branch with current `main` and reverify.
2. Push branch and require PR merge CI green.
3. Merge to `main`.
4. Apply schema 0097 to the local Halyard DB.
5. Verify `publishing_enabled=false`.
6. Enable draft generation only (`generation_enabled=true`).
7. Sync Brain-managed watch terms and refresh real signals.
8. Run one autonomous editorial cycle.
9. Permit at most one targeted paid generation first.
10. Inspect the actual output hard: copy, native fit, real motion, blur/resolution/freeze, semantic asset match, proof, variety.
11. Reject/correct until production-quality.
12. Repeat platform recipe earning across remaining gaps.
13. Do not enable public publishing until the intended autonomous recipes and first-contact transport routes earn explicit permission.