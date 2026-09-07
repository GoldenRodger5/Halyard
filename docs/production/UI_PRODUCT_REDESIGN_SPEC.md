# Halyard Product UI Redesign Specification

**Reviewed baseline:** `bb2fb61306a747c28f021d82d79b70c0d71742ba`.

## Product experience goal

Halyard should feel like a professional social-media creative studio that happens to be agentic, not like a developer console with marketing copy on top.

The operator should always understand:

1. what product they are working on;
2. what Halyard knows about it;
3. what Halyard recommends next;
4. what is currently being made;
5. what needs a decision;
6. what will publish and where;
7. what happened afterward;
8. what Halyard learned.

The UI must remain distinctive. Preserve the broadcast/studio metaphor where it helps orientation, but pair every metaphor with obvious task language.

---

# 1. Current UI map and redesign direction

## Current navigation

The current Studio has seven rooms:

- Call Sheet — "What needs me?"
- The Floor — creation/live/concepts/chat/sources
- Gallery — holding/scheduled/on-air/stock
- Rundown — schedule/series/campaigns/launch
- Wires — replies/finds/daily take
- Numbers — performance/learned
- Master Control — connections/rules/crew/product/templates/system

This structure has personality and should not be discarded. The problem is that first-time users must decode the metaphor before they understand the tasks.

## New navigation

Desktop/laptop primary labels:

1. **Home** — small secondary label: `Call Sheet`
2. **Create** — `The Floor`
3. **Review** — `Gallery`
4. **Schedule** — `Rundown`
5. **Engage** — `Wires`
6. **Results** — `Numbers`
7. **Setup** — `Master Control`

The room metaphor remains visible in page subtitles, illustrations, and the live floor, but the clickable navigation uses task language first.

Mobile bottom navigation:

- Home
- Create
- Review
- Schedule
- More

`More` opens Engage, Results, Product Brain, Connections, Settings, and System.

---

# 2. Visual system

## Design character

Use Halyard's nautical/broadcast-studio identity rather than generic AI gradients, glass cards, purple neon, or chatbot imagery.

The interface should feel like:

- a modern broadcast control room;
- a premium creative-production workspace;
- warm enough to use every day;
- precise without looking like enterprise monitoring software.

## Typography

UI typography must prioritize readability.

- **Display/headings:** Bricolage Grotesque or the existing licensed/available equivalent.
- **Body/forms/navigation:** IBM Plex Sans or an equally readable sans-serif already bundled.
- **Data/timestamps/IDs:** JetBrains Mono.
- Do **not** use Instrument Serif or other decorative/serif/cursive-feeling fonts for ordinary UI headings, forms, tabs, statuses, or instructions.
- Product-specific fonts remain available inside generated-content previews and the Product Brand area.

Recommended minimum targets:

- body: 16px desktop, 16px mobile;
- supporting copy: 14px minimum when essential;
- nav: 14–15px;
- labels: 13–14px;
- data-only secondary values may use 12px where contrast is strong;
- never use 7–10px for information the operator needs to read.

## Color

Keep the deep marine + brass identity, but solve text contrast on every production surface.

Suggested semantic palette:

- `deep`: #08110F
- `hull`: #0D1B18
- `raised`: #16302B
- `screen`: #EEF2F0
- `sheet`: #FDFDFB
- `ink`: #10201D
- `quiet`: #536762 or darker after measured contrast
- `brass`: #C9932D
- `signal`: #DF5946
- `success`: #2C7A5C
- `info`: #3D6F9D

Brass is navigation/attention, not generic success. Signal red/orange means intervention/on-air/failure depending explicit component semantics.

## Layout

- use larger sections and fewer nested bordered boxes;
- increase vertical rhythm;
- keep maximum reading width for prose;
- make primary action visually obvious;
- hide deep technical detail behind `Details`/drawers rather than forcing it into the main page;
- use thumbnails, product imagery, social icons, avatars/robots, mini charts, and real post previews instead of walls of copy.

