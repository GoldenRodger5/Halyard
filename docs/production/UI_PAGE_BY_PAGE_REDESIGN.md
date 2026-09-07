# Halyard UI — Page-by-Page Production Redesign Pass

**Purpose:** make the existing application feel like a polished, useful creative operating system without overloading the operator or flattening Halyard into generic SaaS.

This pass is grounded in the current Studio implementation. It does not propose deleting useful backend/UI paths simply because the presentation is changing.

Current strengths to preserve:

- seven-room studio metaphor;
- product switcher;
- real readiness and system state;
- real connection state;
- real production/job/event data;
- Gallery preview infrastructure;
- scheduling/rundown model;
- Product Brain evidence model;
- human approval boundary.

Primary problems to fix:

- task language is sometimes hidden behind room terminology;
- too much important text is 9–12px;
- several pages are text-first when visual content would communicate faster;
- onboarding/setup exists in several overlapping flows;
- Product Brain exposes database-like facts rather than an editable understanding of the business;
- Live Floor is spatially schematic rather than immersive/useful;
- Review, Schedule, Engage and Results are operationally valid but visually flat;
- developer/platform setup detail appears too close to the main operator experience;
- mobile often compresses desktop concepts instead of providing a tailored interaction.

---

# 1. Global navigation and shell

## Current

The current Studio exposes:

- Call Sheet
- The Floor
- Gallery
- Rundown
- Wires
- Numbers
- Master Control

The metaphor is distinctive and useful after someone knows it, but a new operator has to translate the room names into tasks.

## Redesign

Primary navigation uses task labels with room language as secondary identity:

- **Home** · Call Sheet
- **Create** · The Floor
- **Review** · Gallery
- **Schedule** · Rundown
- **Engage** · Wires
- **Results** · Numbers
- **Setup** · Master Control

Add a first-class **Product Brain** destination either between Home/Create or inside the product switcher popover. Product Brain is important enough that an operator should not have to enter Master Control to find it.

### Desktop shell

Left rail:

- Halyard mark;
- current product selector with logo/accent;
- primary navigation;
- compact live-production status at bottom;
- account/profile button.

Top bar:

- task title;
- room subtitle;
- current product/account context when relevant;
- one prominent `Create` action;
- contextual status only when it matters.

### Mobile shell

Bottom navigation:

- Home
- Create
- Review
- Schedule
- More

`More` opens:

- Engage
- Results
- Product Brain
- Connections
- Profile
- Settings/System

The live-production now bar sits above the bottom navigation only while a production is active or blocked.

---

# 2. Visual system

## Typography

The product must stop using tiny type as part of its aesthetic.

Recommended targets:

- page title: 30–40px desktop, 28–32px mobile;
- section heading: 18–22px;
- body: 15–16px;
- forms: 15–16px;
- secondary/supporting copy: 13.5–14px minimum when meaningful;
- tags/status: 11–12px where contrast is strong;
- data-only timestamp/ID: 11–12px.

Avoid Instrument Serif or other decorative serif/cursive-feeling styles for ordinary app headings, forms, tables and navigation.

Use product-specific fonts only inside Product Brain brand previews and generated-content previews.

## Color

Keep the deep marine + brass Halyard identity.

Use:

- dark studio shell;
- warm white/paper work surfaces;
- subtle cool grid/background;
- brass for focus/wayfinding;
- clear green for safe/ready;
- signal red/orange for intervention/failure;
- blue for information/waiting where needed.

Do not use five card colors to create artificial variety.

## Shape/material

- fewer nested border boxes;
- larger, more intentional panels;
- 14–18px surface radii;
- modest shadows only on raised surfaces;
- imagery, previews and diagrams before paragraphs where possible;
- use dividers/spacing instead of every item becoming a separate card.

## Motion

Use motion to explain state and hierarchy:

- 160–240ms page/section transitions;
- spring drawers and reordering where useful;
- intentional loading/progress motion;
- reduced-motion equivalent;
- no ambient animation on ordinary data screens simply to make them feel alive.

---

# 3. Public landing page

## Current gap

The authenticated Studio effectively owns the product root. There is no polished public product story representing what Halyard has become.

