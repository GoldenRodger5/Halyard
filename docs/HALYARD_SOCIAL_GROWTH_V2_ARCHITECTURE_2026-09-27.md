# Halyard Social Growth v2 — canonical architecture

**Date:** 2026-09-27
**Status:** governing architecture for the next Halyard implementation phase
**Scope:** any product connected to Halyard; RecipeFix is calibration product #1, KinoLog is product-agnostic proof #2.

## 1. Product promise

Halyard is the social-growth operating system for a product portfolio.

The eventual founder workflow is deliberately simple:

1. Connect a product.
2. Point Halyard at its repository, live site, store listing, product API/MCP surface, and safe browser account where applicable.
3. Press **Rescan**. Halyard learns what the product actually is, what it does, who it is for, what is differentiated, what can be claimed, what is newly shipped, and what real proof is available.
4. Connect the product's social accounts.
5. Halyard proposes and maintains a rolling cross-platform content plan.
6. Halyard creates genuinely different, platform-native posts: short video, Reels, Shorts, carousels, images, Pinterest, X, Threads, and other supported formats.
7. Halyard uses the best production tool for each required asset rather than forcing every piece through one renderer.
8. Halyard evaluates the **actual finished creative**, not merely the prompt or model response.
9. The operator approves. Publishing remains human-controlled until deliberately loosened by policy.
10. Halyard measures attention, product intent, activation and conversion, then changes future strategy and creative based on what actually happened.

The goal is not an automated advertisement feed. The goal is to build an audience that has reasons to follow the account even when they are not ready to buy, while repeatedly creating natural paths into the product.

Halyard should maximize the chance of earning attention and breakout distribution. It must never promise virality or treat a speculative "viral score" as an outcome.

---

## 2. Non-negotiable quality principle

> **A model call succeeding is not a finished post.**

No visual post becomes publish-ready until the rendered file itself has been inspected by artifact-level QC. During calibration, representative assets are also visually critiqued by a human creative reviewer.

A finished short-form video is judged on at least:

- first frame;
- first 0–2 seconds;
- hook clarity;
- visual change rate and dead zones;
- story progression;
- payoff;
- real product proof where promised;
- legibility and safe zones;
- generated-image/video artifacts;
- authenticity / AI-slop signals;
- narration quality;
- music and sound balance;
- platform-native feel;
- brand consistency;
- caption/creative relationship;
- factual support;
- CTA restraint and relevance.

A technically valid but generic, fake-looking, templated, over-written or visibly synthetic piece is a failed creative.

---

## 3. One brain, many production engines

Halyard owns the marketing decision. Vendors execute bounded production tasks.

```text
PRODUCT TRUTH
repo · live site · store · API/MCP · real browser/product evidence
      │
      ▼
PRODUCT BRAIN
truth · features · audience · positioning · proof · contradictions
      │
      ▼
STRATEGY
what to talk about · for whom · why now · objective · experiment
      │
      ▼
CREATIVE PACKAGE
one canonical creative contract
      │
      ▼
PRODUCTION ROUTER
      ├─ real product capture
      ├─ Higgsfield source footage / presenter / product imagery
      ├─ Canva controlled brand templates
      ├─ Halyard Remotion / FFmpeg assembly
      ├─ ElevenLabs narration
      ├─ Descript transcript-led finishing where useful
      └─ other future providers behind the same interface
      │
      ▼
FINISHED CREATIVE
      │
      ▼
ARTIFACT QC + HUMAN REVIEW
      │
      ▼
DELIVERY ROUTER
Blotato by default · direct adapter only when it preserves a concrete advantage
      │
      ▼
SOCIAL PLATFORMS
      │
      ▼
ATTENTION + PRODUCT OUTCOMES
      │
      ▼
HALYARD LEARNING
```

### Halyard remains responsible for

