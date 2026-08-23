/**
 * The self-correction controller. §165.
 *
 * `review_media` used to end a failing item's life: it wrote `status = 'failed'`
 * and a person dealt with it. This job runs instead, and tries to fix the thing
 * before asking anyone to look at it.
 *
 * ## Where this sits
 *
 * It orchestrates the pipeline that already exists; it does not duplicate any
 * of it. Nothing here synthesises, renders or reviews — it decides what the
 * smallest useful change is, applies it, invalidates exactly the gates that
 * change can reach, and re-enters the existing chain at the earliest stage that
 * has to run again. `tts` already releases the renders it gates and `render`
 * already enqueues `review_media`, so re-entering at the right point is enough
 * and the chain does the rest — including enqueuing this job again with the new
 * verdict.
 *
 * ```
 * generate → tts → render → review_media → [correct_content] ⤴
 *                                        └→ pending_approval
 * ```
 *
 * ## What decides what
 *
 * The gates perceive. `decide()` — a pure function with no I/O and no model —
 * chooses. This file is the part that reads and writes, and it deliberately
 * holds no policy: every "should we" question is answered in
 * `packages/core/src/correction/`, where it can be tested without a database.
 *
 * A model is used in exactly two places, both of them *writing* rather than
 * judging: revising copy and rewriting a narration script. Neither is asked
 * whether a gate really failed, and neither can mark its own output verified —
 * the deterministic gates re-run over whatever comes back.
 *
 * ## What it never does
 *
 * It does not approve, publish, or move an item past the approval boundary. A
 * fully passing artifact still lands in `pending_approval` exactly as it would
 * have without this loop. The loop improves the artifact; it does not authorise
 * anything.
 */
import {
  ACTION_SCOPE,
  MAX_CORRECTIONS,
  MAX_CORRECTION_SPEND_USD,
  acceptCorrection,
  assertScope,
  bestIteration,
  decide,
  defectsFrom,
  gatesInvalidatedBy,
  invalidateGates,
  policyFor,
  type Component,
  type Decision,
  type GateName,
  type GateResult,
  type IterationRecord,
  type IterationSnapshot,
  createLlmClient,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';
import { applyCorrection } from '../correction/apply.js';
import { reviseCopy, rewriteVoScript } from '../correction/rewrite.js';

import { recordingClient } from '../agentRuns.js';

interface ItemRow {
  id: string;
  product_id: string;
  platform: string;
  format: string;
  body: string;
  status: string;
  vo_asset_id: string | null;
  claims: Array<{ source?: string }> | null;
  qc_results: {
    gates?: GateResult[];
    audio?: { captions?: unknown[] } | null;
  } | null;
}

interface IterationRow {
  iteration: number;
  gates: GateResult[];
  defects: unknown[];
  changed: string[];
  action: string | null;
  cost_usd: string;
  snapshot: IterationSnapshot;
  created_at: string;
}

/**
 * Which gates this item's format genuinely requires.
 *
 * The same question `runAllGates` asks through `requires`, and for the same
 * reason: a skipped gate is not a passed gate, so an item that needs a visual
 * verdict and does not have one must not read as correctable-and-fine.
 */
function requiredGates(format: string): GateName[] {
  const base: GateName[] = ['copy'];
  if (format === 'video') return [...base, 'audio', 'visual', 'coherence'];
  if (format === 'image' || format === 'carousel' || format === 'pin' || format === 'story') {
    return [...base, 'visual'];
  }
  return base;
}

/** What the regression check reads. Small on purpose — see `regression.ts`. */
function snapshotOf(item: ItemRow, beatCount: number | null): IterationSnapshot {
  return {
    gates: item.qc_results?.gates ?? [],
    evidencePaths: (item.claims ?? [])
      .map((c) => c.source)
      .filter((s): s is string => typeof s === 'string'),
    hasCaptions: Array.isArray(item.qc_results?.audio?.captions)
      ? item.qc_results!.audio!.captions!.length > 0
      : false,
    hasAudio: item.vo_asset_id !== null,
    beatCount,
  };
}

/**
 * What this iteration cost, from telemetry that already exists.
 *
 * Summed over the window since the previous iteration was recorded. It is a
 * window attribution rather than a per-item ledger — `agent_runs.trigger_ref`
 * holds a job id, not a content item — and the column comment says so, because
 * a number that looks exact and is not is worse than one that admits its
 * method. Building a second cost system to get a better number was explicitly
 * out of scope; reusing this one was the point.
 */
async function costSince(ctx: HandlerContext, since: string | null): Promise<number> {
  const { rows } = await ctx.pool.query<{ total: string | null }>(
    `select coalesce(sum(cost_usd), 0)::text as total
       from agent_runs
      where started_at > coalesce($1::timestamptz, now() - interval '1 hour')`,
    [since],
  );
  return Number(rows[0]?.total ?? 0);
}

async function beatCountOf(ctx: HandlerContext, contentItemId: string): Promise<number | null> {
  const { rows } = await ctx.pool.query<{ beats: unknown }>(
    `select input_props->'beats' as beats from renders
      where content_item_id = $1 and quality = 'final'
      order by created_at limit 1`,
    [contentItemId],
  );
  const beats = rows[0]?.beats;
  return Array.isArray(beats) ? beats.length : null;
}


/**
 * Only one controller may work an item at a time.
 *
 * The queue is the first line: `review_media` enqueues with a stable dedupe key
 * and `jobs_dedupe_idx` is unique while a job is queued *or running*, so two
 * controllers for one item cannot normally coexist. This is the second line,
 * for a job inserted by a path that did not set that key — an operator running
 * SQL, a future caller, a manual replay.
 *
 * It matters because the unique `(content_item_id, iteration)` constraint
 * protects *persistence*, not *spend*: two controllers would both clear
 * `vo_asset_id`, both requeue renders and both pay for a synthesis, and only
 * then would one of them lose the insert. The claim has to come before the
 * side effects, which is the same rule §108 applies to signals.
 *
 * A session-scoped advisory lock on a dedicated client, rather than
 * `for update` inside a transaction: a correction can include a model call
 * running for tens of seconds, and holding a transaction open across it would
 * pin a connection in an idle-in-transaction state. Postgres releases the lock
 * if the connection dies, so there is no way to leave an item permanently
 * claimed. A single lock with no second lock beneath it cannot deadlock.
 */
async function withItemClaim<T>(
  ctx: HandlerContext,
  contentItemId: string,
  run: () => Promise<T>,
): Promise<T | 'busy'> {
  const key = `correct:${contentItemId}`;
  const client = await ctx.pool.connect();
  try {
    const { rows } = await client.query<{ got: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)) as got',
      [key],
    );
    if (!rows[0]?.got) return 'busy';

    try {
      return await run();
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [key]);
    }
  } finally {
    client.release();
  }
}

