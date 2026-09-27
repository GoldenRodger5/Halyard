# Halyard distribution operating model — 2026-09-27

**Status:** implementation-backed operating model for RecipeFix first, KinoLog next.

This document is the canonical answer to one question: **how does Halyard get a real product in front of more people without rebuilding solved social infrastructure or surrendering product intelligence to a generic scheduler?**

The answer is a hybrid:

> **Halyard owns truth, strategy, coordination, quality, approval, attribution and learning. Blotato is a replaceable transport and optional media-production service.**

Halyard is not being thrown away. The transport boundary is being made honest.

---

## 1. System boundary

```text
product truth
  repo + live site + App Store + MCP/API + safe browser exploration
                         │
                         ▼
                  PRODUCT BRAIN
        evidence → facts → verified features
                         │
                         ▼
              STRATEGY / CONCEPT PACKAGES
       audience problem, angle, job, content mix
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
 platform-native writing          media production
 Halyard copy/QC                  Halyard native OR
                                  Blotato visual, by approval
          └──────────────┬──────────────┘
                         ▼
                    HUMAN REVIEW
                         │
                         ▼
                  DELIVERY ROUTER
            direct adapter | Blotato
                         │
                         ▼
             social platforms / audience
                         │
                         ▼
       metrics + clicks + conversions + corrections
                         │
                         └──────────────► Halyard learning
```

A third party may be better at OAuth, media hosting, or template rendering. None of those is the durable advantage. The durable advantage is that Halyard knows what the product actually does, what may be claimed, what has been tried, what happened, and what should be made next.

### Halyard owns

- Product rescan and evidence provenance.
- Verified feature inventory and contradiction surfacing.
- Audience / differentiator / positioning reasoning.
- Cross-platform concept packages.
- Platform-native copy, format selection and timing.
- Claim, copy, media, audio, coherence and retention QC.
- Human approval and correction feedback.
- Product/account routing safety.
- UTM/link attribution and conversion feedback.
- Performance scoring and learned insights.
- The decision about what to make next.

### Blotato may own

- Social account OAuth and token maintenance for unified accounts.
- Publish/schedule transport where its observed capability is sufficient.
- Media hosting needed by its own delivery API.
- Optional carousels / infographics / short video generation after copy approval.
- Provider-side analytics where the live API actually reports them.

Blotato is therefore an adapter, not the source of product truth and not the campaign strategist.

---

## 2. Product onboarding and Rescan

A product may have **multiple additive evidence sources**. `connector_type` is the runtime/output connector; GitHub is not mutually exclusive with it.

### Rescan means all of these

1. Crawl the current public site.
2. Read the current App Store listing when present.
3. Inspect the product's MCP/API surface when present.
4. Inspect the configured GitHub repository:
   - recursive shipped tree;
   - selected high-value product/status/feature/strategy docs;
   - recent user-facing merged work.
5. Read described product screenshots when available.
6. Walk the live product safely with Explorer.
7. Rediscover feature demonstrations and update their replay steps.
8. Re-run unverified, refuted and stale feature claims.
9. Rebuild the Product Brain from the newly stored evidence.
10. Surface contradictions rather than quietly choosing a side.

Repository evidence is additive. RecipeFix is the proof: MCP supplies real product output and tools while GitHub supplies implementation and release truth.

### Credential rule

Public flows may be explored signed out. Signed-in feature verification needs a dedicated harmless capture account. A missing capture account must leave a private claim **unverified**, not falsely refuted because a replay hit a login wall.

Local private-repo rescans may reuse the operator's existing `gh auth` credential. Cloud deployments use an explicit `GITHUB_TOKEN`/named token env; credentials are never stored in product rows.

---

## 3. Transport policy

Every `social_accounts` row has a transport:

- `direct` — Halyard's platform adapter and credential.
- `unified` — the Blotato adapter with a `provider_account_id`.

A Blotato account mapping is **not** proof that posting works. A read-only provider probe proves the key and identity surface. The first approved real publication proves actual public delivery.

### First-contact rule

Ordinary automation is fail-closed while provider publish capability is unknown.

The only exception is the interactive first-contact path:

```bash
pnpm first-contact --unified --platform=<platform> --item=<uuid>
```

Dry-run mode sends nothing and prints the exact payload. Real mode requires:

1. an explicit content item UUID;
2. the real target handle typed back;
3. the literal `PUBLISH` confirmation;
4. the normal Halyard publish handler.

Blotato's `postSubmissionId` is a **receipt**, not a publication. Halyard records the content as publishing and `reconcile_delivery` polls until Blotato reports `published` or `failed`. Only a confirmed public publication upgrades that platform to proven.

A later read-only capability probe must never downgrade stronger evidence from a real publication.

### Scheduling rule

Halyard owns the time decision. Do not delegate normal scheduling to `useNextFreeSlot`: provider behavior can resolve immediately when no useful slot exists, and the strategic timing belongs in Halyard anyway.

