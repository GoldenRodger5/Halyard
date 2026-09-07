# Halyard Live Agent Floor — Signature Experience Specification

**Purpose:** turn the current live-production view into a truthful, delightful, production-grade representation of Halyard's creative team working in real time.

The Floor must become one of Halyard's signature product experiences. It should be genuinely useful to an operator, visually memorable enough to communicate what makes Halyard different, and completely grounded in real production state.

The current floor already has valuable foundations: real job events, desk/stage ownership, current handoff inference, a running-status rail, and a persistent studio metaphor. Preserve those foundations. Replace the schematic feel, tiny labels, and single-current-desk illusion with a richer spatial room driven by one production graph.

---

# 1. Experience goal

When a user sends a brief to Halyard, they should feel as if they have handed work to a small expert creative studio.

The user should be able to:

1. see which specialists are currently working;
2. see work happen in parallel where the backend really works in parallel;
3. watch finished artifacts move between specialists;
4. click any specialist, desk, artifact, monitor, or stage to inspect what actually exists;
5. understand what is waiting, blocked, retrying, or finished;
6. see total elapsed time, stage time, queue/wait time, cost, and next steps;
7. leave the screen without stopping production;
8. return later and reconstruct the whole production from persisted history;
9. see the finished post appear in the same experience as soon as production completes;
10. move directly into Review without hunting through another page.

The Floor is not an activity animation layered over logs. It is a visual representation of persisted production truth.

---

# 2. Visual direction

## Room, not graph

The default desktop view should look like a stylized top-down/isometric creative-production room rather than a node graph.

Suggested environment:

- deep marine studio shell;
- warm brass handoff table in the middle;
- lit wall/program monitor;
- seven to twelve workstations arranged around clear circulation paths;
- visible floor grid/material texture;
- subtle overhead task lighting;
- small equipment details such as monitors, audio console, storyboard wall, edit bay, review monitor;
- enough negative space that robots and artifacts never collide or hide one another.

The room must remain legible at laptop size. The user should never need to zoom a browser just to click a desk.

## Robots

Represent crew members as small friendly geometric robots designed specifically for Halyard.

Robots should feel like studio staff, not mascots floating over a dashboard.

Base robot system:

- common recognizable body silhouette;
- role-specific body accent;
- small accessory/symbol where helpful, for example headset, lens, notepad, waveform, edit blade, magnifier;
- two or three restrained idle poses;
- active/work pose;
- walking/handoff pose;
- blocked/error pose;
- completed/idle-at-desk pose.

Do not turn every registered agent into a visible robot. The room represents meaningful production responsibilities.

Recommended visible production desks:

- Scout / Research
- Strategy
- Product Expert
- Writer / Story
- Visual Director / Storyboard
- Assets / Capture
- Voice + Sound
- Editor
- Platform Director
- Critic / Review

A desk can represent a coordinated deterministic service plus model-based judgment. The detail drawer must say which actual stages/services/agents contributed.

---

# 3. Spatial layout rules

Desktop should use deliberately reserved zones rather than free placement.

Example room plan:

```text
┌────────────────────────────────────────────────────────────┐
│                   PROGRAM / PREVIEW WALL                   │
│                                                            │
│  RESEARCH        PRODUCT          STRATEGY        EDIT     │
│                                                            │
│              ┌──────── HANDOFF ────────┐                  │
│              │         TABLE           │                  │
│              └─────────────────────────┘                  │
│                                                            │
│  WRITER          VISUALS          AUDIO          PLATFORM  │
│                                                            │
│                        CRITIC                             │
└────────────────────────────────────────────────────────────┘
```

Requirements:

- no desk or robot may overlap another at supported breakpoints;
- no moving robot may cross through a clickable desk;
- artifact travel should follow reserved corridors;
- the central handoff table remains unobstructed;
- labels must remain readable without hovering;
- minimum interactive target should be comfortable for pointer/touch use;
- room coordinates must adapt to width through layout presets, not uncontrolled scale-down.

At smaller desktop widths, collapse low-priority desks into grouped bays rather than shrinking everything to unreadable sizes.

---

# 4. Motion language

Motion must explain state.

## Idle

- subtle breathing/bobbing only;
- monitor glow changes gently;
- no fake typing or fake walking;
- inactive desks stay calm.

## Working

- workstation/task light turns on;
- robot moves slightly toward its console/work surface;
- role-specific micro-animation, such as Writer turning a page, Audio monitoring a waveform, Editor scrubbing a timeline;
- status copy updates from real stage events.

## Parallel work

Multiple desks may be active simultaneously. The room must show this honestly.