export async function correctContentHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const contentItemId = String(job.payload.contentItemId ?? '');
  if (!contentItemId) throw new Error('correct_content job has no contentItemId');

  const outcome = await withItemClaim(ctx, contentItemId, () => correctClaimed(job, ctx, contentItemId));
  if (outcome === 'busy') {
    /*
     * Another controller holds this item. Returning cleanly rather than
     * throwing is deliberate: the job did its work — it observed that the item
     * is already being handled — and retrying would only queue a second attempt
     * behind the same lock. Whatever that controller decides will enqueue the
     * next step.
     */
    ctx.log('correction skipped, another controller holds this item', { contentItemId });
  }
}

async function correctClaimed(
  job: Job,
  ctx: HandlerContext,
  contentItemId: string,
): Promise<void> {

  const { rows } = await ctx.pool.query<ItemRow>(
    `select id, product_id, platform, format, body, status, vo_asset_id, claims, qc_results
       from content_items where id = $1`,
    [contentItemId],
  );
  const item = rows[0];
  if (!item) {
    ctx.log('correction skipped, item gone', { contentItemId });
    return;
  }

  /*
   * The approval boundary is upstream of this loop, not downstream.
   *
   * An operator who has approved, rejected or archived an item has made a
   * decision, and a background job that keeps rewriting it afterwards would be
   * overriding a person. §90 and §91 are the same rule arriving from the
   * publish side.
   */
  if (!['draft', 'pending_approval', 'failed'].includes(item.status)) {
    ctx.log('correction skipped, item is past the drafting stage', {
      contentItemId,
      status: item.status,
    });
    return;
  }

  const gates = item.qc_results?.gates ?? [];
  if (gates.length === 0) {
    ctx.log('correction skipped, nothing has been gated yet', { contentItemId });
    return;
  }

  const { rows: historyRows } = await ctx.pool.query<IterationRow>(
    `select iteration, gates, defects, changed, action, cost_usd, snapshot, created_at
       from content_iterations where content_item_id = $1 order by iteration`,
    [contentItemId],
  );

  const beats = await beatCountOf(ctx, contentItemId);
  const snapshot = snapshotOf(item, beats);
  const defects = defectsFrom(gates, policyFor, requiredGates(item.format));

  const previous = historyRows[historyRows.length - 1] ?? null;
  const iteration = previous ? previous.iteration + 1 : 0;
  const cost = await costSince(ctx, previous?.created_at ?? null);

  /*
   * `action` and `changed` describe the correction taken *in response to* this
   * iteration, so they are empty until `decide` picks one. The correction that
   * *produced* this iteration lives on the previous row — which is what makes
   * every row final at insert time and the table append-only.
   */
  const current: IterationRecord = {
    iteration,
    gates,
    defects,
    changed: [],
    action: null,
    costUsd: cost,
    snapshot,
  };

  /*
   * §7. Did the last correction break something it was not supposed to?
   *
   * Judged before deciding what to do next, because a corrected iteration that
   * regressed must not become the base the next correction builds on. When it
   * did regress the controller records that and stops — reverting a partially
   * rebuilt artifact is a bigger operation than this loop should attempt on its
   * own, and a person now has both versions and the reason in front of them.
   */
  if (previous && previous.action) {
    const pending = gatesInvalidatedBy((previous.changed ?? []) as Component[]);

    /*
     * Do not judge a rebuild that has not finished.
     *
     * Found by running this for real: a correction cleared the voiceover so
     * `tts` would produce a new one, the controller ran again before `tts` had,
     * and the regression check saw `hasAudio` go true → false and called it a
     * regression. It is not — it is the correction's own mechanism, observed
     * halfway through.
     *
     * The signal that the rebuild landed is that the gates it invalidated are
     * no longer `skipped`. While any of them still is, there is nothing here
     * worth judging: the artifact is mid-flight, and the next `review_media`
     * will enqueue this job again with a real verdict. Returning is safe
     * because that enqueue is what drives the loop forward, not this run.
     */
    const stillRebuilding = pending.filter((gate) =>
      gates.some((g) => g.gate === gate && g.status === 'skipped'),
    );
    if (stillRebuilding.length > 0) {
      ctx.log('correction waiting for the rebuild', {
        contentItemId,
        iteration,
        pending: stillRebuilding,
      });
      return;
    }

    /*
     * Through `toRecord`, not rebuilt inline. The inline version bypassed the
     * snapshot coercion and crashed the controller on any history row whose
     * snapshot was not the expected shape — permanently, for that item. One
     * conversion, one place. §170.
     */
    const verdict = acceptCorrection(toRecord(previous), current, pending);

    if (!verdict.ok) {
      await recordIteration(ctx, contentItemId, {
        ...current,
        parent: previous.iteration,
        outcome: 'rejected_regression',
        reason: `The correction cleared its target but introduced ${verdict.regressions.length} regression(s).`,
        regressions: verdict.regressions,
        invalidated: [],
        body: item.body,
      });
      await escalate(ctx, contentItemId, {
        reason: 'A correction introduced a regression.',
        unresolved: verdict.regressions.map((r) => r.message),
        keep: bestIteration([...toRecords(historyRows), current], requiredGates(item.format)),
      });
      return;
    }
  }

  const decision = decide({
    history: [...toRecords(historyRows), current],
    requires: requiredGates(item.format),
    maxCorrections: MAX_CORRECTIONS,
    maxSpendUsd: MAX_CORRECTION_SPEND_USD,
  });

  await route(ctx, job, [...toRecords(historyRows), current], item, current, previous?.iteration ?? null, decision);
}

