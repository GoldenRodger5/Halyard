# Halyard Live Floor — Technical Design & Animation Architecture

**Purpose:** define the concrete frontend architecture, libraries, scene model, animation rules, interaction system, performance constraints, and implementation sequence for the Live Agent Floor.

This document supplements `LIVE_AGENT_FLOOR_SPEC.md`. The experience specification defines what the Floor must feel like and what it must communicate. This document defines how to build it without falling back to a node graph, fake activity, inaccessible canvas art, or brittle one-off animations.

---

# 1. Technical recommendation

Build the Floor as a **hybrid interactive scene**:

1. **PixiJS v8 + `@pixi/react`** for the spatial room, props, robot positions, artifact travel, lighting, particles, route overlays, hit testing, and 2.5D/isometric scene composition.
2. **Motion for React (`motion/react`)** for the ordinary DOM UI around the scene: page transitions, inspector drawers, selected-artifact transitions, timeline strips, completion states, cards, and responsive layout transitions.
3. **Rive** for polished robot character animation *if and only if a measured prototype demonstrates acceptable performance and maintainability*. Use Rive state machines for character states such as idle, working, walking, receiving, blocked, and celebrating. Do not put workflow truth inside Rive.
4. **DOM/React overlays** for accessible labels, stage inspector, timeline, controls, screen-reader equivalents, keyboard navigation, and text that must remain crisp and selectable.
5. **Existing persisted production state** remains the source of truth. Animation is a projection of state changes, never the owner of state.

The current application is React 19, which is compatible with current PixiJS React v8. PixiJS provides a GPU-accelerated scene graph and pointer/touch event system suitable for moving, interactive display objects. Current PixiJS React documentation describes `@pixi/react` as a thin React binding to PixiJS v8. PixiJS also exposes an opt-in accessibility overlay that can align DOM accessibility elements to interactive scene objects.

Motion for React should remain the default for DOM animation because it provides interruptible transform-based layout animation, shared-element transitions, gestures, and reduced-motion support without requiring a separate scene engine.

Rive is appropriate for character animation because its state machines can encapsulate visual animation transitions while being controlled by application data. The application must still map Halyard stage lifecycle to Rive inputs explicitly.

## Do not use by default

### React Flow / XYFlow

Do not use a node/edge workflow library for the signature room. It would pull the design back toward the exact graph/dashboard aesthetic this redesign is intended to replace.

### Full Three.js / React Three Fiber

Do not begin with a fully 3D room. React Three Fiber is capable, but its own performance guidance notes the cost of continuous WebGL rendering and the need for deliberate performance optimization. Halyard does not need free-camera 3D, physically correct lighting, or a game-engine interaction model to make the room memorable.

A high-quality 2.5D/isometric Pixi scene is the preferred first production architecture.

Revisit R3F only if a later prototype proves a specific UX benefit that cannot be achieved in PixiJS and maintains laptop/mobile accessibility and battery performance.

### Canvas-only application UI

The Floor scene may be canvas/WebGL, but the application must not become canvas-only. Primary controls, drawers, artifact details, text, keyboard focus, and semantic state remain in DOM/React.

---

# 2. Scene architecture

Create a dedicated package or module boundary rather than placing scene logic directly in page components.

Suggested structure:

```text
apps/web/src/components/floor-v2/
  LiveFloor.tsx
  FloorScene.tsx
  FloorShell.tsx
  FloorInspector.tsx
  FloorTimeline.tsx
  FloorMonitor.tsx
  FloorMobile.tsx
  scene/
    model.ts
    projectProduction.ts
    layout.ts
    navigation.ts
    cues.ts
    transitions.ts
    hitTargets.ts
    camera.ts
    zSort.ts
    assets.ts
  actors/
    RobotActor.tsx
    ArtifactActor.tsx
    DeskActor.tsx
    ProgramMonitorActor.tsx
    LightingActor.tsx
  accessibility/
    FloorAccessibleOverlay.tsx
    FloorReducedMotion.tsx
```