Halyard's planned UTC/local time should remain the source of truth; transport executes it.

### Direct exceptions

Keep a direct adapter when it materially preserves behavior the provider cannot express. Example: X uses a first-reply link strategy; silently moving that URL into the main post changes cost and distribution behavior. Transport selection is capability-based and reversible from Master Control.

---

## 4. Blotato live contract checked 2026-09-27

The hosted MCP was queried directly. It currently exposes 35 tools, including:

- `blotato_list_accounts`
- `blotato_create_post`
- `blotato_get_post_status`
- schedule list/get/update/delete
- `blotato_list_visual_templates`
- `blotato_create_visual`
- `blotato_get_visual_status`
- source ingestion/extraction tools
- post analytics / top-post tools

Post creation is asynchronous when not settled during the initial call. Halyard must keep the provider submission separate from the social post.

Visual creation can take roughly tens of seconds to minutes. The current tool contract says wait at least **15 seconds** between visual polls. Stop immediately for any returned error, `creation-from-template-failed`, `insufficient-credits`, or other terminal state; waiting cannot repair those.

The configured Halyard template IDs were verified in the current live catalog on 2026-09-27:

- tutorial carousel, minimalist flat style;
- AI video with AI voice;
- whiteboard infographic.

Halyard preflights the configured template ID against the live catalog before a paid generation call.

---

## 5. Cost boundary: copy first, paid visual second

Blotato visual generation spends AI credits. It must not be an automatic side effect of drafting 20 concepts that an operator may reject.

Opening-run flow:

1. Halyard writes the platform-native draft.
2. Halyard runs text/claim/destination QC.
3. Draft enters **Holding**.
4. Operator sees and may edit/reject the copy.
5. A media-required draft shows **Generate Blotato visual**.
6. Only that action queues `generate_external_visual`.
7. Blotato media returns into Halyard's asset library.
8. AI-media disclosure is attached.
9. Halyard's media review runs on the actual returned asset.
10. Final approval remains locked until the media exists.

The server action enforces this too; disabling a button is not an authorization boundary.

This policy gives us the speed of Blotato without turning Halyard into a credit-burning template mill.

---

## 6. Cold-start launch strategy

A cold account needs **useful discovery content before community dependence**. Asking for comments from an audience that does not exist is not a growth strategy.

RecipeFix's current opening mix is therefore:

- **45% transformation** — concrete problem → changed recipe/mechanism.
- **30% education** — save-worthy substitution/technique/scaling knowledge.
- **15% product** — one real workflow shown end to end.
- **10% community** — specific, answerable prompts after giving value.

Introductions are structural and are outside that mix.

### Cross-platform packages, not duplicate posts

Halyard plans a smaller set of evidence-backed **concept packages**, then gives each placement its platform-native finish. One concept can become:

- TikTok: hook-first 9:16 short;
- Instagram: Reel or 4:5 carousel;
- YouTube: Short with a slightly more explanatory structure;
- Pinterest: searchable utility pin;
- Threads/X: concise mechanism/observation, not a transcript of the video.

This is coordinated, not copy-paste syndication.

### Cadence is per account

The weekly format budget belongs to the channel identity. An Instagram Reel must not consume TikTok's video headroom. The launch planner therefore tracks cadence **per social account**, while platform spacing rules still prevent bursts/collisions.

With RecipeFix's current six mapped brand identities and the cold-start mix, the measured 14-day capacity is:

- Instagram: 14 placements — 7 Reels + 7 carousels.
- TikTok: 8 videos — 4/week.
- YouTube: 8 videos — 4/week.
- Pinterest: 14 pins.
- Threads: 14 text-native pieces.
- X: 14 text-native pieces.

That is **72 placements from 20 coordinated creative packages**, with spacing-rule deferrals rather than forced slots.

### Do not freeze all 14 days before learning

The fortnight is a capacity/calendar plan, not a demand to finish all media on night one. Operate in rolling waves:

- Stage the calendar.
- Keep roughly 2–3 days of reviewed/near-reviewed work ahead.
- Publish the first wave.
- Read real hooks, retention, saves/shares/clicks and downstream activation.
- Let the next wave use the new learned insights.

This preserves coordination while making the feedback loop real.

---

## 7. RecipeFix: what we are marketing now

Do not market the August product. Current RecipeFix is a recipe workspace that begins with a recipe the cook actually wants and adapts it to their constraints.

Evidence-backed content territory includes:

- URL/text/photo/PDF recipe intake.
- Nine combinable dietary profiles.
- Substitutions with ratios and technique impact.
- Serving scaling, including ingredient-constrained scaling.
- Refinement and rescaling that can update instructions.
- Nutrition estimates with confidence.
- Cook Mode, steps, timers and completion feedback.
- Cookbook/version history.
- Combined shopping list.
- Recipe discovery/search and preview.
- Share links/cards and iOS/PWA/share-in flows.