Do not force a single blinking `current agent` when visual work and voice work are running at the same time.

## Handoff

When one persisted artifact becomes input to another stage:

1. producing robot leaves or reaches from its workstation;
2. an artifact object appears with a recognizable shape;
3. artifact moves along a clear path or to the central handoff table;
4. consumer desk lights before receipt;
5. receiving robot physically accepts the artifact;
6. artifact becomes available in the consumer's detail drawer;
7. event feed records the same handoff.

Artifact visual types:

- source/fact cards;
- strategic brief clipboard;
- script page;
- storyboard strip;
- image/capture thumbnails;
- audio reel/waveform card;
- render filmstrip;
- defect/revision ticket;
- final approved candidate.

Handoff animation must be driven by a real artifact relationship or stage transition, not by a timer alone.

## Retry

- desk changes to amber rather than pretending work is normal;
- previous artifact remains visible;
- retry count and reason appear;
- a retried stage should not replay all previous handoffs as though they are new work.

## Blocked

- robot stops at its desk;
- task light changes to blocked state;
- detail drawer says exactly what is missing;
- if human input is required, a `Needs you` callout appears outside the room as well.

## Failure

- failure is visible but not theatrical;
- preserve the last good artifact;
- show who failed, what failed, and whether recovery is possible.

## Completion

- program monitor switches from `working` to the actual finished preview;
- desks settle rather than continuing animation;
- completed production receives one clear success state;
- primary actions become `Review finished post`, `Open variants`, and `Leave for later`.

---

# 5. Real production identity

The existing implementation is too job-centric for the final experience.

Introduce or fully wire one durable `production_id` that groups:

- originating brief;
- selected concept;
- strategy;
- all child jobs;
- platform variants;
- captures/assets;
- narration/audio;
- renders;
- QA runs;
- corrections;
- revisions;
- final candidate(s);
- operator decisions.

The Floor reads the production, not merely `the newest running generate job`.

A production remains active until every required child stage is terminal or the production is explicitly terminal.

---

# 6. Stage lifecycle model

Persist or derive an authoritative lifecycle for each stage:

```text
not_needed
queued
waiting_dependency
working
retrying
blocked
completed
failed
cancelled
```

Each lifecycle record needs:

- production id;
- stage id;
- responsible desk;
- started at;
- completed at;
- total active duration when measurable;
- total wait duration when measurable;
- attempt count;
- status reason;
- input artifact ids;
- output artifact ids;
- child job ids;
- cost attributable to the stage where available.

A log line is not itself a lifecycle state.

---

# 7. Agent/desk detail drawer

Every desk is clickable.

Desktop: persistent right-side inspector.

Mobile/tablet: bottom sheet or full-screen inspector.

Show:

## Header

- role;
- friendly crew name;
- real state;
- stage elapsed time;
- attempts;
- cost so far.

## `Working on`

One concise operator-facing description.

Example:

> Verifying whether the protein-pasta opportunity is current and relevant before the writer uses it.

## Inputs

Structured summaries and links to persisted artifacts.

Examples:

- chosen opportunity;
- product facts;
- operator instruction;
- selected concept;
- upstream script.

## Decisions

Show saved structured decision summaries, not hidden chain-of-thought.

Examples:

- `Rejected trend audio because the licence does not cover this destination.`
- `Kept product capture because this beat makes a product claim.`
- `Changed from listicle to walkthrough because the product proof is stronger than the generic advice.`

## Outputs

Cards for every finished artifact available from the desk.

Clicking an artifact opens a preview:

- fact/source drawer;
- script text;
- storyboard;
- image;
- capture clip;
- audio player;
- render preview;
- QA finding.

## Next

Show actual downstream dependency.

Example:

> When the final capture lands, Editor can assemble TikTok, Reels and Shorts variants in parallel.

---

# 8. Program monitor

The room's wall monitor should evolve through production.

Possible states:

1. brief card;
2. selected concept;
3. storyboard/shot strip;
4. asset contact sheet;
5. voice waveform/audio preview;
6. rough render;
7. final platform variants;
8. review verdict.

Clicking the monitor opens the currently most useful artifact at a useful size.

The monitor should never display a fake percent-complete video if no such artifact exists yet.

---

# 9. Progress and time

Header should show:

- product;
- production name;
- total elapsed time;
- number of active desks;
- completed / required stages;
- cost so far;
- estimated remaining range if enough comparable historical productions exist.

Do not infer `84% complete` from event count.

If no calibrated ETA exists, say:

> 6 stages completed · 2 working

rather than fabricating a remaining time.

Persist duration history by meaningful stage + production type so ETA can eventually become evidence-based.