---

# 3. Public landing page

The current `/` is an authenticated Studio route. Add a real public marketing landing page and move the authenticated home to `/app` or an equivalent protected route while preserving redirects/backward compatibility.

## Hero

Headline should explain the outcome, not the agent architecture.

Example direction:

> Your social media team, already at work.

Subhead:

> Connect your product. Halyard learns it, finds opportunities, creates platform-native content, lets you review every post, and learns from what performs.

Primary CTA: `Start with your product`
Secondary: `See how the studio works`

## Hero visual

Use a living preview of the Halyard Floor: small robot crew moving a concept from Research → Writing → Visuals → Edit → Review while the right side shows the finished TikTok/Reel/carousel cards.

No fake activity numbers. Demo data must be clearly representative.

## Sections

- How it works: Connect → Understand → Create → Review → Publish → Learn.
- Platform support with honest capability/review states.
- Product Brain explanation.
- Creative Studio / live team visualization.
- Cross-platform content examples.
- Discovery/social opportunity system.
- Safety/approval promise.
- Multi-product examples: RecipeFix, Kinolog, and a generic app example.
- CTA/footer/legal/privacy/data deletion.

Responsive and fast; no authentication/database dependency for public marketing content.

---

# 4. Authentication

## Sign in

Replace developer-facing language such as `admin_users` and environment configuration with operator-facing guidance.

Card contains:

- Halyard mark;
- `Welcome back`;
- Google sign-in when configured;
- email/password;
- magic-link alternative;
- forgot password;
- session/error state in plain language.

Developer-configuration errors belong in deployment/System diagnostics, not the user sign-in page.

## Account/profile

Add profile/account area with:

- name/email;
- password/security methods;
- timezone;
- notifications;
- sign out;
- connected workspace/products;
- plan/billing if commercialized later.

---

# 5. First-time onboarding

The current first-run/setup experience is split across `onboarding`, `first-run`, `master/product/new`, and Master Control. Consolidate the operator journey while keeping reusable backend actions.

## Step 1 — Welcome

One screen:

> What product should Halyard market?

Inputs:

- product/app name;
- website;
- optional App Store/Play Store link;
- optional repo/docs/API/MCP source;
- `I'll add more sources later`.

Show expected time and what Halyard will do.

## Step 2 — Connect evidence

Cards for:

- Website
- Store listing
- Documentation
- GitHub
- MCP
- REST/OpenAPI
- Upload documents/assets
- Screen recordings

Each shows connected/optional/unavailable and why it helps.

## Step 3 — Live product learning

A visually engaging scan screen using the same crew language as production:

- Research bot reading website
- Product bot mapping features
- Audience bot identifying users/jobs
- Brand bot extracting visual identity
- Evidence bot checking claims

Show real progress/events, not artificial timers.

Results appear progressively as cards.

## Step 4 — Product Brain review

Present a summary with `Looks right` and `Review details`.

Status categories:

- Confirmed
- Inferred — review recommended
- Needs input
- Contradiction

Do not make the user interpret numerical confidence unless they open details.

## Step 5 — Brand & voice

Show extracted:

- logo/icon;
- colors as swatches with semantic roles;
- typography previews;
- imagery style;
- voice/personality;
- phrases to use/avoid.

Editable, with `Use website styling` / `Customize`.

## Step 6 — Goals & audience

Structured cards:

- primary business goal;
- acquisition/activation goal;
- target audiences/personas;
- what users should understand/feel/do;
- current campaign/launch priorities;
- excluded topics/claims.

## Step 7 — Conversion path

Define:

- website/store destination;
- signup flow;
- product-specific activation event;
- deep links where supported;
- analytics connector.

## Step 8 — Connect social accounts

Clear per-platform cards with Connect/Test/Review required/manual mode.

## Step 9 — Teach voice

Do not force a confusing wall of 20 drafts before the user understands the product.

