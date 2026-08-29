/**
 * Schedule reconciliation. Build pack §3.
 *
 * Runs on a short cron. Every scheduled item whose time has passed gets a
 * decision: publish, wait, reschedule, or expire. Nothing sits silently.
 */
import { decideReschedule, resolveSlot, type ResolvedSlot } from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';

/**
 * §261. How long a claimed row may sit before it is presumed abandoned.
 *
 * Long enough that nothing in flight is touched — the slowest render observed
 * is 69 seconds and a long-form generate run is minutes, not hours — and short
 * enough that an operator is not looking at a stuck queue the next morning.
 */
const ORPHAN_AFTER_HOURS = 2;

export async function reconcileScheduleHandler(_job: Job, ctx: HandlerContext): Promise<void> {
  const now = new Date();

  await sweepOrphans(ctx);

  const { rows } = await ctx.pool.query<{
    id: string;
    product_id: string;
    platform: string;
    status: string;
    scheduled_at: string;
    reschedule_count: number;
    renders_pending: string;
    audience_timezone: string;
  }>(
    `select ci.id, ci.product_id, ci.platform, ci.status, ci.scheduled_at, ci.reschedule_count,
            (select count(*) from renders r
              where r.content_item_id = ci.id and r.status <> 'done') as renders_pending,
            p.audience_timezone
       from content_items ci
       join products p on p.id = ci.product_id
      where ci.scheduled_at is not null
        and ci.scheduled_at <= now()
        and ci.status in ('approved','scheduled','pending_approval','draft')`,
  );

  for (const row of rows) {
    const slots = await ctx.pool.query<{
      name: string;
      window_start: string;
      window_end: string;
      weekdays: number[];
    }>(
      `select name, window_start, window_end, weekdays from slots
        where product_id = $1 and platform = $2 and enabled
        order by window_start`,
      [row.product_id, row.platform],
    );

    const nextSlots: ResolvedSlot[] = [];
    for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
      const day = new Date(now.getTime() + dayOffset * 86_400_000);
      const localDate = day.toISOString().slice(0, 10);
      for (const slot of slots.rows) {
        const resolved = resolveSlot(
          { name: slot.name, windowStart: slot.window_start, windowEnd: slot.window_end, weekdays: slot.weekdays },
          localDate,
          row.audience_timezone,
        );
        if (resolved.startUtc > now) nextSlots.push(resolved);
      }
    }
    nextSlots.sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());

    const outcome = decideReschedule({
      status: row.status,
      scheduledAt: new Date(row.scheduled_at),
      now,
      rescheduleCount: row.reschedule_count,
      rendersComplete: Number(row.renders_pending) === 0,
      nextSlots,
    });

    switch (outcome.action) {
      case 'publish_now':
        await ctx.enqueue(
          'publish',
          { contentItemId: row.id },
          { priority: 10, dedupeKey: `publish:${row.id}` },
        );
        break;

      case 'reschedule':
        await ctx.pool.query(
          `update content_items
              set scheduled_at = $2, reschedule_count = reschedule_count + 1
            where id = $1`,
          [row.id, outcome.to],
        );
        ctx.log('rescheduled', { contentItemId: row.id, to: outcome.to, reason: outcome.reason });
        break;

      case 'expire':
        await ctx.pool.query(
          `update content_items set status = 'expired', reject_reason = $2 where id = $1`,
          [row.id, outcome.reason],
        );
        ctx.log('expired', { contentItemId: row.id, reason: outcome.reason });
        break;

      case 'wait':
        break;
    }
  }
}

/**
 * §261. Rows claimed by a step that died, which nothing else will ever move.
 *
 * Three of these were live at once and each had the same shape: a row marked
 * as in-progress by a stage that then aborted, with no job left pointing at it
 * and no error to explain it. §258 closed the source for the paths it could
 * see; this is the net for the ones it cannot — a worker killed mid-run, a
 * deploy during generation, a retry that abandoned its first attempt's rows.
 *
 * Deliberately conservative: it only touches rows with **no job referencing
 * them at all**, and only after {@link ORPHAN_AFTER_HOURS}. A row something is
 * still working on always has a job, so this cannot race live work.
 *
 * Reported per sweep rather than silently repaired. A steady trickle here is a
 * bug upstream, and a sweeper that quietly cleans up after one is how the
 * upstream bug stays invisible.
 */
async function sweepOrphans(ctx: HandlerContext): Promise<void> {
  /*
   * Renders wait on `tts` to release them (`generate` inserts them without a
   * job on purpose, so a video is never rendered before its audio exists). A
   * render with no job is therefore one whose releasing stage never ran.
   */
  const renders = await ctx.pool.query<{ id: string }>(
    `update renders r
        set status = 'failed',
            error = 'Orphaned: queued with no render job, and the stage that releases it never ran.'
      where r.status = 'queued'
        and r.created_at < now() - ($1 || ' hours')::interval
        and not exists (
          select 1 from jobs j
           where j.payload->>'renderId' = r.id::text
             and j.status in ('queued','running')
        )
      returning r.id`,
    [ORPHAN_AFTER_HOURS],
  );

  /*
   * `generate` claims an idea before spending anything on it (§78/§87), and
   * marks it `used` only once the drafts land. A run that dies in between
   * leaves the idea `selected` forever, so it is never drafted and never
   * re-proposed — the idea is simply lost.
   *
   * Returned to `proposed` rather than `used`: nothing was published from it,
   * so it is still a real candidate. Only when it produced no content item at
   * all, which is what distinguishes an abandoned claim from a completed one.
   */
  const ideas = await ctx.pool.query<{ id: string }>(
    `update ideas i
        set status = 'proposed'
      where i.status = 'selected'
        /* ideas has no updated_at column; age from creation is the
           conservative reading, since an older row is safer to release. */
        and i.created_at < now() - ($1 || ' hours')::interval
        and not exists (select 1 from content_items ci where ci.idea_id = i.id)
        and not exists (
          select 1 from jobs j
           where j.kind = 'generate' and j.status in ('queued','running')
        )
      returning i.id`,
    [ORPHAN_AFTER_HOURS],
  );

  if (renders.rowCount || ideas.rowCount) {
    ctx.log('swept orphaned rows', {
      renders: renders.rowCount ?? 0,
      ideas: ideas.rowCount ?? 0,
      olderThanHours: ORPHAN_AFTER_HOURS,
      note: 'each one is a stage that died without disowning its rows',
    });
  }
}
