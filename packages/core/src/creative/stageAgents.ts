/**
 * §367. Which agent owns which stage of a production.
 *
 * `job_events` records what happened during a run and `/make/run/[jobId]`
 * shows it, and it is a flat chronological feed — *"research"*, *"citation
 * checked"*, *"photographic subject"*, *"format filled"* — because nothing in a
 * log line says who produced it. The operator asked to watch the agents work
 * **on their teams**, and the events cannot be grouped into lanes without an
 * author.
 *
 * The obvious repair is to pass an agent id at every `ctx.log` call. There are
 * a couple of hundred of them, and a rule that has to be remembered at two
 * hundred sites is a rule that will be wrong at some of them — which is the
 * shape of every "declared and never executed" bug in this codebase.
 *
 * So the attribution is **structural instead**. A production is already a list
 * of stages (§345), stages already run in a known order, and each stage is
 * already the work of a known agent. Wrapping a stage attributes everything
 * logged inside it, including lines written by code three modules down that has
 * never heard of an agent id.
 *
 * ## Why a stage can name several agents
 *
 * Because some stages genuinely are a collaboration, and flattening that would
 * be a lie of exactly the kind this file exists to remove. `assets` is the
 * photographic-subject agent choosing what to shoot and the visual director
 * deciding how it is treated. The first is the owner — the one a lane is
 * labelled with — and the rest are named so the UI can show the stage as the
 * handoff it is.
 *
 * ## What this is not
 *
 * It is not a guess from the message text. Matching *"citation checked"* to the
 * researcher by keyword would attribute correctly today and silently
 * misattribute the moment somebody reuses the phrase, and a wrong author is
 * worse than none — it is a claim about who did something.
 */
import { STAGES, type Stage } from './productionPlan.js';

export interface StageAgents {
  /** The agent a lane is labelled with. */
  owner: string;
  /** Everyone else who contributes to this stage, in the order they act. */
  alongside: string[];
  /** The team the lane belongs to, from the registry's own vocabulary. */
  team: string;
  /** What this stage is doing, in the operator's words. */
  doing: string;
}

/**
 * The map. Every stage in `STAGES` appears, which a test asserts — a stage
 * added without an owner would silently produce unattributed events, which is
 * the state this replaces.
 */
export const STAGE_AGENTS: Record<Stage, StageAgents> = {
  brief: {
    owner: 'creative-director',
    alongside: ['story-architect'],
    team: 'content',
    doing: 'Deciding what this piece is for and what it has to do',
  },
  research: {
    owner: 'researcher',
    alongside: [],
    team: 'content',
    doing: 'Finding facts and reading the page each one claims to come from',
  },
  write: {
    owner: 'copywriter',
    alongside: ['hook-generator'],
    team: 'content',
    doing: 'Filling the format, and being refused until it does',
  },
  screenplay: {
    owner: 'screenwriter',
    alongside: ['story-architect'],
    team: 'content',
    doing: 'Staging the scenes — what is said, what is shown, and where the beats fall',
  },
  assets: {
    owner: 'photographic-subject',
    alongside: ['visual-director', 'visual-brand'],
    team: 'content',
    doing: 'Choosing what to photograph, and how it should look',
  },
  voice: {
    owner: 'voice-director',
    alongside: ['vo-scriptwriter'],
    team: 'content',
    doing: 'Reading the piece aloud',
  },
  music: {
    owner: 'music-director',
    alongside: ['sound-director'],
    team: 'content',
    doing: 'Choosing a bed that fits, and ducking it under anybody speaking',
  },
  marks: {
    owner: 'annotation-director',
    alongside: ['motion-director'],
    team: 'content',
    doing: 'Deciding where to point, how big, and for how long',
  },
  render: {
    owner: 'motion-director',
    alongside: ['thumbnail-director'],
    team: 'content',
    doing: 'Turning the plan into frames',
  },
  qc: {
    owner: 'creative-critic',
    alongside: ['payoff-verifier'],
    team: 'quality',
    doing: 'Watching it back and refusing what does not hold up',
  },
  caption: {
    owner: 'platform-creative-director',
    alongside: ['copywriter'],
    team: 'content',
    doing: 'Writing the words that sit under it, per platform',
  },
};

/**
 * The lane an event belongs to when nothing claimed it.
 *
 * Named rather than hidden. An unattributed line is a real thing — the poller's
 * own bookkeeping, a scheduler decision, a handler that has not been wrapped
 * yet — and dropping it from the view would lose exactly the messages that
 * explain a run that produced nothing.
 */
export const UNATTRIBUTED: StageAgents = {
  owner: 'system',
  alongside: [],
  team: 'system',
  doing: 'The run itself — claiming, timing, and everything not owned by a stage',
};

export function agentsForStage(stage: string): StageAgents {
  return (STAGE_AGENTS as Record<string, StageAgents>)[stage] ?? UNATTRIBUTED;
}

/** Every stage, in the order productions run them. Re-exported for the UI. */
export const STAGE_ORDER: readonly Stage[] = STAGES;
