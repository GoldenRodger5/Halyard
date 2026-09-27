# Viral Clipping Launch Runbook — 2026-09-27

## Decision

We are launching a **media operation**, not building another application.

The immediate goal is to get the first anonymous short-form accounts live, publish real campaign-backed clips, measure actual distribution and payout, and learn what earns.

**No Halyard feature build is required before first revenue.**

Halyard becomes the long-term orchestration layer only after a repeatable winning workflow exists.

## Business thesis

Use two complementary outputs from each strong source moment:

1. **Growth cut** — 15–45 seconds, optimized for reach and campaign payout.
2. **Story / monetization cut** — 60–120 seconds, with original narration/context/editing, optimized for native platform monetization and durable channel value.

Paid clipping campaigns fund experimentation before TikTok/YouTube native monetization thresholds are reached.

## First launch lane

### Brand A — MomentCircuit (working name)

Anonymous gaming/streamer/creator-clipping media brand.

Preferred handle order:
1. `@momentcircuit`
2. `@momentcircuit.media`
3. `@momentcircuitclips`

Use whichever is available consistently enough across TikTok, Instagram, and YouTube.

Do not attach the user's real name, personal photo, voice, employer, city, other projects, or personal social accounts.

### First paid campaign — Call of Duty MW4 / Warzone Operator Skin Toggle

Current campaign facts verified 27 Sep 2026:
- accepting clips;
- official campaign source assets;
- TikTok: $2.00 / 1K approved views;
- Instagram: $1.25 / 1K approved views;
- $3 TikTok minimum payout;
- $750 max payout per clip;
- approximately $18.5K campaign budget remaining at last check;
- approximately 1.1M approved views;
- 15 listed clippers;
- top listed clipper: $517.35.

Campaign URL:
https://contentrewards.com/discover/91c4990a-b37e-4c59-8232-8bb1ae8d9a94

Why this is first:
- stronger current economics than most open streamer campaigns;
- very large remaining budget;
- official supplied material reduces rights ambiguity;
- few visible competitors relative to budget;
- low payout minimum;
- gaming audience is compatible with the broader streamer account we want to build.

This is a launch choice, not a prediction of earnings.

### Second paid campaign — DiegoLoveless Twitch Clips

Current observed facts:
- $2 / 1K on TikTok and Instagram;
- creator/Twitch-specific;
- 8.6M approved views;
- top listed clipper $391.56;
- average listed clipper earnings $47.80;
- smaller remaining budget than Call of Duty.

Use this only after Brand A has initial posts and the first Call of Duty workflow is operating.

Campaign URL:
https://contentrewards.com/discover/7c1c6e53-a4a7-42bf-95e4-b8610d26a7de

## Launch constraint: do not wait for Halyard

The current Halyard local worktree contains a large in-progress distribution-readiness branch with many uncommitted changes. Adding a new clipping subsystem now would create risk and delay.

Therefore the launch stack is deliberately thin:

1. Content Rewards campaign + supplied assets.
2. Descript for transcript, moment selection, edits, captions, and exports.
3. ChatGPT for hooks, scoring, titles, captions, QA, and campaign compliance.
4. Brand TikTok / Instagram / YouTube accounts.
5. Manual posting or existing publishing connector when convenient.
6. Manual metrics capture for the first experiment.

Only after revenue/traction evidence:
7. Wire the winning workflow into Halyard.
8. Use Blotato / provider adapters for publishing.
9. Automate analytics ingestion and learning.

## Human checkpoints

The operator should only need to handle platform actions that require personal authorization:
- create/verify the dedicated brand email;
- create/verify social accounts;
- complete CAPTCHA / one-time phone / MFA if required;
- accept campaign terms;
- connect accounts to a publishing provider.

The assistant handles:
- campaign selection;
- source review;
- moment selection;
- editing instructions;
- clip generation in connected tools;
- captions/titles;
- compliance checks;
- analytics interpretation;
- next-clip decisions;
- documentation.

## Account setup

Create:
- TikTok — MomentCircuit
- Instagram — MomentCircuit
- YouTube — MomentCircuit Brand Account/channel

Do not create Facebook/Snapchat/X on day one. Add them only after a winning output exists.

All accounts must follow `docs/ANONYMOUS_CHANNEL_OPSEC_2026-09-27.md`.

## Content production SOP

### Step 1 — campaign brief