function toRecord(row: IterationRow): IterationRecord {
  return {
    iteration: row.iteration,
    gates: row.gates,
    defects: (row.defects ?? []) as IterationRecord['defects'],
    changed: (row.changed ?? []) as Component[],
    action: row.action as IterationRecord['action'],
    costUsd: Number(row.cost_usd),
    /*
     * Coerced, not trusted. `snapshot` is jsonb: a row written by an earlier
     * version, or by hand during an incident, can be `{}` — and the regression
     * check reads `snapshot.gates.map(...)`, so a malformed row crashes the
     * controller for that item permanently. A missing snapshot means "nothing
     * known about that iteration", which compares as no regression rather than
     * as an exception. §170.
     */
    snapshot: {
      gates: Array.isArray(row.snapshot?.gates) ? row.snapshot.gates : [],
      evidencePaths: Array.isArray(row.snapshot?.evidencePaths) ? row.snapshot.evidencePaths : [],
      hasCaptions: Boolean(row.snapshot?.hasCaptions),
      hasAudio: Boolean(row.snapshot?.hasAudio),
      beatCount: typeof row.snapshot?.beatCount === 'number' ? row.snapshot.beatCount : null,
    },
  };
}

function toRecords(rows: IterationRow[]): IterationRecord[] {
  return rows.map(toRecord);
}

