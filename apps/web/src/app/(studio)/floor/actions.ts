'use server';

/**
 * §387. Waking the desks as you choose.
 *
 * The build plan called this "brief preview": running `planProduction` on the
 * current selections *before* anything is enqueued, so an operator can see
 * which desks their choices will wake. It is the thing that makes the brief a
 * room rather than a form — you change "short video" to "caption" and the sound
 * booth goes dark in front of you.
 *
 * A server action rather than a client-side call, because `planProduction`
 * lives behind the `@halyard/core` barrel and the barrel pulls `node:crypto`.
 * Importing it into a client component builds, typechecks, passes every test
 * and then fails at render — §-gotcha-10, which this screen has already hit
 * once through `desks.ts`.
 */
import { planProduction, requiresCitation, POST_FORMAT_CATALOG } from '@halyard/core';
import { requireOperator } from '@/lib/auth';
import { DESKS, deskForStage } from '@/components/studio/desks';

export interface BriefPreview {
  /** Desk id → whether this brief wakes it, and why. */
  desks: Array<{ id: string; woken: boolean; because: string }>;
  /** How many desks will work on this. */
  woken: number;
  total: number;
}

export async function previewBrief(input: {
  media: 'video' | 'text' | 'carousel' | 'image';
  channel: string;
  format?: string;
  needsCapture?: boolean;
}): Promise<BriefPreview> {
  await requireOperator();

  const format = input.format ? POST_FORMAT_CATALOG[input.format as never] : undefined;

  const plan = planProduction({
    channel: input.channel as never,
    media: input.media,
    sourced: format ? requiresCitation(format) : false,
    needsCapture: input.needsCapture === true,
  });

  /*
   * A desk is woken if *any* of its stages run. The reason shown is the plan's
   * own `because` — the same sentence the run will log — rather than one
   * written here, so the preview and the run cannot say different things.
   */
  const running = new Map<string, string>();
  for (const stage of plan.stages) {
    const desk = deskForStage(stage.stage);
    if (desk && !running.has(desk.id)) running.set(desk.id, stage.because);
  }
  const skipped = new Map<string, string>();
  for (const stage of plan.skipped) {
    const desk = deskForStage(stage.stage);
    if (desk && !skipped.has(desk.id)) skipped.set(desk.id, stage.because);
  }

  const desks = DESKS.map((desk) => {
    const because = running.get(desk.id);
    if (because) return { id: desk.id, woken: true, because };
    return {
      id: desk.id,
      woken: false,
      /*
       * "Not needed" and "nobody told me" look identical to an operator, and
       * `planProduction` distinguishes them — so the skip reason is shown
       * verbatim where there is one. §345.
       */
      because: skipped.get(desk.id) ?? 'nothing in this brief needs this desk',
    };
  });

  return { desks, woken: desks.filter((d) => d.woken).length, total: DESKS.length };
}