Use progressive calibration:

- start with 4–6 representative examples across different formats;
- user can `Sounds right`, `Too corporate`, `Too terse`, `Not my brand`, or freeform reason;
- continue calibration later until the required unattended-generation threshold is met;
- daily autonomous generation may remain gated by a quality-readiness threshold.

## Step 10 — First creation

Offer:

- `Find three ideas for me`
- `Make a product demo`
- `I'll create later`

Route directly into the new Create experience.

---

# 6. Product Brain

Product Brain becomes a first-class workspace, not a list of fact rows under Master Control.

## Product header

- logo + product name;
- website/category;
- readiness summary;
- last refresh;
- connected evidence count;
- `Refresh understanding`;
- `Edit product`.

## Navigation within Product Brain

- Overview
- Purpose & goals
- Audience
- Features
- Workflows
- Brand
- Voice
- Claims
- Evidence
- Destinations
- Competitors
- Integrations

## Overview

Cards:

- Purpose
- Primary audience
- Primary activation
- Top differentiators
- Current goal
- Brand preview
- Evidence health
- Social readiness

`Needs review` items appear as a short task list.

## Editable knowledge pattern

Every editable item uses the same interaction:

- value;
- status chip;
- source(s);
- last updated;
- Edit;
- Confirm;
- optional lock/pin so machine refresh cannot overwrite an approved operator decision.

Machine updates to pinned fields become suggestions rather than overwrites.

## Claims/evidence

Contradictions and unsupported claims are visually prominent. Clicking a source opens its supporting excerpt/context.

---

# 7. Home / Call Sheet

Answer one question: `What needs me today?`

Top row:

- productions in progress;
- posts waiting review;
- scheduled today;
- conversations needing response.

Main action area:

- Continue review
- Create something
- Connect/fix an account
- Review Product Brain issue

Opportunity block:

- 2–4 current evidence-backed opportunities with `Make this`, `Monitor`, `Dismiss`.

Today's schedule and recent result shown lower on the page.

Avoid system-health detail unless something is broken.

---

# 8. Create / The Floor

## Default brief screen

Large prompt:

> What should the team make?

Examples change by product.

Modes:

- `Describe it`
- `Give me ideas`
- `Use an opportunity`
- `From a campaign/series`

Platform/account chips show actual connected targets and capability states.

Goal is a simple selectable control: Awareness, Engagement, Education, Product demo, Conversion, Community — plus custom.

Advanced settings are collapsed by default.

## Concepts

Concept cards should be visual and comparable:

- concept title;
- opening hook;
- one-sentence premise;
- target audience/goal;
- platform fit;
- intended media format;
- visual/story approach;
- real assets/evidence needed;
- why Halyard recommends it;
- expected duration range;
- cost estimate/range where available.

Buttons: `Choose`, `Remix`, `More like this`, `Not this direction`.

## Creative direction

After selection, show editable pins rather than a huge form:

- tone;
- energy;
- show the product more/less;
- voice;
- visual style;
- music direction;
- CTA;
- duration.

`Let Halyard decide` remains the default.

## Start production

Primary CTA: `Send to the studio`.

A multi-platform request creates one production identity with child variants, then routes to Live.

---

# 9. Live Agent Floor

This should be Halyard's signature experience.

## Visual concept

A polished top-down/isometric creative studio room with small friendly **robot crew members**, not generic human profile bubbles.

Robot roles can include:

- Scout / Research
- Strategist
- Concept
- Writer
- Product Expert
- Storyboard
- Visual Director
- Asset/Capture
- Voice
- Sound
- Editor
- Platform Specialist
- Critic / QA

Not every role must be an independent model agent; the visualization represents real stage ownership. Tooltips/details must state whether the work is agent judgment or deterministic service.

## Robot design

- compact geometric robot body with unique role color/accessory/icon;
- subtle idle animation;
- active robot glows at workstation;
- robots physically move only when a real stage/handoff occurs;
- no fake wandering/activity;
- `prefers-reduced-motion` provides static equivalent.