Do not let the Pixi component tree query the database or understand job-table details.

The data boundary should be:

```text
ProductionSnapshot
        ↓
projectProduction(snapshot)
        ↓
FloorSceneModel
        ↓
compare(previous, next)
        ↓
SceneCue[]
        ↓
visual animation
```

---

# 3. Production snapshot contract

The UI should consume a stable read model rather than reconstructing production truth from arbitrary log lines.

A production snapshot should contain, at minimum:

```ts
interface ProductionSnapshot {
  productionId: string;
  product: ProductSummary;
  title: string;
  startedAt: string;
  status: ProductionStatus;
  costUsd: number | null;
  stages: StageSnapshot[];
  artifacts: ArtifactSnapshot[];
  variants: VariantSnapshot[];
  recentEvents: ProductionEvent[];
  finalCandidates: CandidateSnapshot[];
}
```

Each stage should expose authoritative state, timing, attempt count, upstream/downstream relationships, and artifact ids.

Each artifact should expose its producer stage, consumer stage ids where known, type, preview metadata, created time, and version.

The scene engine should not infer `working` simply because the latest message names a desk.

---

# 4. Scene model

The projected scene should be explicit and testable.

```ts
interface FloorSceneModel {
  layoutPreset: FloorLayoutPreset;
  desks: FloorDeskModel[];
  robots: FloorRobotModel[];
  artifacts: FloorArtifactModel[];
  monitor: FloorMonitorModel;
  lanes: FloorLane[];
  selectedId: string | null;
}
```

## Desks

A desk owns:

- fixed room anchor;
- visual footprint;
- hit area;
- label anchor;
- role color/accent;
- state lamp;
- local robot home position;
- artifact inbox/outbox positions;
- reserved walking exclusion area.

## Robots

A robot owns:

- desk assignment;
- current lifecycle-derived animation state;
- current position;
- planned route if moving;
- z-index/y-sort position;
- selected/focused state;
- current artifact if carrying one.

## Artifacts

Artifacts are not decorative particles. They represent real saved outputs.

Each type gets a recognizable silhouette:

- research/facts: stacked source cards;
- strategy: clipboard;
- script: paper/page;
- storyboard: filmstrip;
- product capture: mini phone/video tile;
- generated/stock visual: thumbnail tile;
- voice: waveform/reel;
- render: film slate/preview frame;
- QA defect: colored review ticket;
- final candidate: framed post card.

---

# 5. Layout system

Do not position desks with ad-hoc percentages inside JSX.

Create named layout presets:

- `wide`: >= 1440px content viewport;
- `standard`: 1180–1439px;
- `compact`: 960–1179px;
- `mobile`: < 960px uses a different corridor/bay experience.

Each desktop preset defines:

- scene design dimensions;
- desk bounding boxes;
- central table bounds;
- monitor bounds;
- walkable navigation nodes;
- artifact travel lanes;
- inspector reserved area.

The renderer scales a coherent design viewport to the available scene rectangle, but **does not scale below legible interaction sizes**. When space is insufficient, switch presets or group desks.

## Recommended desktop scene proportions

At a normal 1440px laptop/desktop window:

- application left rail: approximately 232–248px;
- live-page content padding: 24px;
- persistent inspector: 320–360px when open;
- room scene: remaining width, preferably >= 820px;
- room scene height: approximately 600–680px depending viewport height;
- desk clickable footprint: at least ~104×72 visual px in scene space;
- robot visual body: approximately 42–56px high at normal presentation size;
- robot/desk click target: >= 48×48 CSS px after projection;
- labels: DOM overlay or high-resolution Pixi text, visually equivalent to >= 13px normal UI text.

At 1280px, do not make the room microscopic. Use compact placement and close/collapse the inspector when nothing is selected.

---

# 6. Isometric/2.5D visual construction

Use a consistent isometric projection or shallow 2.5D perspective rather than mixing flat top-down and perspective objects.

Recommended visual layers:

```text
0 room floor / material
1 rugs / floor lanes / static marks
2 back walls / large set dressing
3 workstation bases
4 chairs / equipment / table props
5 robots and artifacts, Y-sorted
6 lamps / glows / screen effects
7 selection rings / handoff highlights
8 transient particles / notification pips
9 DOM labels/inspector overlays
```

Use restrained parallax on room set dressing when the pointer moves if it remains subtle and has no effect under reduced motion.

Lighting should communicate stage state:

- inactive: low neutral desk pool;
- queued: cool low-intensity lamp;
- working: brighter desk lamp/accent;
- waiting dependency: low amber pulse;
- retry: amber signal;
- blocked/failed: stable signal state, not flashing alarm effects;
- complete: lamp settles to low green/clear state.

---

# 7. Robot animation system

## Character visual states

Every robot needs the same base animation vocabulary:

```text
idle
turn_to_work
working_loop
walk
carry_walk
receive
inspect
handoff
waiting
retry
blocked
complete
```

Role-specific working loops add personality:

- Scout: scans sources / magnifier HUD;
- Strategy: arranges cards on a board;
- Writer: page/keyboard motion;
- Product Expert: inspects product screen;
- Visuals: shifts storyboard frames;
- Asset/Capture: camera/phone preview;
- Voice/Sound: waveform/headphones;
- Editor: timeline scrub/cut;
- Platform: swaps destination cards;
- Critic: watches monitor and marks ticket.

Animations should be 0.5–2.5s loops, subtle enough to remain pleasant during a several-minute production.

## Rive option

If Rive is selected after prototyping:

- create one shared Halyard robot rig design;
- use role skins/accessories rather than ten unrelated characters;
- expose state-machine inputs such as `working`, `walking`, `carrying`, `blocked`, `selected`, `role`;
- keep application workflow state outside the `.riv` file;
- isolate Rive wrapper components as recommended by the Rive React runtime docs;
- benchmark simultaneous robot instances before committing.

If multiple Rive WebGL canvases are too expensive, use Rive as the authoring source and implement the in-scene robots using Pixi-native animated sprites/vector pieces, or render one consolidated Rive scene instead of many canvases.

The choice must be made by measured prototype results, not aesthetic preference alone.

---

# 8. Navigation and collision avoidance

Do not let robots tween directly from desk A to desk B through furniture.

Create a room navigation graph:

```ts
interface NavNode {
  id: string;
  x: number;
  y: number;
  neighbors: string[];
}
```

Desks connect to designated corridor nodes. The central table has explicit approach points.

A handoff route is generated from this nav graph.

For the initial implementation, fixed graph routes are preferable to general game-engine pathfinding. The room has known geometry; predictable paths are easier to art-direct and test.

If two robots would occupy the same narrow segment simultaneously:

- reserve the segment briefly;
- delay only the visual traversal;
- never delay backend state or stage completion;
- artifact truth appears immediately in the inspector/feed even if the animation waits 300ms for visual clarity.

No moving object should cover another desk's click target.

---

# 9. Handoff animation contract

Create cues by comparing snapshots.

Example:

```ts
type SceneCue =
  | { type: 'stage_started'; stageId: string }
  | { type: 'stage_completed'; stageId: string }
  | { type: 'artifact_created'; artifactId: string }
  | { type: 'artifact_handoff'; artifactId: string; from: string; to: string }
  | { type: 'stage_retry'; stageId: string; attempt: number }
  | { type: 'stage_blocked'; stageId: string }
  | { type: 'candidate_ready'; candidateId: string };
```

A handoff animation is allowed only when the source artifact and consumer relationship exist in the production snapshot.

Animation sequence:

1. producer desk signals output ready;
2. artifact appears at outbox;
3. robot receives/carries it or artifact travels along a designed lane depending role;
4. destination desk previews an incoming state;
5. arrival animation;
6. consumer robot acknowledges;
7. downstream working state begins if already true in data;
8. artifact remains inspectable after the animation ends.