- Product Brain and evidence provenance.
- Audience hypotheses and content territory.
- Opportunity selection and editorial strategy.
- Concept generation and diversity.
- Hooks, scripts, captions, titles, overlay text, story structure.
- Creative Package construction.
- Provider selection and spend policy.
- Real product proof requirements.
- Final deterministic assembly where needed.
- Artifact-level QC.
- Approval and correction history.
- Scheduling and cross-platform coordination.
- Attribution and learning.

### Blotato's role

Blotato is primarily the publishing/scheduling/provider-analytics transport. It may remain an optional visual vendor, but it is **not** the default creative director and must never invent unsupported product truth.

### Higgsfield's role

Higgsfield is a high-quality source-production engine. Use it for illustrative/cinematic B-roll, reference-driven motion, product shots, creator/tutorial treatments, or other shots that are difficult to produce deterministically.

Generated footage is illustration, not product proof. Never use synthetic footage to depict a product UI state, user result, rating, customer quote or testimonial that did not exist.

### Canva's role

Canva is the preferred controlled template engine for selected branded static/carousel families when a human-designed brand template is better than a fully procedural layout. Halyard supplies verified content/data to autofill fields. Halyard still evaluates the exported result.

### Descript's role

Descript is an optional finishing editor for transcript-led creator/spoken footage: removing dead air, restructuring a spoken edit, captions/reframing, and other operations where transcript-native editing is stronger than motion-graphics assembly.

### Halyard Remotion / FFmpeg

Retain and strengthen this layer as the deterministic compositor:

- real product captures;
- generated/real source shots;
- captions;
- exact typography and brand tokens;
- kinetic text;
- split screens;
- diagrams;
- overlays;
- transition timing;
- narration/music/SFX mix;
- final export.

Remotion is the automated editor / motion-graphics system, not the cinematographer for every shot.

---

## 4. The canonical object: CreativePackage

Every entry point must converge on one Creative Package before media production begins.

This includes:

- Launch;
- Campaigns;
- Floor / manual make;
- automatic daily generation;
- opportunity/trend response;
- founder content;
- experiments;
- future app-specific automations.

No path may bypass this contract and go directly from "idea" to a renderer/vendor.

A Creative Package answers:

- What is the objective?
- Who is the intended audience?
- What audience tension/problem/desire makes this relevant?
- What is the core idea?
- Which content family is this?
- Why should a person care before the product is mentioned?
- What is the hook?
- What truth/proof supports it?
- What must be real product capture?
- What may be illustrative/generated media?
- What story/beat sequence earns the next second?
- What should be spoken vs read vs shown?
- What is the visual language?
- What is the audio direction?
- What CTA, if any, is appropriate?
- Which experiment/hypothesis is this testing?
- How should each platform adapt the same underlying idea?
- What constitutes a quality failure?

The exact schema lives in `docs/CREATIVE_PACKAGE_V1_SPEC_2026-09-27.md` and `packages/core/src/creative/package.ts`.

---

## 5. Six content families

Halyard keeps the content taxonomy understandable enough to reason about and measure.

### 5.1 Proof / Demo

Show the real product doing something useful. Product proof is real capture or real output, never generated UI.

### 5.2 Transformation

Problem → intervention/change → meaningful payoff. The product may be the mechanism, but the audience problem leads.

### 5.3 Teach

Useful knowledge worth saving or sharing: technique, mechanism, comparison, guide, myth/fact, decision support.

### 5.4 Story / POV

Founder perspective, observation, build story, opinion, narrative, lesson, behind-the-scenes.

### 5.5 Entertainment / Social

Reaction, trend response, curiosity, challenge, meme-like or culturally adjacent content that still fits the product/audience.

### 5.6 Creator-style

Human-feeling explanation, tutorial, demonstration or presentation. Synthetic presenters may explain verified content; they may not pretend to be real customers or fabricate personal experience.

The family is about the audience experience, not the media type. Any family may become a short video, carousel, image or text post when appropriate.

---

## 6. Production routing rules

Production routing is deterministic policy over creative requirements, provider availability, cost and quality history.

### Truth-critical media

If a beat claims the product does something visible, prefer:

1. Halyard browser/native capture;
2. real operator-supplied product media;
3. a truthful static representation derived from real data;
4. otherwise refuse the proof beat.

Never synthesize app UI to satisfy a missing capture.

### Illustrative cinematic/source footage

Prefer Higgsfield or licensed real stock according to the creative brief. Generated media must be marked as such in internal provenance and receive AI disclosure when required.

### Branded static/carousels

Prefer a human-designed Canva/brand-template family when one exists for the requested creative family. Use Halyard native rendering for data-heavy, product-proof, dynamic or unsupported layouts.

### Voice

Use ElevenLabs for controlled narration where synthetic narration fits the creative. Use real/founder audio where required. Do not add narration simply because the pipeline supports it.

### Final video assembly

Default to Halyard deterministic assembly. Use Descript where transcript-led editing meaningfully improves human/creator footage. Provider-generated one-shot ads remain candidates, not automatic finals; they still pass the same review gate.

### Publishing

Blotato is the normal unified transport after platform-specific first contact is proven. Use direct adapters only when there is a measured/contractual advantage such as a platform behavior the unified provider cannot preserve.

---

## 7. Platform adaptation

One idea does not mean one file copied everywhere.

A Creative Package has a common truth and concept, then platform variants.

### TikTok

- immediate native hook;
- visually alive in the first second;
- concise spoken/on-screen language;
- creator/feed-native rhythm;
- low tolerance for corporate polish that feels like an ad;
- loop/payoff where appropriate.

### Instagram Reels

- can be slightly more visually polished than TikTok;
- strong first frame and overlay hierarchy;
- visual identity should remain recognizable;
- caption complements rather than transcribes the video.

### YouTube Shorts

- title is part of discovery;
- enough explanatory satisfaction to stand alone;
- concise proof/payoff;
- search/evergreen potential considered separately from TikTok trend behavior.

### Instagram carousels

- slide 1 earns the swipe;
- one idea per slide;
- diagram/editorial/template variety;
- last slide lands the value rather than begging for engagement.

### Pinterest

- search/save utility;
- durable title/description/alt text;
- useful vertical composition;
- correct board routing;
- destination integrity.

### X / Threads

- text-native insight/story/conversation;
- never pasted video captions;
- links and reply strategies follow each platform's actual mechanics.

The same underlying concept may be deferred or skipped on a platform when there is no strong native expression.

---

## 8. Audience growth before product promotion

Product accounts need an editorial reason to exist.

A healthy account should mix:

- useful domain education;
- entertaining/culturally relevant material;
- opinions/stories;
- demonstrations/proof;
- product updates/promotional asks.

The product is a natural recurring solution, not the topic of every post.

### RecipeFix content territory examples

- substitution science;
- cooking technique;
- ingredient roles;
- recipe scaling mistakes;
- dietary adaptation;
- "why this obvious swap fails";
- before/after recipe transformations;
- interesting recipes and kitchen experiments;
- reaction/trend content around food and cooking;
- real RecipeFix demos;
- planning/shop/cook workflow.

### KinoLog content territory examples

- taste disagreements;
- movie prediction receipts;
- genre/personality patterns;
- "you vs the crowd";
- watch-decision content;
- recommendation debates;
- movie-night disagreement/matching;
- film trends/reactions;
- diary/import/taste-model demos;
- surprising user taste insights backed by real product output.

KinoLog must use the same architecture without KinoLog-specific production code. If it requires a second pipeline, v2 has failed.

---

## 9. Rolling automation, not blind bulk generation

Halyard may plan two weeks or more, but should produce expensive creative in rolling waves.

Cold-start default:

- maintain a 14-day capacity/calendar view;
- generate roughly 2–3 days of copy/briefs ahead;
- spend on media only after concept/copy review or established automation confidence;
- publish;
- measure;
- update the next wave.

This makes automation responsive to actual results and prevents a weak premise from turning into 40 expensive assets.

As confidence grows, automation may widen the production window under explicit policy.

---

