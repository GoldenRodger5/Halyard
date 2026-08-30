/**
 * §387. Six desks, and which stage sits at each.
 *
 * The floor is a room with people in it, and a room has a fixed number of
 * places. Eleven stages is the production's own vocabulary (`STAGE_ORDER`); six
 * desks is what a person can hold in their head while watching a run.
 *
 * The grouping is not arbitrary and not a display convenience — it is the
 * team structure `STAGE_AGENTS` already describes. `voice` and `music` are one
 * sound booth because the same two people do both; `assets` and `marks` are the
 * art department for the same reason. Where this file and `STAGE_AGENTS`
 * disagree about who owns a stage, `STAGE_AGENTS` is right and this is wrong.
 *
 * ## Why the positions live here
 *
 * A horseshoe: two desks at the back either side of the wall monitor, two in
 * the middle, two at the front. The speech bubble for a desk is pinned directly
 * above that desk and only one is ever shown, so two bubbles can never collide
 * — which they did, repeatedly, when each was positioned near wherever its
 * pod happened to be.
 */
export interface Desk {
  id: string;
  /** The team, in the registry's own words. */
  team: string;
  /** Who sits here. */
  name: string;
  /**
   * One word, for the phone's map strip.
   *
   * Written rather than derived. Taking the first word of the name gives "The"
   * for The Critic — a label that identifies nothing, which is worse than no
   * label at all.
   */
  short: string;
  /** What they do, in three words. */
  role: string;
  /** The lamp colour for this desk's avatar. */
  tint: string;
  /** Stages that happen at this desk, in production order. */
  stages: string[];
  /** Percentage offsets within the room. */
  at: { left: string; top: string };
  /** Where this desk's bubble sits. Directly above, never beside. */
  bubble: { left: string; top: string };
}

export const DESKS: Desk[] = [
  {
    id: 'research',
    team: 'Content · research',
    name: 'Researcher',
    short: 'Research',
    role: 'Reads the source',
    tint: 'var(--color-holding)',
    stages: ['brief', 'research'],
    at: { left: '3%', top: '31%' },
    bubble: { left: '3%', top: '17%' },
  },
  {
    id: 'writers',
    team: "Content · writers' room",
    name: 'Format Writer',
    short: 'Writing',
    role: 'Fills the shape',
    tint: 'var(--color-brass)',
    stages: ['write', 'screenplay', 'caption'],
    at: { left: '20%', top: '55%' },
    bubble: { left: '20%', top: '41%' },
  },
  {
    id: 'art',
    team: 'Content · art dept',
    name: 'Art Direction',
    short: 'Art',
    role: 'Decides the picture',
    tint: 'var(--color-clear)',
    stages: ['assets', 'marks'],
    at: { left: '66%', top: '31%' },
    /*
     * Clear of the programme monitor, which is centred at 50% and 180px wide.
     * A bubble is the thing you are meant to read; a bubble half behind a
     * monitor is worse than no bubble.
     */
    bubble: { left: '64%', top: '17%' },
  },
  {
    id: 'sound',
    team: 'Content · sound booth',
    name: 'Sound',
    short: 'Sound',
    role: 'Voice and bed',
    tint: 'var(--color-tally)',
    stages: ['voice', 'music'],
    at: { left: '62%', top: '55%' },
    bubble: { left: '55%', top: '41%' },
  },
  {
    id: 'edit',
    team: 'Content · edit bay',
    name: 'Edit',
    short: 'Edit',
    role: 'Plan into frames',
    tint: 'var(--color-brass)',
    stages: ['render'],
    at: { left: '40%', top: '78%' },
    bubble: { left: '40%', top: '64%' },
  },
  {
    id: 'gate',
    team: 'Quality · the gate',
    name: 'The Critic',
    short: 'Critic',
    role: 'Watches it back',
    tint: 'var(--color-holding)',
    stages: ['qc'],
    at: { left: '5%', top: '78%' },
    bubble: { left: '5%', top: '64%' },
  },
];

/** Which desk a stage happens at. Null for a stage nobody owns. */
export function deskForStage(stage: string): Desk | null {
  return DESKS.find((d) => d.stages.includes(stage)) ?? null;
}

/**
 * The wires, as pairs of desks that hand off to each other.
 *
 * Derived from the desk order rather than drawn by hand, so a desk added or
 * moved cannot leave a wire pointing at where it used to be. The handoff is
 * real: stages run in `STAGE_ORDER`, so desk *n* passes to desk *n+1*.
 */
export const WIRES: Array<[string, string]> = DESKS.slice(0, -1).map((d, i) => [
  d.id,
  DESKS[i + 1]!.id,
]);

/*
 * §-gotcha-10. This file deliberately imports nothing from `@halyard/core`.
 *
 * It is reached from `FloorRoom.tsx`, which is a client component, and the core
 * barrel pulls `node:crypto` through `connectors/artifactCache`. Importing
 * `STAGE_ORDER` here to check the stage names typechecks, passes every test and
 * then fails at render with `UnhandledSchemeError` — which is exactly what it
 * did.
 *
 * The check itself is not lost: `desks.test.ts` runs in Node and imports
 * `STAGE_ORDER` there, where it costs nothing.
 */