If the page was hidden and returns after several handoffs happened, do not replay minutes of history. Reconstruct final scene state, then optionally summarize missed events in the feed.

---

# 10. Interaction and hit targets

PixiJS v8 supports pointer/touch interaction through its federated event system. Use `eventMode='static'` for stationary desks and `dynamic` only for moving interactive objects that need it.

Every scene interaction also needs an accessible DOM equivalent.

Requirements:

- desk/robot visual target >= 48×48 CSS px where possible;
- artifact target >= 40×40 CSS px, with a larger transparent hit area if the visual token is smaller;
- explicit `hitArea` rather than relying on irregular visible bounds;
- hover/focus highlight;
- click/tap opens the same inspector;
- keyboard tab order follows production logic, not geometric render order;
- `Enter`/`Space` selects;
- Escape closes inspector;
- screen-reader label includes role, state and current task.

PixiJS accessibility may be used to align DOM overlays to scene objects, but Halyard may also maintain its own transparent DOM interaction layer if that gives more reliable Next/React behavior. Do not ship inaccessible custom canvas targets.

---

# 11. Motion for DOM UI

Use `motion/react` outside the Pixi scene for:

- inspector opening/closing;
- selected artifact expanding into preview;
- completion preview replacing the monitor summary;
- mobile bottom sheet;
- changing active-stage chips;
- cost/time number transitions;
- feed insertions;
- review transition from Floor to finished post.

Use `layout`/`layoutId` for shared-element transitions where the same artifact moves from a compact card to a full inspector preview.

Prefer transform/opacity animation over layout-thrashing width/top/left animation.

Respect `useReducedMotion` and application-level reduced-motion preference.

---

# 12. Real-time transport

Do not couple the visual redesign to a risky backend transport rewrite.

Preferred implementation order:

1. create one server read model returning `ProductionSnapshot`;
2. use robust 1–2 second polling with visibility-aware pause and immediate refresh after operator actions;
3. measure latency/load;
4. move to SSE or an existing realtime transport only if it materially improves experience and is reliable in Halyard's deployment environment.

Animations interpolate between snapshots, so polling can still feel continuous without inventing activity.

The scene should never stall an authoritative state update simply to finish an animation.

---

# 13. Performance budget

Set explicit budgets and measure them.

Target at 1440×900 on an ordinary modern laptop:

- scene responds to pointer input without visible lag;
- animation target 60fps during handoffs;
- acceptable transient floor >= 45fps under simultaneous active robot states;
- idle scene should consume minimal CPU/GPU;
- do not animate continuous high-cost filters while nothing changes;
- suspend nonessential ticker work when `document.hidden`;
- lazy-load heavy final media previews;
- limit large WebGL textures;
- reuse textures/robot assets;
- avoid one independent animation loop per robot.

Run a mobile performance profile on a representative iPhone-size viewport/device class. The mobile composition should use fewer simultaneous decorative effects.

If Rive is used, benchmark at least:

- 1 robot;
- 6 active robot instances;
- 10 visible robot instances;
- scene + video preview + open inspector.

If the Rive version cannot sustain the budget, simplify the character runtime rather than compromising the whole app.

---

# 14. Visual effects budget

The Floor should feel premium, not noisy.

Allowed restrained effects:

- soft desk pools/glows;
- monitor emissive glow;
- subtle floor reflections;
- tiny data particles only during a real transfer;
- selection rings;
- focused artifact highlight;
- low-amplitude parallax;
- brief brass trail during a handoff;
- successful final-monitor reveal.

Avoid:

- looping particle fields;
- constant neon pulses;
- confetti on ordinary completion;
- fake terminals full of scrolling text;
- random robot wandering;
- constant sound effects;
- motion that obscures status.

The coolest moments should coincide with real meaningful events.

---

# 15. Sound

The Live Floor is primarily visual. Do not autoplay a game-like soundscape.

Optional UI audio may be offered later behind a user preference:

