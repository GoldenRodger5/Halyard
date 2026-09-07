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
 *
 * ## §556. A stage that runs also records that it ran
 *
 * The event above makes a stage legible on the floor. It does not make it
 * legible to the **Auditor**, which asks a different question — has this agent
 * ever actually run — and answers it from `agent_runs`.
 *
 * Nothing wrote those rows for a stage. `recordingLlmClient` wraps the model
 * client, so an agent is recorded exactly when it calls a model, and the whole
 * director layer decides in code: `music-director`, `sound-director`,
 * `voice-director`, `visual-director`, `story-architect`, `motion-director`,
 * `annotation-director` and `platform-creative-director` had **zero recorded
 * runs between them** while demonstrably running — the music director had
 * selected a bed minutes before the audit that said it never had.
 *
 * So the Auditor reported eight agents as overclaiming, correctly on its own
 * evidence and wrongly about the world, which is worse than either: an audit
 * nobody can trust is an audit nobody reads. This is the governing rule
 * turned on itself — *agents perceive, code decides* means most agents here
 * are code, and the only recorder was attached to the model.
 *
 * Opened as `running`. The poller closes it with the job's own outcome, so a
 * stage never claims to have succeeded before its work has.
 */
import { AGENT_REGISTRY, STAGE_AGENTS, type Stage } from '@halyard/core';
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

  /*
   * §556. The row the Auditor reads. Fire-and-forget on purpose: a stage must
   * not fail because its bookkeeping did, and a missing row is a visible
   * absence rather than a broken piece.
   *
   * `?.` because a pool is not guaranteed. A context without one is normal in
   * tests, and `ctx.pool.query` on an absent pool throws *synchronously* — past
   * the `.catch` entirely — which took ten passing suites down the first time
   * this was written. Bookkeeping that can break the thing it observes is worse
   * than no bookkeeping.
   */
  /*
   * §557. The version the *registry* declares, not a marker of my own.
   *
   * Written first as `agent_version: 'stage'`, which put every run under a
   * version no contract declares — and the Auditor groups evidence by
   * `(agent_id, agent_version)`, so `music-director` had a recorded run and
   * still reported "no record of it ever having run". A row filed under the
   * wrong version is not evidence of the thing that ran.
   *
   * `input_ref.via` is what marks a stage-opened row instead, so the poller can
   * close exactly its own without borrowing a field that means something else.
   */
  const contract = AGENT_REGISTRY.find((a) => a.agentId === agents.owner);

  void ctx.pool
    ?.query(
      `insert into agent_runs
         (agent_id, agent_version, team, trigger, trigger_ref, status, input_ref)
       values ($1, $2, $3, $4, $5, 'running', '{"via":"stage"}'::jsonb)`,
      [
        agents.owner,
        contract?.version ?? '1.0',
        agents.team,
        ctx.jobId ? 'job' : 'unknown',
        ctx.jobId ?? null,
      ],
    )
    .catch(() => undefined);

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