## Build

A real landing page with no dependency on authenticated application data.

### Hero

Outcome-first headline:

> Your social media team, already at work.

Supporting copy:

> Connect your product. Halyard learns it, finds opportunities, creates platform-native content, lets you review every post, and learns from what performs.

Primary CTA:

- Start with your product

Secondary:

- Watch the studio work

Hero visual should be a polished demo version of the Live Floor alongside finished post variants.

### Sections

- Connect and understand your product;
- Product Brain;
- discovery/trends/social intelligence;
- creative production;
- live team;
- review and approval;
- platform adaptation;
- scheduling/publishing;
- learning/acquisition;
- multi-product examples;
- approval/safety commitment;
- platform capability honesty;
- footer/legal/privacy/data deletion.

Do not fill the landing page with arbitrary fake metrics.

---

# 4. Sign in

## Current

Visually aligned with the Studio, but copy exposes implementation language such as `admin_users` and environment configuration.

## Redesign

Centered premium sign-in surface:

- Halyard mark;
- `Welcome back`;
- Google option when available;
- email/password;
- magic-link option;
- forgot password;
- clear error state;
- `Create account` when multi-user onboarding exists.

Hide deployment/configuration details from normal users.

If the deployment itself is misconfigured, show a generic unavailable message and expose exact diagnostics only in development/System contexts.

---

# 5. Account/profile

Add an operator profile area.

Show:

- name/email;
- avatar;
- timezone;
- notification preferences;
- security/sign-in methods;
- workspace/products;
- sign out;
- plan/billing later if needed.

Do not mix personal account settings with social-platform Connections.

---

# 6. Onboarding

## Current

Product creation, `/onboarding`, `/first-run`, calibration, Product Brain, account connections and readiness are split across overlapping flows.

The current onboarding also exposes a large calibration batch before the operator has a simple mental model of Halyard.

## Redesign

One guided onboarding flow with save/resume.

### Step 1 — Product

Ask only:

- product name;
- website/store link;
- optional extra evidence connection;
- `Add more later`.

### Step 2 — Halyard learns it

Show a compact live-learning room:

- website/evidence scan;
- feature mapping;
- audience extraction;
- brand extraction;
- claim verification.

Real progressive outputs appear while work runs.

### Step 3 — Review Product Brain

Give the operator a high-level summary before asking them to edit details.

Cards:

- purpose;
- audience;
- features;
- differentiators;
- goals;
- activation;
- brand;
- voice.

Status language:

- Confirmed
- Inferred
- Needs your input
- Contradiction

### Step 4 — Brand and voice

Show visual palette and typography at real size.

Allow:

- accept extracted system;
- edit colors;
- upload logo/icon;
- modify typography;
- choose/describe voice;
- phrases to prefer/avoid.

### Step 5 — Goals and conversion

Ask what success means:

- awareness;
- audience growth;
- product use;
- signup;
- activation;
- launch;
- community;
- custom.

Define destination/activation events where possible.

### Step 6 — Social accounts

Friendly platform cards with:

- connect;
- connected;
- limited/review needed;
- manual route;
- reconnect;
- test.

Advanced developer-app setup goes behind `Platform setup details`.

### Step 7 — Quick calibration

Start with 4–6 representative drafts or creative directions instead of forcing 20 immediately.

Simple feedback chips:

- Sounds right
- Too corporate
- Too terse
- Too salesy
- Too generic
- Not our voice
- custom reason.

Allow calibration to continue later until unattended-generation readiness is earned.

### Step 8 — First production

Offer:

- Find three ideas for me
- Make a product demo
- Create from my prompt

Then route directly to Create/Live Floor.

---

# 7. Home / Call Sheet

## Current

The current page already has a useful `what needs me` model, overnight activity, counts, readiness and account states. Preserve this logic.

The visual result is still somewhat static and text-heavy.

## Redesign

Top answer:

> What should I do today?

Hero area:

- one primary recommended action;
- why;
- primary button;
- optional second action.

Compact status strip:

- in production;
- waiting review;
- scheduled today/week;
- conversations needing response.

### Opportunities

Show 2–4 real opportunities with:

- source type;
- currentness;
- relevance;
- content angle;
- `Make this`, `Monitor`, `Dismiss`.

Include thumbnail/source preview where helpful.

### Today's work

Show:

- active production preview;
- next scheduled content;
- most important recent result.

### Setup/system issues

Only interrupt the Home page when they require operator action.

Do not dump all connection/system status onto Home once onboarding is complete.

---

# 8. Product Brain

## Current

The current `/master/product` is evidence-grounded, which is excellent, but visually behaves like a fact ledger. It is not yet an easy place to understand and edit the whole product.

## Redesign

Make Product Brain a first-class workspace.

Product header:

- product logo;
- name;
- website/category;
- understanding health;
- last refresh;
- `Refresh understanding`;
- `Edit product`.

Tabs:

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

### Overview

Use larger cards for:

- product purpose;
- primary audience;
- current business goal;
- activation;
- top differentiators;
- brand snapshot;
- evidence health.

### Knowledge editing

Every fact/decision follows one reusable pattern:

- value;
- state;
- source count;
- last updated;
- edit;
- confirm;
- pin/lock.

A pinned operator decision cannot be silently overwritten by later automated refresh.

### Brand tab

Show:

- logo/icon;
- full palette;
- semantic roles;
- typography specimens;
- example generated card;
- image style;
- motion/style notes;
- downloadable source not required.

### Audience tab

Personas should be visual cards with:

- job/problem;
- motivations;
- objections;
- product moment;
- language observed in evidence;
- confidence/source.

### Goals tab

Separate:

- business goal;
- social objective;
- conversion/activation objective;
- current campaign priority;
- content exclusions.

---

# 9. Create / The Floor — Brief

## Current

Current BriefRoom has real carriage/platform/format logic but exposes many operational choices before the user has stated the creative objective.

## Redesign

Start with one large prompt:

> What should the team make?

Modes:

- Describe it
- Give me ideas
- Use an opportunity
- From a campaign/series

Show platform/account chips that reflect actual connected capability.

Goal control:

- Awareness
- Engagement
- Education
- Product demo
- Conversion
- Community
- Custom

Keep media/format choices visible only when the user asks or when the current choice matters.

Advanced creative direction remains collapsed.

### Concepts

Offer 3–5 genuinely distinct cards.

Each includes:

- title;
- hook;
- premise;
- audience/goal;
- media type;
- story/visual approach;
- product/evidence needed;
- platform fit;
- duration range;
- cost range when known;
- reason recommended.

Buttons:

- Choose
- Remix
- More like this
- Not this direction

Do not fill cards with model-chain explanations.

---

# 10. Live Floor

The detailed implementation is in `LIVE_AGENT_FLOOR_SPEC.md`.

The redesign requirement is non-negotiable:

- actual room;
- distinct robots;
- clear workstations;
- real parallel work;
- moving artifact handoffs;
- clickable every desk/artifact;
- stage inspector;
- total/stage time;
- honest ETA only when supported;
- cost;
- actual rough/final monitor;
- finished content appears at completion.

It should be entertaining because useful things are visibly happening, not because the UI invents activity.

---

# 11. Review / Gallery

## Current

The Monitor Wall is distinctive, but the main review journey should emphasize the actual post and the decision more strongly.

## Redesign

### Holding queue

Cards prioritize actual media preview.

Show:

- platform/account;
- media preview;
- hook/title;
- purpose;
- quality state;
- age;
- cost;
- `Open`.

Use failures as a visually separate section rather than mixing them into the same visual rhythm as publishable candidates.

### Detail/review

Desktop:

- large preview/player left;
- decision/metadata panel right.

Mobile:

- preview first;
- sticky decision actions.

Sections:

- Content
- Why this exists
- Platform variant
- Caption/title
- Destination/CTA
- Evidence/claims
- Voice/music
- Quality review
- Revision history

Primary actions:

- Approve this version
- Request changes
- Reject

After approval:

- Schedule
- Publish now only when permitted and appropriate.

### Revision interaction

Natural-language request plus optional target controls.

Before spending money, show:

> This will rebuild: opening + edit + review. Script and product capture stay unchanged.

Then show before/after.

