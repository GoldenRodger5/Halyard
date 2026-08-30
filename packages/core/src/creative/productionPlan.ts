/**
 * §345. Not one pipeline — several, and something has to say which.
 *
 * `generate.ts` runs one sequence for everything. A caption-only post on X goes
 * through the same handler as a thirty-second TikTok, and the stages that do not
 * apply are skipped by scattered conditions — `if (account.platform ===
 * 'instagram' && enabledTemplates.includes('carousel_6'))`, `if (renderAspect
 * === '16:9')` — each of which is a local answer to a question nobody asked
 * globally: **what kind of thing is being made, and which stages does it need?**
 *
 * The operator put it exactly: an X post with only a caption, an X post with a
 * caption and an image, and an X post with a caption and a video are three
 * different productions that happen to share a destination.
 *
 * ## Why this matters beyond tidiness
 *
 * A caption-only post does not need a screenplay, a voice, a bed, a motif pack
 * or a render — and today it would run the parts of that machinery whose
 * conditions happen to pass, spending money and time on decisions nothing will
 * read. Meanwhile a short video needs *every* stage, and if one is skipped by a
 * condition that was true for a different reason, the omission is silent.
 *
 * A declared plan makes both visible: what will run, in what order, and what
 * each stage needs before it can start.
 */
import type { ChannelId } from '../channels/channels.js';

/** What a piece is made of. Independent of where it is posted. */
export const MEDIA_KINDS = ['text', 'image', 'carousel', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * The stages a production can have, in the only order they make sense in.
 *
 * Ordering is a property of the list, not of each entry: research precedes
 * writing because a writer given no sources invents them (§344), and the
 * screenplay precedes assets because a picture chosen before the scenes exist
 * cannot suit any of them.
 */
export const STAGES = [
  'brief',
  'research',
  'write',
  'screenplay',
  'assets',
  'voice',
  'music',
  'marks',
  'render',
  'qc',
  'caption',
] as const;
export type Stage = (typeof STAGES)[number];

export interface StagePlan {
  stage: Stage;
  /** Why it runs, or why it does not. One line, for an operator. */
  because: string;
}

export interface ProductionPlan {
  channel: ChannelId;
  media: MediaKind;
  stages: StagePlan[];
  skipped: StagePlan[];
}

export interface PlanRequest {
  channel: ChannelId;
  media: MediaKind;
  /** Whether the format's claims need sourcing. */
  sourced: boolean;
  /** Whether this piece is built around a recording of the product. */
  needsCapture?: boolean;
}

/**
 * §345. Which stages this production runs, and why.
 *
 * Every decision is stated rather than implied by a condition somewhere. A
 * stage that does not run says so, because "it did not happen" and "it was not
 * needed" look identical in a log and mean opposite things.
 */
export function planProduction(request: PlanRequest): ProductionPlan {
  const stages: StagePlan[] = [];
  const skipped: StagePlan[] = [];

  const moving = request.media === 'video';
  const visual = request.media !== 'text';

  const add = (stage: Stage, because: string) => stages.push({ stage, because });
  const skip = (stage: Stage, because: string) => skipped.push({ stage, because });

  add('brief', 'every piece needs to know what it is for and who it is for');

  if (request.sourced) {
    add('research', 'the format asserts things about the world, so sources are found before anything is written');
  } else {
    skip('research', 'this format makes no claims about the world that need a source');
  }

  add('write', 'the content itself — the questions, the story, the tips');

  /*
   * A screenplay stages *scenes*. A caption has none, and a single image has
   * one, which a screenplay would describe at more length than the piece.
   */
  if (moving || request.media === 'carousel') {
    add(
      'screenplay',
      request.media === 'carousel'
        ? 'a carousel is a sequence, so the order and the emphasis are staged'
        : 'a video is scenes, and the screenplay is what everything downstream reads',
    );
  } else {
    skip('screenplay', `a ${request.media} piece has no scenes to stage`);
  }

  if (visual) {
    add('assets', 'pictures are chosen per scene, once the scenes exist');
  } else {
    skip('assets', 'a text post has nothing to illustrate');
  }

  if (moving) {
    add('voice', 'read from the scenes, so the voice says what the screen shows');
    add('music', 'scored against the scenes, so the bed is punctuation rather than a level');
    add('marks', 'gestures the screenplay asked for, placed where the frame can locate them');
  } else {
    skip('voice', 'nothing is spoken over a still');
    skip('music', 'nothing to score');
    skip('marks', 'a mark needs a moment, and a still has one');
  }

  if (visual) {
    add('render', 'the file itself');
    add('qc', 'the checks that run on the finished file');
  } else {
    skip('render', 'a text post has no file to render');
    /* The copy gate still runs; it is part of writing, not of media QC. */
    skip('qc', 'media QC checks a file, and there is none');
  }

  add(
    'caption',
    visual
      ? 'written last, because a caption describes the finished piece'
      : 'the caption is the piece',
  );

  return { channel: request.channel, media: request.media, stages, skipped };
}

/**
 * What a stage needs before it may start.
 *
 * Declared so a stage can refuse *at its own boundary* rather than producing
 * something wrong from missing input. The operator's rule: when something
 * fails, find out there — not at the end.
 */
export const STAGE_REQUIRES: Record<Stage, Stage[]> = {
  brief: [],
  research: ['brief'],
  write: ['brief'],
  /* The screenplay stages written content; without it, it would invent it (§340). */
  screenplay: ['write'],
  /* A picture per scene needs the scenes. */
  assets: ['write'],
  /* The voice reads the scenes, not the caption (§344's ordering fault). */
  voice: ['screenplay'],
  music: ['screenplay'],
  marks: ['screenplay'],
  render: ['assets'],
  qc: ['render'],
  /* A caption describes the finished piece. */
  caption: ['write'],
};

export interface StageGate {
  ok: boolean;
  missing: Stage[];
  because: string;
}

/**
 * May this stage start?
 *
 * Checked against what has *actually completed*, so a pipeline cannot run a
 * stage whose input does not exist and discover it three stages later — which
 * is how a voiceover came to be written from a caption instead of from the
 * piece.
 */
export function canStart(stage: Stage, completed: readonly Stage[]): StageGate {
  const missing = (STAGE_REQUIRES[stage] ?? []).filter((need) => !completed.includes(need));
  return {
    ok: missing.length === 0,
    missing,
    because:
      missing.length === 0
        ? `${stage} has everything it needs`
        : `${stage} needs ${missing.join(', ')}, which ${missing.length === 1 ? 'has' : 'have'} not run`,
  };
}