Before touching footage, record:
- allowed platforms;
- minimum clip length;
- required tags/mentions;
- required caption text;
- logo/watermark rules;
- max/min payout;
- approval-before-post requirement;
- supplied source folder;
- prohibited claims or edits.

If a campaign requires approval before publishing, do not bypass it.

### Step 2 — source ingest

Use only campaign-supplied or explicitly authorized footage.

If source download rights are unclear, stop and use the official campaign-provided route.

### Step 3 — candidate mining

Generate 10–20 candidate moments.

Score each 0–10 for:
- first-second hook;
- visual movement;
- recognizability;
- surprise;
- conflict/tension;
- humor/reaction;
- payoff;
- standalone clarity;
- editability;
- compliance.

Only edit the top few.

### Step 4 — growth cut

Target:
- 15–35 seconds unless campaign rules imply otherwise;
- hook visible immediately;
- zero intro/logo animation before the moment;
- 9:16;
- readable captions;
- fast dead-air removal;
- one idea / one payoff;
- no misleading context.

### Step 5 — optional story cut

For strong moments, create a separate 60–120 second version:
- original narration;
- context before the source moment;
- source excerpt;
- explanation/reaction/payoff;
- original on-screen graphics or B-roll where useful.

This version is for account growth and future TikTok/YouTube native monetization, not necessarily the paid campaign.

Do not assume campaign source licenses extend to platforms not listed by the campaign.

### Step 6 — QA

Before publishing:
- source rights/authorization;
- campaign rules;
- no duplicate/recycled edit;
- hook is immediate;
- captions accurate;
- no accidental private information;
- music use permitted;
- no prohibited graphic content;
- platform AI disclosure when realistic synthetic material is used;
- brand identity remains anonymous.

### Step 7 — publish

Initial cadence:
- 2–3 genuinely distinct posts/day on the primary account;
- do not upload near-identical variants to the same platform;
- adapt title/caption per platform;
- preserve campaign-required wording.

This cadence is an operating hypothesis, not a claim about platform algorithms.

## First 72-hour experiment

Target: 6–9 published clips.

Record for every post:
- campaign;
- source;
- hook type;
- duration;
- platform;
- time published;
- 1h views;
- 6h views;
- 24h views;
- likes/comments/shares where visible;
- campaign approval state;
- approved/qualified views;
- payout;
- production minutes;
- operator minutes;
- policy/copyright flags.

### Internal pivot heuristics

These are policy choices, not market statistics.

- If no clip exceeds 1,000 views after 9 posts: change hook/source selection before increasing volume.
- If views arrive but campaign approval fails: stop volume and fix compliance.
- If 30 distinct clips yield no meaningful traction: reconsider the lane/account, do not solve it by posting 300 more.
- If one source/hook family clearly wins, concentrate output there while retaining some experimentation.

## Anonymous channel expansion

Only after Brand A has a working publishing loop:

### Brand B — Bodycam / Incident Stories

Do not launch until a repeatable rights-cleared footage source exists.

Format:
- 20–45s discovery cuts;
- 60–120s narrated case stories;
- later 8–20 minute YouTube breakdowns.

Public-record access alone is not sufficient evidence of commercial reuse rights.

### Brand C — synthetic found footage

Only after Higgsfield is connected and Brand A is operating.

Fully fictional:
- bodycam;
- dashcam;
- CCTV;
- doorbell camera;
- found footage.

Clearly label realistic synthetic media. Never fabricate a real person's crime/event.

## What we are explicitly not doing

- no multi-week clipping dashboard build before first revenue;
- no scraped TV/movie scene farm;
- no unlicensed sports highlight operation;
- no stolen streamer VODs;
- no fake views, engagement pods, or purchased followers;
- no 30-account launch;
- no identical AI spam;
- no mixing streamer/gaming and bodycam audiences on one account;
- no tying the media brand to the operator's personal identity.

## Halyard integration trigger

Only build clipping-specific Halyard code after at least one of these is true:
1. campaign payout has settled;
2. multiple clips repeatedly show meaningful distribution;
3. manual workflow cost becomes a clear bottleneck.

Then add only the smallest needed pieces:
- source-rights record;
- candidate moment metadata;
- clip variant type;
- campaign requirement object;
- post analytics mapping.

Do not create a new app or parallel social scheduler.

## Success definition

The first milestone is **not followers**.

It is:

> one anonymous brand live + one campaign joined + real clips published + real view data + one approved payout path.

After that, scale based on measured economics.