## Real-time state

One durable `production_id` aggregates all child jobs/events/variants.

States:

- Queued
- Working
- Waiting for dependency
- Retrying
- Blocked
- Done
- Failed
- Skipped/not needed

Allow multiple robots/stages to be active concurrently.

## Handoffs

When Research finishes, an artifact token/document visibly travels to the consumer. Examples:

- verified facts card → Writer;
- script → Storyboard;
- storyboard → Visuals/Assets;
- narration → Voice;
- media + audio → Editor;
- render → Critic;
- defect card → Correction owner;
- final approved candidate → Review monitor.

This visual handoff is derived from actual persisted artifacts/events.

## Clickable detail drawer

Click a robot, desk, or artifact to see:

- what it is doing;
- elapsed stage time;
- current input summary;
- finished outputs from that stage;
- decisions/reasons;
- source/evidence links;
- tools/providers used;
- cost so far;
- downstream next step;
- failure/retry explanation.

Never expose secrets/internal chain-of-thought. Show structured decision summaries and saved artifacts only.

## Time/progress

Top status:

- total elapsed;
- current active stages;
- queue/wait time;
- completed stages;
- estimated remaining **range only when historical data supports it**.

Do not fake a percent complete from number of events.

## Production monitor

Large monitor in the room evolves as real artifacts become available:

- concept/brief card;
- storyboard frames;
- image/capture previews;
- audio player;
- rough render;
- final render.

On completion, it expands into the finished Review experience without forcing the user to hunt through Gallery.

## Controls

- `Pause live updates` (not "pause" unless it truly pauses jobs)
- `Open production details`
- `Leave and notify me when ready`
- cancel only where safe and explicit.

---

# 10. Review / Gallery

Rename primary task to Review while preserving Gallery as studio language.

## Holding queue

Large visual cards with:

- product/platform/account;
- actual preview thumbnail;
- content type;
- hook/title;
- why it exists;
- quality/review state;
- cost;
- created time;
- actions: Open / Reject / Schedule after approval.

## Content detail

Desktop two-column:

Left: actual player/carousel/post preview at realistic device/feed size.

Right:

- platform/account;
- concept/goal;
- caption/title/hashtags;
- CTA/destination;
- voice/music;
- review findings;
- evidence/claims;
- cost;
- revision history.

Primary buttons:

- `Approve this version`
- `Request changes`
- `Reject`

After approval:

- `Schedule`
- `Publish now` only if capability/policy permits and safety confirmation is appropriate.

## Revision UX

Natural-language box plus targeted controls:

> Make the first two seconds clearer and show the product longer. Keep the script.

Display what Halyard plans to invalidate/rebuild before executing expensive work.

Show before/after versions and re-run findings.

---

# 11. Schedule / Rundown

## Views

- Week
- Calendar
- Campaigns
- Series

Cards show product, platform/account, thumbnail, status, and time.

## Timing explanation

Click a scheduled item to show:

- configured window;
- account constraints;
- campaign sequence;
- same-idea staggering;
- learned evidence if used;
- conflicts;
- timezone.

Do not imply heuristic timing is empirically optimal.

Drag/drop reruns schedule rules before persisting.

---

# 12. Engage / Wires

Tabs:

- Inbox
- Opportunities
- Conversations
- Relationships

## Inbox

Owned-post comments/questions with platform/account context, original post preview, severity/type, suggested reply, Edit / Approve & send / Ignore.

## Opportunities

Evidence-backed external conversations/creators with `Draft reply`, `Make content`, `Follow up`, `Monitor` or `Ignore` depending permission/capability.

## Relationship detail

History of interactions, relevant content, permissions, and notes. No inferred relationship should be shown as fact.

---

# 13. Results / Numbers

Top-level tabs:

- Overview
- Content
- Acquisition
- Campaigns
- Platforms
- Learned