---

# 12. Schedule / Rundown

## Current

Current Rundown is a clean chronological list with open-slot awareness, but it does not yet feel like a planning workspace.

## Redesign

Desktop default:

- week timeline/calendar;
- platform icons;
- post thumbnails;
- empty opportunity windows;
- same-idea cross-platform relationship;
- drag only when safe and backed by actual update logic.

Each scheduled item shows:

- exact account;
- platform;
- post type;
- status;
- scheduled window/time;
- why Halyard recommends it;
- whether timing is configured heuristic or learned evidence.

Empty slots can say:

- `Open`;
- `Intentional rest`;
- `Campaign reserved`;
- `Waiting for trend check`.

Do not imply every blank day is a problem.

Mobile:

- agenda by day;
- horizontal day switcher;
- avoid squeezing a seven-column calendar.

---

# 13. Engage / Wires

## Current

Current Wires uses sequential comment cards and explains that the adapter cannot send replies. The production plan now requires actual permission-aware sending where the platform route supports it.

## Redesign

Use an inbox/detail split.

Left/upper pane:

- owned comments;
- external opportunities;
- support questions;
- creator/community conversations;
- filters.

Right/detail pane:

- source post/context;
- author;
- relationship/context;
- exact conversation;
- suggested reply;
- why Halyard thinks it is worth responding;
- eligibility/permission state.

Actions:

- Approve & send where eligible;
- Edit;
- Open natively;
- Skip;
- Turn into a post;
- Monitor creator.

Make external opportunities visually distinct from owned-account comments.

Never show `Send` if Halyard cannot actually send on that route.

---

# 14. Results / Numbers

## Current

The distinction between unmeasured and measured zero is excellent and must remain. Current visual presentation is mostly KPI cards + a platform table.

## Redesign

Top funnel:

- Impressions
- Engaged viewers/users
- Site/app visits
- Signups
- Activations
- Paid conversion when available

But only show measurements the product actually instruments.

Charts:

- social reach over time;
- acquisition/activation over time;
- content role mix;
- platform contribution;
- top content by relevant business outcome.

### Learned

Insights should read like evidence summaries:

> Product shown in the first four seconds is associated with higher activation in 11 measured RecipeFix posts. Moderate confidence; not validated yet.

For each:

- sample;
- effect/lift;
- confidence/status;
- contradictions;
- which future decision it influences;
- `Don't use this` operator override where appropriate.

Do not let weak/small-sample insights visually resemble proven rules.

---

# 15. Connections / Master Control

## Current

Current connection rows are much better than the old hidden setup path, but the page still includes a great deal of provider-registration and environment detail.

## Redesign

Primary account card:

- platform logo;
- account handle;
- connected state;
- posting capability;
- read/engagement capability summary;
- test state;
- primary action.

Examples:

- Ready
- Drafts/private only
- Review required
- Needs reconnect
- Not connected

Primary buttons:

- Connect
- Reconnect
- Test
- Manage

`Platform setup details` drawer contains:

- callback URL;
- developer dashboard instructions;
- required scopes;
- environment variable names;
- review submission state;
- diagnostic details.

This preserves operator power without making every ordinary user read developer setup instructions.

---

# 16. Platform rules

Turn the current rule inventory into a human-readable capability matrix.

Rows/surfaces:

- publish text;
- image;
- carousel;
- short video;
- long video;
- story;
- comment read;
- reply;
- metrics;
- schedule;
- public capability.

Columns:

- declared support;
- account verified;
- review/provider restriction;
- manual fallback.

Keep detailed raw provider data behind a diagnostics view.

---

# 17. Crew

Current agent registry/system-health detail is useful to developers/operators but should not compete with the Live Floor.

Redesign Crew as:

- teams;
- roles;
- current version;
- last execution;
- health;
- whether the role is model-driven, deterministic, or mixed.

Agent run logs and contracts remain available in deeper diagnostics.

Do not present agent count as a product-quality metric.

---

# 18. Templates / creative system

Current template inventory is a technical implementation surface.

Redesign as a Creative Library.

Show:

- post type;
- intended platforms;
- actual thumbnail/render preview;
- enabled/disabled;
- treatment/visual language;
- recent usage;
- production quality state.