- extremely subtle handoff tick;
- completion cue;
- blocked/needs-you cue.

Default is off unless product research shows otherwise.

Never mix UI sound with the media review player in a way that compromises content evaluation.

---

# 16. Mobile technical design

Below the desktop scene breakpoint, do not render a scaled-down isometric room as the main interaction.

Use a production corridor:

- larger robot bay cards;
- 2-column tablet / 1-column phone;
- animated artifact travel between adjacent visible bays;
- sticky production header;
- bottom-sheet inspector;
- mini program monitor;
- expandable `View room` decorative overview only if useful.

The same `ProductionSnapshot` and scene projection drive both layouts.

---

# 17. Storybook / isolated scene laboratory

Create an isolated development surface for the Floor before integrating it into production routes.

It must support fixture-driven states:

- idle;
- research only;
- three stages in parallel;
- artifact handoff;
- retry;
- blocked;
- correction loop;
- all platforms branching;
- completion;
- long labels;
- high artifact count.

This surface is where animation timing, collision, hit targets and visual hierarchy are tuned without spending API money or mutating production jobs.

Fixtures must use the same `ProductionSnapshot` contract as production.

---

# 18. Implementation sequence

## FL-1 — Data model/read model

Build/finish production grouping, stage lifecycle and `ProductionSnapshot`.

## FL-2 — Static room

Build the Pixi room with final layout presets, desks, labels, monitor, collision-safe lanes and click targets. No character animation yet.

## FL-3 — Interaction/accessibility

Desk/robot/artifact selection, inspector, DOM accessibility mirror, keyboard and touch.

## FL-4 — Robot visual system

Build one robot rig and role variants. Test Pixi-native vs Rive-backed implementation and choose from measured results.

## FL-5 — Lifecycle animation

Working, queued, blocked, retry, completion.

## FL-6 — Real artifact handoffs

Snapshot diff → cue → navigation route → handoff animation → inspectable artifact.

## FL-7 — Parallel work and branching

Multiple active robots and per-platform branches.

## FL-8 — Program monitor

Progressively display real concept/storyboard/assets/audio/render/final candidates.

## FL-9 — Completion/review transition

Finished post appears on Floor; shared-element transition into Review.

## FL-10 — Mobile corridor

Purpose-built mobile representation.

## FL-11 — Polish/performance/accessibility

Performance budget, reduced motion, focus, screen-reader labels, visual regression, lower-power mobile mode.

---

# 19. Acceptance tests specific to the technical design

A release candidate must prove:

- no room state is driven by demo timers in production;
- static desk targets remain clickable while robots/artifacts animate nearby;
- at least three simultaneous active stages remain visually legible;
- a real handoff follows a collision-safe path;
- retry does not duplicate an old handoff;
- returning after backgrounding reconstructs current state without replaying stale animation;
- mobile does not render unreadable miniature desk labels;
- keyboard can reach every meaningful stage/artifact;
- reduced-motion has no travel animation and loses no information;
- room remains usable while a finished video preview is loaded;
- visual state and inspector state agree with the same production snapshot;
- performance budgets are measured and recorded rather than assumed.

---

# 20. Framework references used for this decision

- Motion for React: `https://motion.dev/docs/react`
- Motion layout animation: `https://motion.dev/docs/react-layout-animations`
- PixiJS v8: `https://pixijs.com/8.x/guides/`
- PixiJS events: `https://pixijs.com/8.x/guides/components/events`
- PixiJS accessibility: `https://pixijs.com/8.x/guides/components/accessibility`
- PixiJS React: `https://react.pixijs.io/getting-started/`
- Rive React runtime: `https://rive.app/docs/runtimes/react/react`
- Rive state machines: `https://rive.app/docs/editor/state-machine/state-machine`
- React Three Fiber performance reference: `https://r3f.docs.pmnd.rs/advanced/scaling-performance`

Research these again at implementation time for current APIs/version constraints. Do not copy example versions blindly into package.json without checking the repository's React/Next compatibility.