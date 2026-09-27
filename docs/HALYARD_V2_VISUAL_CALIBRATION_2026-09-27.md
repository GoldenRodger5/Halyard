# Halyard v2 visual calibration checkpoint — 2026-09-27

**Purpose:** record what was actually looked at, not merely what compiled.

## Operator UI visual review

The v2 Review, Launch and Campaign surfaces were opened in a real 1440×1000 browser against `halyard_test`. There were zero framework overlays, console errors or page errors.

### Review / Gallery

**Pass.** The screen now makes the creative decision legible beside the asset:

- actual video is the dominant visual object;
- gate results are visible without taking over the page;
- CreativePackage family/objective/premise and “why care before product” are visible;
- provider route shows capability → provider rather than vendor marketing language;
- calibration/human-review state is explicit;
- post approval and production-recipe reuse are separate permissions;
- media-required posts cannot be approved from copy alone.

A wording change was made after the visual pass: `Calibration decision` became **Reuse this production recipe?** and the copy now explicitly states that the gold **Approve** button applies only to the current post.

### Launch

**Pass after copy correction.** The three-day cold-start wave, start date and batch generation action are visually clear. The page gives enough rationale to understand that this is a rolling learning wave rather than arbitrary automation.

The visual pass exposed stale first-run text from the direct-OAuth architecture. `FIRST_THIRTY_DAYS` was corrected to describe:

- 14-day capacity/calendar view + rolling three-day production wave;
- real launch reviews instead of twenty disposable calibration drafts;
- direct-token **or** Blotato-mapped account identity;
- per-platform first-contact delivery proof;
- generative capability automation remaining locked until finished-media QC + explicit recipe acceptance.

### Campaign

**Pass.** Empty-state hierarchy is simple, the campaign brief is visible, and the primary action is unambiguous. Campaign staging was separately proven through browser E2E to write CreativePackage/brief/variant/recipe lineage and to preserve edited slots without duplicates.

---

## Actual media critique

The representative vertical food clip used in the visual QA **fails the v2 creative quality bar** even though it is a valid video file and can be displayed correctly.

Observed problems from frames at ~0.2s, ~1.5s and ~3s:

1. **Weak first second.** The composition barely changes and there is no clear scroll-stopping event.
2. **No narrative relationship to the premise.** A pan with butter/garlic/herbs does not communicate “a substitution changes the method.”
3. **Cluttered background.** Raw meat, bottles, packets and counter clutter compete with the foreground subject.
4. **Poor shot intentionality.** The camera is pointed at cooking, but the frame does not feel designed around one understandable action.
5. **Low visual progression.** Across three seconds, the viewer receives almost the same information repeatedly.
6. **No product proof.** That is acceptable for illustrative B-roll, but this clip cannot satisfy any RecipeFix proof beat.
7. **Generic-footage feeling.** It could belong to almost any cooking account and does not earn a specific RecipeFix story beat.

**Decision:** reject as a calibration recipe. It is useful as a negative example of why “valid media” is not “good media.” It must not unlock production automation.

---

## Higgsfield calibration preflight

The current Higgsfield session was inspected directly. Marketing Studio exposes a custom **Wild Card** format suitable for a faceless custom sequence without forcing fake customer/testimonial behavior.

A specific source-shot brief was cost-preflighted, not submitted:

- 9:16 vertical;
- 12 seconds (Marketing Studio minimum);
- 720p;
- no generated speech;
- no person;
- no app UI/text/logo;
- immediate oat-milk pour + continuous whisk motion;
- uncluttered kitchen;
- visible sauce texture change;
- no raw meat/background junk;
- editorial food-video treatment, not glossy AI-ad treatment.

**Estimated cost:** **60 Higgsfield credits** for one Wild Card generation.

No paid Higgsfield job was submitted during this checkpoint. The next live visual calibration should spend those credits only when deliberately authorized as the first provider candidate, then:

1. inspect first frame / first 2 seconds;
2. sample the whole 12-second output;
3. reject impossible food/physics/artifacts;
4. decide which 3–6 seconds, if any, are worth using as source footage;
5. combine accepted source footage with **real RecipeFix capture** in Halyard final assembly;
6. run finished-media QC;
7. human visually review the finished post;
8. only then consider accepting `higgsfield + generated_broll` for RecipeFix automation.

Approval of Higgsfield B-roll must **not** unlock generated presenters. Calibration is stored per product + provider + capability.

---

## Release verification at this checkpoint

`./scripts/verify` completed successfully after the v2 implementation:

- migrations through schema `0086` apply cleanly to isolated `halyard_test`;
- generated DB types are current;
- every package/app typechecks;
- lint has zero errors (repo carries existing script-console warnings);
- **301 test files / 3,991 tests passed**;
- real Remotion/media review tests passed;
- production web build passed.

Browser E2E separately proved:

- Launch v2 lineage/idempotency/edit preservation;
- Campaign v2 lineage, mapped-provider accounts and safe replanning;
- Production calibration acceptance records only the reviewed generative provider/capability pair.

The remaining creative work is calibration quality, not foundational architecture correctness.