Separate:

- compositional primitives;
- finished reusable structures;
- platform surfaces.

The operator should be able to preview and disable an undesirable treatment without needing to understand Remotion component names.

---

# 19. System

Keep this intentionally advanced.

Show:

- web revision;
- worker revision;
- schema compatibility;
- worker heartbeat;
- queue health;
- failed jobs;
- budget/provider availability;
- publishing kill switch;
- storage/capture health.

Use plain-language headline first:

> Everything is running current code.

or

> Worker is behind the web release and cannot execute 3 expected jobs.

Technical ids/logs live underneath.

---

# 20. Empty, loading, error and stale states

Every page should have intentional states.

## Empty

Explain whether empty is:

- healthy;
- waiting for first use;
- needs configuration;
- unexpected.

## Loading

Use skeletons for content surfaces; use actual stage state for long-running work.

Do not use fake AI-thinking copy on ordinary database reads.

## Error

State:

- what failed;
- whether work is safe;
- what the user can do;
- technical details behind expansion.

## Stale

When information is stale, show last successful refresh and allow explicit refresh where safe.

---

# 21. Images, guidance and popovers

Use visual guidance where it reduces confusion.

Examples:

- Product Brain brand previews;
- annotated post-format examples;
- platform account icons;
- example campaign structures;
- small `?` popovers for capability terminology;
- onboarding illustrations of evidence sources;
- preview thumbnails instead of filenames;
- before/after revision previews.

Avoid decorating every surface with generic stock illustrations.

---

# 22. Responsive requirements

Every core journey must be verified at:

- 1440px desktop;
- 1280px laptop;
- 1024px tablet/small laptop;
- 768px tablet portrait where relevant;
- 390px phone.

Mobile should adapt interaction rather than simply stack every desktop panel.

Examples:

- week calendar becomes agenda;
- inbox split becomes list → detail;
- Product Brain sidebar becomes horizontal tabs/dropdown;
- Review becomes preview → sticky actions;
- Live Floor becomes production corridor/bays;
- connection details become drawers.

---

# 23. Recommended component architecture

Build reusable product primitives rather than styling every page independently.

Recommended components:

- `ProductContextBar`
- `TaskNavigation`
- `StatusStrip`
- `OpportunityCard`
- `KnowledgeCard`
- `EvidenceDrawer`
- `PlatformAccountChip`
- `PostPreview`
- `ProductionCard`
- `ReviewFinding`
- `RevisionComposer`
- `ScheduleItem`
- `ConversationRow`
- `InsightCard`
- `ConnectionCard`
- `DiagnosticDrawer`
- `RobotAgent`
- `StudioDesk`
- `ArtifactToken`
- `ProductionMonitor`

Use the existing `@halyard/ui` package as the shared home for stable primitives where appropriate.

---

# 24. UI verification

For every redesigned route:

- desktop screenshot;
- mobile screenshot;
- keyboard navigation;
- focus visible;
- contrast check;
- text-resize/reflow check;
- empty state;
- loading state;
- failure state;
- representative populated state;
- no invisible/obscured actions;
- no clipped labels;
- no hover-only critical information.

Real routes should be exercised against seeded representative multi-product data for RecipeFix, Kinolog and the third validation app.

---

# 25. Acceptance bar

The redesign is complete when a first-time user can:

1. understand what Halyard does from the landing page;
2. sign up/sign in without developer language;
3. connect an app;
4. watch Halyard learn it;
5. review/edit Product Brain by category;
6. connect social accounts;
7. create a post without understanding internal job architecture;
8. watch the team work in a visually rich truthful Floor;
9. click specialists and inspect real work;
10. watch/listen to the finished content;
11. request a targeted revision;
12. approve the exact revision;
13. schedule it clearly;
14. engage with conversations through permitted routes;
15. see measured results and what Halyard learned;
16. use every critical workflow on phone and laptop;
17. never need hidden SQL/terminal work for an ordinary operator task.

The finished application should feel calm and obvious in ordinary use, visually memorable in the places where Halyard is genuinely unique, and detailed only when the operator asks for detail.