## Overview

Use actual outcome hierarchy:

Reach → Engagement → Site/Product traffic → Signup → Activation → Paid outcome (when configured).

Clearly mark unavailable/unmeasured metrics.

## Learned

Each insight shows:

- plain-language finding;
- product/account/platform scope;
- sample size;
- effect/lift;
- confidence/status;
- evidence window;
- contradictions;
- last refreshed;
- `Used in N later decisions` with links.

Avoid decorative percentages that imply statistical certainty.

---

# 14. Setup / Master Control

Keep advanced configuration out of everyday navigation.

Sections:

- Product Brain
- Social Connections
- Platform capabilities
- Content systems/templates
- Assets/audio
- Crew/agents
- System health
- Settings

Crew page should distinguish agents from deterministic services and show real caller/run health rather than merely listing names.

---

# 15. Responsive behavior

## Laptop/desktop

- collapsible 220–240px navigation;
- main content max widths appropriate to task;
- live floor uses full canvas;
- Review uses two-column media + controls;
- Product Brain uses side nav + content pane.

## Phone/mobile web

- five-item bottom nav;
- top product switcher becomes compact sheet/dropdown;
- no text smaller than readable target;
- live floor becomes a vertically scrollable `production map` with animated robot row/cards rather than shrinking the entire room to illegibility;
- tapping a robot opens bottom sheet;
- Review media goes full width, actions sticky at bottom;
- Product Brain categories use accordion/cards;
- calendars default to agenda/list and allow switch to month/week.

No feature may become inaccessible simply because it is not on the bottom navigation.

---

# 16. Empty/loading/error/guidance states

Every major page requires:

- loading/skeleton state;
- first-time empty state explaining what to do;
- blocked state with exact next action;
- stale state when data may be outdated;
- provider/account capability state;
- retry/recovery state;
- contextual help.

Use short plain-language copy and optional `Why?` popovers rather than long explanatory paragraphs in the primary flow.

---

# 17. Components to build/rework

Shared production components should include:

- `ProductSwitcher`
- `PrimaryNav`
- `MobileNav`
- `TaskHeader`
- `StatusChip`
- `EvidenceChip`
- `SourceDrawer`
- `ProductBrainField`
- `BrandPalettePreview`
- `ConceptCard`
- `PlatformAccountPicker`
- `ProductionStageMap`
- `RobotAgent`
- `ArtifactHandoff`
- `ProductionDrawer`
- `ElapsedTimer`
- `MediaPreview`
- `PlatformVariantTabs`
- `RevisionComposer`
- `ApprovalBar`
- `ScheduleReasonDrawer`
- `OpportunityCard`
- `ReplyComposer`
- `LearningInsightCard`
- `CapabilityCard`

Reuse backend actions and existing UI primitives where they are sound; do not build a parallel data model solely for the redesign.

---

# 18. UI implementation acceptance

The redesigned product is not accepted until:

- public landing/auth flows work;
- new-product onboarding completes without developer intervention;
- Product Brain is readable/editable and evidence-backed;
- RecipeFix, Kinolog and a third real product display correctly;
- Create can produce a multi-platform production;
- Live follows the full production, including downstream render/QA/correction jobs;
- robot/stage animation reflects real events and remains understandable with reduced motion;
- intermediate artifacts are inspectable;
- completion reveals real media;
- operator can hear/watch/swipe the exact output;
- targeted revision creates a new reviewable revision;
- approval binds to that revision;
- scheduling shows clear rationale and account identity;
- engagement/reply flows are contextual and permission-aware;
- Results distinguishes unmeasured from zero;
- essential UI text is readable at phone/laptop sizes;
- keyboard/focus/contrast/reflow requirements pass;
- no ordinary workflow requires SQL or hidden terminal rescue.

The redesign should make Halyard easier to understand while preserving its strongest distinctive idea: **you are directing an expert social-media studio and can actually watch the team make the work.**