## 10. Quality calibration before scale

Every new product / major visual system begins with calibration creatives before automated volume.

Minimum calibration set:

1. one short-form video;
2. one carousel/static family;
3. one search/save asset such as Pinterest when relevant;
4. one text-native post where applicable.

For each, compare the actual file against the brief and quality rubric. Reject/regenerate/edit until the product has at least one accepted production recipe for the format family.

Record the winning recipe: provider(s), model, template/treatment, prompt version, shot structure, caption style, edit rules and QC observations.

Only then may that recipe be used automatically.

---

## 11. Learning model

Do not learn "video works" or "carousels work." Learn the features of the creative.

Examples:

- hook family;
- opening visual type;
- first product reveal second;
- duration;
- visual language;
- content family;
- treatment;
- narration yes/no;
- presenter yes/no;
- real UI yes/no;
- number of generated shots;
- CTA type;
- platform/account/time;
- audience topic;
- production recipe/provider.

Tie these to:

### Attention metrics

views, reach, 2/3-second hold where available, watch time, completion, rewatches, likes, comments, shares, saves, follows.

### Intent metrics

profile visits, link clicks, landing sessions.

### Product outcomes

signups, activation, trials, paid conversions, or the product-specific activation event.

RecipeFix activation should prioritize meaningful adaptation/use rather than a bare page visit. KinoLog should use its real taste/prediction/diary activation contract.

Never call a pattern a winner without showing sample size and uncertainty.

---

## 12. Frontend simplification target

The normal founder workflow should converge toward:

### TODAY

What is going out, what happened, what needs a decision, major failures.

### CREATE

Opportunities, proposed Creative Packages, campaign request, manual brief.

### REVIEW

The most important screen. Show the actual asset and why it exists:

- player/carousel/image;
- objective/audience;
- hook;
- product proof;
- provider/production recipe;
- cost;
- QC defects;
- experiment;
- caption;
- revision history;
- Reject / Revise / Approve.

### CALENDAR

Rolling cross-platform schedule and gaps.

### LEARN

Actionable findings with sample sizes and evidence, not vanity charts.

### ADVANCED

Product Brain, accounts, brand system, providers, agents, logs, system controls.

Existing rooms may remain during migration, but they must call the same contracts rather than remain independent production paths.

---

## 13. Safety and truth

- Publishing kill switch remains authoritative.
- Product claims require evidence.
- Real product behavior must use real product evidence.
- No fake testimonials or synthetic customer experiences.
- No fake user metrics/ratings/reviews.
- Generated people may present/explain; they do not claim personal use unless that experience is real and attributed.
- No provider may silently expand a Halyard brief with new factual claims.
- Expensive generation is budgeted and idempotent.
- Failed creative escalates; it never auto-publishes because retries ran out.
- Every output preserves source → package → variant → production recipe → asset → publication → metrics lineage.

---

## 14. Definition of done for Halyard v2

Halyard v2 is not done when `CreativePackage` compiles.

It is done when this product-neutral scenario is proven twice:

1. Connect product.
2. Rescan product deeply.
3. Connect social identities.
4. Halyard proposes a sensible audience/content strategy.
5. Halyard builds a varied rolling schedule across appropriate platforms.
6. Halyard creates materially different, platform-native Creative Packages.
7. ProductionRouter uses real capture and the best configured providers correctly.
8. The actual assets look professional and do not read as generic AI content.
9. Artifact QC catches a deliberately seeded visual/creative defect.
10. Correction changes the smallest necessary layer and re-renders.
11. Operator approves.
12. Unified/direct transport publishes only after authorization.
13. Results tie back to the exact creative/version.
14. Halyard updates a later plan because of measured results.
15. A conflicting result lowers/changes the prior belief rather than preserving it blindly.

RecipeFix proves calibration and first production. KinoLog proves the architecture is generic.

The final standard is:

> **Halyard repeatedly produces social content a strong human social team would be willing to publish, can explain why each creative exists, and gets smarter from the real audience response.**