---

# 10. Event feed

Keep a compact event rail, but make it secondary to the spatial room.

Feed entries should be operator-readable:

> 00:18 · Research verified 3 of 4 proposed facts.

> 00:31 · Writer received the strategic brief.

> 01:12 · Product capture completed: 3 usable clips.

> 02:44 · Critic returned one pacing defect to Editor.

Do not flood the feed with structural `stage opened` noise.

Allow `Show technical events` in an advanced drawer.

---

# 11. Finished output in the Floor

When production is complete, the user should not be redirected to hunt for the item.

The same page becomes the completion view:

- platform tabs;
- actual video/image/carousel preview;
- caption/title;
- variant status;
- review summary;
- cost;
- production duration;
- correction count.

Primary actions:

- `Review finished post`
- `Request a change`
- `Open all variants`

The Review page remains the full decision surface, but the Floor provides the transition immediately.

---

# 12. Mobile experience

Do not shrink the room until it becomes a miniature diagram.

Mobile uses a different composition:

- room presented as a vertically scrolling studio corridor or two-column production bay;
- active robots/desks appear as large cards with actual animation;
- handoffs animate between adjacent stages;
- sticky top bar shows production state/time;
- bottom sheet shows selected desk/artifact;
- finished preview takes over the upper half when ready.

Mobile must retain every production fact and interaction available on desktop.

---

# 13. Accessibility

- all desks are real buttons or accessible interactive elements;
- labels are readable without hover;
- focus state clearly identifies the selected desk;
- every motion event has a textual equivalent in the feed;
- `prefers-reduced-motion` removes travel/bobbing while preserving state changes;
- user can pause **live visual updates** without pausing backend jobs;
- never label this control `Pause production` unless the backend truly supports safe production pause.

---

# 14. Recommended frontend implementation

Prefer ordinary DOM + SVG over a canvas-only room so every robot/desk remains accessible and inspectable.

Recommended approach:

- React components for desks, robots, artifacts and inspector;
- `motion/react` for layout transitions, handoffs, robot travel and drawers if adding the dependency is acceptable;
- SVG paths for handoff routes/wires;
- CSS transforms for robot micro-motion;
- Floating UI or the existing accessible component library for tooltips/popovers;
- existing server-side read models for persisted data;
- SSE/WebSocket only if justified by latency/load; otherwise a robust short-poll read model is acceptable initially.

Avoid introducing WebGL/Three.js merely for spectacle. Use it only if a later prototype proves clear UX value without hurting responsiveness, accessibility, or maintainability.

Rive may be considered for polished robot character micro-animations if custom assets are created, but core stage/state behavior must remain code-driven and accessible without Rive.

---

# 15. Performance requirements

- room should remain responsive on ordinary laptops;
- no uncontrolled animation loops when tab is backgrounded;
- pause nonessential motion when the page is hidden;
- keep artifact thumbnails appropriately sized;
- do not stream full source/video payloads simply to update a desk status;
- lazy-load heavy preview assets;
- animation must not delay stage/status updates.

---

# 16. Testing

## State tests

Cover:

- no production;
- queued with no worker;
- one active stage;
- multiple active stages;
- child render/TTS after parent generation ends;
- waiting dependency;
- retry;
- blocked human input;
- failure;
- correction loop;
- multiple platform variants;
- finished production.

## Interaction tests

- every desk can be clicked by mouse, keyboard and touch;
- inspector opens the correct persisted artifacts;
- moving animation never intercepts desk click targets;
- finished output appears without full navigation reload;
- leaving and returning reconstructs identical production state;
- `Pause live updates` only stops display polling/animation;
- reduced-motion path exposes equivalent state.

## Visual regression

At minimum:

- 1440px desktop;
- 1280px laptop;
- 1024px small laptop/tablet landscape;
- 390px phone;
- longest realistic desk/role labels;
- error and blocked states;
- simultaneous working desks.

No screenshot may contain overlapping desks, robots, labels, action drawers, or moving artifact lanes.

---

# 17. Acceptance bar

The Live Floor is complete when:

1. the room looks like a deliberately designed creative-production space, not a node diagram;
2. robots and artifacts are visually distinct and never obscure one another;
3. every visible state corresponds to real persisted production state;
4. parallel work is represented honestly;
5. handoffs are derived from real inputs/outputs;
6. every desk is useful when clicked;
7. time/cost/status remain truthful;
8. leaving and returning loses no context;
9. the finished post appears in the Floor at completion;
10. mobile is a first-class tailored layout;
11. reduced-motion remains fully usable;
12. the feature remains entertaining after the novelty wears off because it is operationally useful.