async function route(
  ctx: HandlerContext,
  job: Job,
  history: IterationRecord[],
  item: ItemRow,
  current: IterationRecord,
  parent: number | null,
  decision: Decision,
): Promise<void> {
  switch (decision.kind) {
    case 'accept': {
      /*
       * Back to `pending_approval`, and no further. It is not approved here,
       * and there is deliberately no code path in this file that could.
       *
       * §170. Both states the loop can leave an item in, not just `failed`.
       *
       * `review_media` sets a failing item to `failed`, and the *correct*
       * branch below moves it to `draft` while a rebuild is in flight. So an
       * item that was corrected and then accepted arrives here as `draft`, and
       * the original `where status = 'failed'` silently matched nothing — the
       * item stayed in `draft`, out of the approval queue, with a full history
       * saying it had passed. Found the first time this path ever executed end
       * to end, which is exactly the sort of defect only a real run produces.
       *
       * Promoting from `draft` is narrowed to items this loop actually put
       * there: an operator's own draft that happens to get reviewed must not be
       * pushed into the queue behind their back. A prior `corrected` iteration
       * is the evidence that the transition was ours.
       */
      const ours = await ctx.pool.query<{ n: string }>(
        `select count(*) as n from content_iterations
          where content_item_id = $1 and outcome = 'corrected'`,
        [item.id],
      );
      const correctedByUs = Number(ours.rows[0]?.n ?? 0) > 0;

      await ctx.pool.query(
        `update content_items set status = 'pending_approval'
          where id = $1 and (status = 'failed' or ($2::boolean and status = 'draft'))`,
        [item.id, correctedByUs],
      );
      await recordIteration(ctx, item.id, {
        ...current,
        parent,
        outcome: 'accepted',
        reason: decision.reason,
        regressions: [],
        invalidated: [],
        body: item.body,
      });
      ctx.log('correction accepted', {
        contentItemId: item.id,
        iteration: current.iteration,
        kept: decision.iteration,
        reason: decision.reason,
      });
      return;
    }

    case 'escalate': {
      await recordIteration(ctx, item.id, {
        ...current,
        parent,
        outcome: 'escalated',
        reason: decision.reason,
        regressions: [],
        invalidated: [],
        body: item.body,
      });
      await escalate(ctx, item.id, {
        reason: decision.reason,
        unresolved: decision.unresolved,
        keep: null,
      });
      return;
    }

    case 'exhausted': {
      await recordIteration(ctx, item.id, {
        ...current,
        parent,
        outcome: 'exhausted',
        reason: decision.reason,
        regressions: [],
        invalidated: [],
        body: item.body,
      });
      await escalate(ctx, item.id, {
        reason: decision.reason,
        unresolved: decision.defects.map((d) => `${d.rule}: ${d.observation}`),
        keep: null,
        attempted: decision.attempted,
      });
      return;
    }

    case 'correct': {
      const request = {
        contentItemId: item.id,
        action: decision.action,
        defects: decision.defects,
        doNotRegress: decision.doNotRegress,
      };

      /*
       * The two model-backed corrections are dispatched here rather than inside
       * `applyCorrection`, because they need an instrumented client and that
       * client has to be created per job so its spend lands in `agent_runs`
       * against this job. Every other applier is deterministic and needs
       * nothing but the pool.
       */
      const llm = () =>
        recordingClient(ctx.pool, createLlmClient(), { trigger: 'job', triggerRef: job.id });

      /*
       * §8C. A provider that will not answer is not a correctable defect.
       *
       * Found by running this for real: the Anthropic balance ran out
       * mid-correction, `writeVoScript` threw, and the job burned all three
       * attempts and died — leaving the item in `failed` with no iteration
       * recorded and nobody told why. Retrying was pointless: every attempt
       * bought the same 400.
       *
       * A provider failure escalates on the first occurrence. The distinction
       * that matters is that this is a failure of the *loop*, not of the
       * artifact, so nothing about the item is rewritten or blamed for it.
       */
      let outcome: Awaited<ReturnType<typeof applyCorrection>>;
      try {
        outcome =
          decision.action === 'revise_copy' || decision.action === 'reground_claims'
            ? await reviseCopy(ctx, llm(), request)
            : decision.action === 'rewrite_vo_script'
              ? await rewriteVoScript(ctx, llm(), request)
              : await applyCorrection(ctx, request);
      } catch (err) {
        const message = (err as Error).message.slice(0, 300);
        await recordIteration(ctx, item.id, {
          ...current,
          parent,
          outcome: 'escalated',
          reason: `${decision.action} could not run: the provider failed.`,
          regressions: [],
          invalidated: [],
          body: item.body,
          note: message,
        });
        await escalate(ctx, item.id, {
          reason: `A provider failed while applying ${decision.action}, so the correction could not be attempted.`,
          unresolved: [
            message,
            'This is a failure of the correction loop, not of the content. Nothing about the item was changed.',
          ],
          keep: bestIteration(history, requiredGates(item.format)),
        });
        return;
      }

      if (outcome.escalate || outcome.changed.length === 0) {
        await recordIteration(ctx, item.id, {
          ...current,
          parent,
          outcome: 'escalated',
          reason: outcome.escalate ?? 'The correction changed nothing.',
          regressions: [],
          invalidated: [],
          body: item.body,
        });
        await escalate(ctx, item.id, {
          reason: `${decision.action} could not be applied.`,
          unresolved: [outcome.escalate ?? 'The correction changed nothing.'],
          keep: null,
        });
        return;
      }

      /*
       * §4. The scope check, on what the applier really wrote.
       *
       * Declaring that `resynthesise_voiceover` must not touch the copy is only
       * worth anything if something checks. An applier that overstepped is a
       * bug, and it is caught here rather than discovered later in a diff
       * nobody reads.
       */
      const scope = assertScope(decision.action, outcome.changed);
      if (!scope.ok) {
        await escalate(ctx, item.id, {
          reason: 'A correction exceeded its permitted scope and was stopped.',
          unresolved: [scope.violation, `Permitted: ${ACTION_SCOPE[decision.action].may.join(', ') || 'nothing'}`],
          keep: null,
        });
        throw new Error(`correction scope violation: ${scope.violation}`);
      }

      /*
       * §5. Invalidate exactly what the change can reach — computed from what
       * was *actually* written, not from what the action was allowed to write.
       * A copy revision that left the narration alone keeps its audio verdict;
       * one that rewrote the script does not.
       */
      const invalidated = gatesInvalidatedBy(outcome.changed);
      const nextGates = invalidateGates(current.gates, invalidated);

      await ctx.pool.query(
        `update content_items
            set qc_results = coalesce(qc_results, '{}'::jsonb) || $2::jsonb,
                status = case when status = 'failed' then 'draft' else status end
          where id = $1`,
        [
          item.id,
          JSON.stringify({
            gates: nextGates,
            passed: false,
            ranAt: new Date().toISOString(),
          }),
        ],
      );

      await recordIteration(ctx, item.id, {
        ...current,
        parent,
        outcome: 'corrected',
        reason: decision.reason,
        action: decision.action,
        changed: outcome.changed,
        regressions: [],
        invalidated,
        body: item.body,
        note: outcome.note,
      });

      await rebuild(ctx, item.id, decision.rebuild);

      ctx.log('correction applied', {
        contentItemId: item.id,
        iteration: current.iteration,
        action: decision.action,
        changed: outcome.changed,
        invalidated,
        rebuild: decision.rebuild,
        note: outcome.note,
      });
      return;
    }
  }
}

