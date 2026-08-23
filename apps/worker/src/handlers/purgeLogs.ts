/**
 * Applies the operator's retention window, if they have set one.
 *
 * `purge_operational_logs(interval)` has existed since 0035 with no schedule
 * and no number, deliberately: the window is a product and legal decision.
 * This is the mechanism that reaches it without answering that question.
 *
 * `settings.log_retention_days` defaults to null and null means **keep
 * everything** — no deletion, no exception. That is the absence of a policy
 * rather than a policy, and it is the correct default until someone chooses.
 *
 * The function itself decides what is eligible: finished jobs, read
 * notifications, completed agent runs and probes. Live state is never touched
 * and `audit_log` is never deleted — this handler does not restate those rules,
 * it just supplies the window.
 */
import type { Job, HandlerContext } from '../poller.js';

export async function purgeLogsHandler(_job: Job, ctx: HandlerContext): Promise<void> {
  const { rows } = await ctx.pool.query<{ log_retention_days: number | null }>(
    'select log_retention_days from settings where id = true',
  );
  const days = rows[0]?.log_retention_days ?? null;

  if (days === null) {
    ctx.log('no retention window set, keeping everything');
    return;
  }

  const purged = await ctx.pool.query<{ table_name: string; purged: string }>(
    'select * from purge_operational_logs(($1 || \' days\')::interval)',
    [String(days)],
  );

  ctx.log('applied retention window', {
    days,
    ...Object.fromEntries(purged.rows.map((r) => [r.table_name, Number(r.purged)])),
  });
}
