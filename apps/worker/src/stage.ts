/**
 * §387. Opening a stage, so that it leaves a trace.
 *
 * `ctx.as('write')` (§367) attributes every line logged inside a stage to that
 * stage. It works, and it has a gap that took the floor screen to expose: a
 * stage that logs nothing produces no events at all, so from the outside it is
 * indistinguishable from a stage that never ran.
 *
 * Seven of the eleven stages in `STAGE_AGENTS` were in that position —
 * `brief`, `caption`, `voice`, `music`, `marks`, `render` and `qc` were
 * declared, owned by named agents, and never passed to `ctx.as` anywhere. Three
 * of the floor's six desks could not have lit up whatever happened.
 *
 * `openStage` is `ctx.as` plus one line saying the stage began. That line is
 * what makes a run legible:
 *
 * - every stage produces at least one event, so a desk lights when its work
 *   starts rather than only if that work happens to log something;
 * - the **handoff** is the order of those events. Two consecutive opens are an
 *   edge, which is what the floor draws as a lit wire. The build plan proposed
 *   storing `from_stage`; it is not needed, because a sequence already encodes
 *   its own transitions and a stored copy is a second source of truth that can
 *   disagree with the first.
 *
 * `stageCoverage.test.ts` asserts every declared stage is opened somewhere.
 */
import { STAGE_AGENTS, type Stage } from '@halyard/core';
import type { HandlerContext } from './poller.js';

/**
 * Open a production stage and return the context scoped to it.
 *
 * ```ts
 * const art = openStage(ctx, 'assets');
 * art.log('photographic subject', { because });   // lands in the art dept lane
 * ```
 *
 * `Stage` rather than `string`, so a typo is a compile error. `ctx.as` takes a
 * string because it is the lower-level primitive; this is the one callers
 * should reach for, and it is the one that cannot be misspelled.
 */
export function openStage(ctx: HandlerContext, stage: Stage): HandlerContext {
  const scoped = ctx.as(stage);
  const agents = STAGE_AGENTS[stage];
  scoped.log('stage opened', {
    /*
     * `doing` and `owner` travel with the event so a reader does not have to
     * join against `STAGE_AGENTS` to say who is up. The floor renders this
     * directly; §367's map stays the source, this is a copy for one event.
     */
    doing: agents.doing,
    owner: agents.owner,
    alongside: agents.alongside,
    team: agents.team,
  });
  return scoped;
}