/** Re-enter the existing pipeline at the earliest stage that must run again. */
async function rebuild(
  ctx: HandlerContext,
  contentItemId: string,
  stage: 'tts' | 'render' | 'review_media' | 'none',
): Promise<void> {
  if (stage === 'tts') {
    await ctx.enqueue('tts', { contentItemId }, { priority: 45 });
    return;
  }
  if (stage === 'render') {
    const { rows } = await ctx.pool.query<{ id: string }>(
      `select id from renders where content_item_id = $1 and quality = 'final' and status = 'queued'`,
      [contentItemId],
    );
    for (const render of rows) {
      await ctx.enqueue('render', { renderId: render.id }, { priority: 50 });
    }
    return;
  }
  if (stage === 'review_media') {
    await ctx.enqueue('review_media', { contentItemId }, { priority: 40 });
    return;
  }

  /*
   * A copy-only change needs no job — the deterministic gates already re-ran
   * inside `writeDraft`, and nothing about the media moved. The controller runs
   * again immediately so the new verdict is judged rather than left sitting.
   */
  await ctx.enqueue('correct_content', { contentItemId }, { priority: 40 });
}

interface IterationWrite extends IterationRecord {
  parent: number | null;
  outcome: 'generated' | 'corrected' | 'accepted' | 'rejected_regression' | 'escalated' | 'exhausted';
  reason: string;
  regressions: unknown[];
  invalidated: GateName[];
  body: string;
  note?: string;
}