The strongest recurring social wedge is not “AI cooking.” It is:

> **You already found the recipe you want. One thing about it does not fit. Keep the recipe; change the rules correctly.**

### High-value RecipeFix content packages

1. **The swap is not the whole fix.** Ingredient change → what changes in moisture/heat/timing/method.
2. **Before/after adaptation receipts.** Use real product output and show only facts supported by it.
3. **Why obvious substitutions fail.** Teach the mechanism first.
4. **Scaling traps.** “Halving a recipe” is not always divide every number by two.
5. **Cook it, not just convert it.** Show the handoff from adaptation → Cook Mode/timers.
6. **Plan/shop/cook week.** Plus value without turning every post into an upgrade ad.
7. **Find → preview → adapt.** Search/discovery workflow.
8. **Constraint combinations / edge cases.** Only when the product evidence actually supports the example.

### Never claim

- invented customer behavior, testimonials or traction;
- medical safety/outcomes;
- that a publisher's photograph belongs to RecipeFix;
- behavioral conclusions such as “people actually follow this” without measured data;
- a feature simply because a route/file name exists.

---

## 8. Learning loop

After publication, Halyard should distinguish three layers:

1. **Transport metrics** — whatever the provider/direct API actually reports.
2. **Owned link behavior** — routed clicks with platform/content attribution.
3. **Product outcomes** — sign-up, adaptation/activation, trial/subscription when available.

Do not optimize likes as if they are installs. A high-view post with no downstream intent and a lower-view post that produces adaptations are different outcomes.

The learning loop should update:

- hook patterns;
- format/platform beliefs;
- account timing windows;
- concept/angle performance;
- category mix;
- rejection/edited-copy anti-patterns;
- next concept generation.

Cold-start sample sizes must be shown as such. No “best time” or “winning angle” on two posts.

---

## 9. RecipeFix first-contact sequence

Publishing remains disabled until the operator deliberately starts this sequence.

1. Rescan RecipeFix.
2. Review Product Brain contradictions that affect public copy.
3. Review opening-wave drafts in Gallery.
4. Reject/edit weak copy before media generation.
5. Generate Blotato visuals only for accepted media concepts.
6. Review the actual visual/video in Gallery.
7. Pick **one** strong real RecipeFix post for first contact.
8. Dry-run its exact payload.
9. Turn publishing on deliberately.
10. Run first-contact against that explicit item.
11. Let `reconcile_delivery` settle it.
12. Verify permalink/idempotency/metrics/attribution.
13. Only then route ordinary posts for that platform through Blotato.
14. Repeat platform-by-platform; never “unlock everything” from one Instagram success.

---

## 10. KinoLog next: prove the architecture is generic

KinoLog must use the same system without RecipeFix branches.

Configure:

- product id/name/site/App Store;
- GitHub `repo_config`;
- current operator brief and brand tokens;
- optional MCP/API connector when useful;
- dedicated harmless capture account for private flow verification;
- social account rows and Blotato provider mappings;
- brand voice and cold-start mix.

Rescan must then independently discover/verify the current KinoLog product: prediction-before-watch, prediction receipt/outcome, Taste learning, Tonight, Find, Movie Night, Letterboxd import, Stats/Taste and any current public-conversion surfaces actually supported by evidence.

Likely content territory is structurally different from RecipeFix, which is the point:

- prediction receipts / “did it call my taste correctly?”;
- taste-vs-crowd comparisons;
- “your people” similarity insights;
- Tonight decision relief;
- import → immediate taste intelligence;
- Movie Night disagreement/matching;
- genre/director/personality taste patterns.

If the same rescan → concept → native variant → review → transport → learning loop works without product-specific branches, Halyard has passed the second-product test.

---

## 11. Current safety state at this checkpoint

- RecipeFix social accounts are mapped in Blotato for Instagram, Pinterest, Threads, TikTok, X and YouTube.
- Mapping is identity information, not a claim of publish capability.
- Global Halyard publishing kill switch is intentionally **OFF / disabled**.
- No RecipeFix publication row exists at this checkpoint.
- No RecipeFix content item is marked published.
- Paid Blotato visual generation is operator-gated.
- First-contact is the only path allowed to settle unknown provider publish capability.

That state is intentional. The system is being made ready to launch without launching behind the operator's back.

## 12. Spend control

Halyard operates with a **$5/day automated paid-work ceiling** for this launch phase. Paid jobs are parked rather than failed once the ledger reaches the limit. Product Brain builds, Explorer work and external visual generation count as paid work alongside copy/correction/review/voice jobs.

Blotato media is additionally approval-gated before the provider call. This is intentionally stricter than the dollar guard because a provider credit balance is not a creative budget: the fact that credits exist does not mean low-quality concepts should consume them.
