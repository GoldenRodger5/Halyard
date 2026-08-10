/**
 * Schedule reconciliation. Build pack §3.
 *
 * Runs on a short cron. Every scheduled item whose time has passed gets a
 * decision: publish, wait, reschedule, or expire. Nothing sits silently.
 */
import { decideReschedule, resolveSlot, type ResolvedSlot } from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';

export async function reconcileScheduleHandler(_job: Job, ctx: HandlerContext): Promise<void> {
  const now = new Date();

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