/**
 * Write one iteration, once.
 *
 * The table refuses UPDATE and DELETE, so this is the only shape a write can
 * take — and it is the reason the correction chosen *in response to* an
 * iteration is stored on that iteration's own row rather than on the next one.
 * Each row is final at insert time.
 *
 * `on conflict do nothing` covers the retry case: this job may run twice for
 * the same iteration after a transient failure, and a second insert must not
 * throw against the unique key.
 */
async function recordIteration(
  ctx: HandlerContext,
  contentItemId: string,
  write: IterationWrite,
): Promise<void> {
  await ctx.pool.query(
    `insert into content_iterations
       (content_item_id, iteration, parent_iteration, gates, defects, snapshot,
        action, reason, changed, invalidated, regressions, body, cost_usd, outcome)
     values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
     on conflict (content_item_id, iteration) do nothing`,
    [
      contentItemId,
      write.iteration,
      write.parent,
      JSON.stringify(write.gates),
      JSON.stringify(write.defects),
      JSON.stringify(write.snapshot),
      write.action,
      write.note ? `${write.reason} ${write.note}` : write.reason,
      write.changed,
      write.invalidated,
      JSON.stringify(write.regressions),
      write.body,
      write.costUsd,
      write.outcome,
    ],
  );
}

/**
 * Stop, and tell a person what happened.
 *
 * The item is left where a human works through it, with the whole history
 * queryable. Nothing is deleted and no iteration is rolled back: the operator
 * gets both versions and the reason, which is more useful than a tidy revert.
 */
async function escalate(
  ctx: HandlerContext,
  contentItemId: string,
  detail: {
    reason: string;
    unresolved: string[];
    keep: IterationRecord | null;
    attempted?: Array<{ iteration: number; action: string; outcome: string }>;
  },
): Promise<void> {
  await ctx.pool.query(
    `update content_items set status = 'failed' where id = $1 and status <> 'failed'`,
    [contentItemId],
  );

  const body = [
    detail.reason,
    '',
    ...detail.unresolved.map((u) => `\u2022 ${u}`),
    ...(detail.attempted && detail.attempted.length > 0
      ? ['', 'Attempted:', ...detail.attempted.map((a) => `\u2022 iteration ${a.iteration}: ${a.action} \u2014 ${a.outcome}`)]
      : []),
    ...(detail.keep ? ['', `Best available: iteration ${detail.keep.iteration}.`] : []),
  ].join('\n');

  /*
   * Deduped per item per day. A correction that stops is worth one message, and
   * an item whose controller runs again after a retry should not produce a
   * second — an operator who has already been told is not helped by being told
   * again.
   */
  await ctx.pool.query(
    `insert into notifications (kind, severity, title, body, dedupe_key)
     values ('correction_stopped', 'warning', $1, $2, $3)
     on conflict (dedupe_key) do nothing`,
    [
      'Halyard stopped correcting an item',
      body,
      `correction_stopped:${contentItemId}:${new Date().toISOString().slice(0, 10)}`,
    ],
  );

  ctx.log('correction stopped', {
    contentItemId,
    reason: detail.reason,
    unresolved: detail.unresolved.length,
  });
}
