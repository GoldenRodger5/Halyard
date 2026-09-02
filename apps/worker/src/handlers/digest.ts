/**
 * The daily operator digest — the handler `digest_email` never had.
 *
 * ## What was missing
 *
 * `settings.daily_digest_enabled` and `settings.alert_email` have existed since
 * migration 0008, `digest_email` is a declared job kind, and the cron route
 * lists it as a task. There was no handler. `handlerCoverage.test.ts` recorded
 * it as knowingly unhandled — "the digest is not implemented" — which was
 * honest bookkeeping for a hole that stayed open.
 *
 * So the schema described a feature, the job list described it, and nothing
 * could run it. Enqueueing one would have left a row no worker could claim.
 *
 * ## What it says
 *
 * Only things the operator would act on, counted from tables rather than
 * narrated: what is waiting for approval, what failed, what published, and
 * whether the worker is alive. A digest that reports "nothing happened" every
 * day is one people filter, so it is built to be skippable — see below.
 *
 * ## Sending is a boundary, not a feature of this file
 *
 * Composition is deterministic and fully tested. Delivery needs Resend, which
 * is an external dependency Halyard does not have, so the handler composes,
 * records, and hands off to the same transport the newsletter uses. Without
 * `RESEND_API_KEY` and an `alert_email` it writes the digest as a notification
 * instead — visible on the dashboard, which is where an operator already looks.
 * Nothing is silently dropped and nothing pretends to have been sent.
 */
import { accountStatus, sendNewsletter } from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';
import { notify } from './publish.js';

export interface DigestCounts {
  awaitingApproval: number;
  scheduled: number;
  publishedYesterday: number;
  failedJobs: number;
  deadJobs: number;
  workerSeenMinutesAgo: number | null;
  /**
   * §461. Accounts that could actually receive a post right now.
   *
   * The digest said *"Nothing publishes until you approve it"* whenever
   * anything was waiting, which names the operator as the bottleneck. Measured
   * on the real account table: **one** of seven accounts holds a live
   * credential. Approving all twenty-eight waiting pieces would have published
   * nothing, and the digest would have said the same sentence the next morning.
   *
   * Gotcha 5 is the reason this cannot be read off `capability_state`: an
   * account marked `live` can have no token at all, and one here does.
   */
  publishableAccounts: number;
  /** Platforms that cannot receive a post, and the one thing each needs. */
  blockedAccounts: Array<{ platform: string; because: string }>;
}

/**
 * Whether the digest is worth sending.
 *
 * A message that says "nothing needs you" every morning trains an operator to
 * ignore the one that says otherwise. Sent only when something is waiting, has
 * failed, or the worker has gone quiet.
 */
export function digestIsWorthSending(counts: DigestCounts): boolean {
  return (
    counts.awaitingApproval > 0 ||
    counts.failedJobs > 0 ||
    counts.deadJobs > 0 ||
    counts.workerSeenMinutesAgo === null ||
    counts.workerSeenMinutesAgo > 10
  );
}

/** The digest body. Plain text: it is a status report, not a newsletter. */
export function renderDigest(counts: DigestCounts, productName: string): string {
  const lines = [
    `${productName} — daily digest`,
    '',
    `Waiting for you:      ${counts.awaitingApproval}`,
    `Scheduled:            ${counts.scheduled}`,
    `Published yesterday:  ${counts.publishedYesterday}`,
  ];
  if (counts.failedJobs > 0) lines.push(`Failed jobs:          ${counts.failedJobs}`);
  if (counts.deadJobs > 0) lines.push(`Dead jobs:            ${counts.deadJobs}`);
  lines.push(
    counts.workerSeenMinutesAgo === null
      ? 'Worker:               never seen — nothing is running'
      : counts.workerSeenMinutesAgo > 10
        ? `Worker:               last seen ${counts.workerSeenMinutesAgo}m ago — likely dead`
        : 'Worker:               alive',
  );
  /**
   * §461. The real bottleneck first.
   *
   * "Nothing publishes until you approve it" is true only when approving would
   * publish something. With no connected account it is worse than useless: it
   * points at the one task that would change nothing, every morning.
   */
  if (counts.publishableAccounts === 0) {
    lines.push(
      '',
      'NOTHING CAN PUBLISH. No connected account can receive a post, so approving',
      'these would not send them anywhere.',
    );
    for (const blocked of counts.blockedAccounts) {
      lines.push(`  ${blocked.platform.padEnd(12)}${blocked.because}`);
    }
  } else {
    if (counts.blockedAccounts.length > 0) {
      lines.push('', 'These platforms cannot receive a post:');
      for (const blocked of counts.blockedAccounts) {
        lines.push(`  ${blocked.platform.padEnd(12)}${blocked.because}`);
      }
    }
    if (counts.awaitingApproval > 0) {
      lines.push('', 'Nothing publishes until you approve it.');
    }
  }
  return lines.join('\n');
}

/**
 * §461. Which accounts could actually receive a post, and why the rest cannot.
 *
 * Read through `accountStatus` rather than off `capability_state`, because
 * gotcha 5: `live` means "an operator marked this past platform review" and an
 * account can read `live` with no credential at all. One does here.
 */
async function publishability(
  ctx: HandlerContext,
  productId: string,
): Promise<Pick<DigestCounts, 'publishableAccounts' | 'blockedAccounts'>> {
  const { rows } = await ctx.pool.query<{
    platform: string;
    persona: string;
    capability_state: string;
    has_token: boolean;
    identity_confirmed_at: Date | null;
    handle: string | null;
  }>(
    `select platform, persona, capability_state,
            (access_token_enc is not null) as has_token,
            identity_confirmed_at, handle
       from social_accounts
      where product_id = $1`,
    [productId],
  );

  const blocked: Array<{ platform: string; because: string }> = [];
  let publishable = 0;

  for (const row of rows) {
    const view = accountStatus({
      platform: row.platform,
      persona: row.persona,
      account: {
        capabilityState: row.capability_state,
        hasToken: row.has_token,
        identityConfirmedAt: row.identity_confirmed_at,
        handle: row.handle ?? '',
      },
    } as never);
    if (view.canPublish) {
      publishable += 1;
      continue;
    }
    /*
     * The label rather than the full explanation: this is a status line in a
     * plain-text mail, and the screen it points at carries the detail.
     */
    blocked.push({
      platform: row.platform,
      because: view.actionLabel ? `${view.label} — ${view.actionLabel}` : view.label,
    });
  }

  return { publishableAccounts: publishable, blockedAccounts: blocked };
}

export async function digestHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');

  const settings = await ctx.pool.query<{ daily_digest_enabled: boolean; alert_email: string | null }>(
    'select daily_digest_enabled, alert_email from settings where id = true',
  );
  if (!settings.rows[0]?.daily_digest_enabled) {
    ctx.log('daily digest disabled in settings', { productId });
    return;
  }

  const { rows } = await ctx.pool.query<{
    awaiting: string;
    scheduled: string;
    published: string;
    failed: string;
    dead: string;
    worker_minutes: string | null;
  }>(
    `select
       (select count(*) from content_items
         where product_id = $1 and status = 'pending_approval')                   as awaiting,
       (select count(*) from content_items
         where product_id = $1 and status = 'scheduled')                          as scheduled,
       (select count(*) from publications p
          join content_items c on c.id = p.content_item_id
         where c.product_id = $1 and p.published_at > now() - interval '1 day')   as published,
       (select count(*) from jobs where status = 'failed')                        as failed,
       (select count(*) from jobs where status = 'dead')                          as dead,
       (select round(extract(epoch from (now() - max(last_seen_at))) / 60)
          from worker_heartbeats)                                                 as worker_minutes`,
    [productId],
  );

  const row = rows[0]!;
  const counts: DigestCounts = {
    awaitingApproval: Number(row.awaiting),
    scheduled: Number(row.scheduled),
    publishedYesterday: Number(row.published),
    failedJobs: Number(row.failed),
    deadJobs: Number(row.dead),
    workerSeenMinutesAgo: row.worker_minutes === null ? null : Number(row.worker_minutes),
    ...(await publishability(ctx, productId)),
  };

  if (!digestIsWorthSending(counts)) {
    ctx.log('nothing worth a digest today', { productId, ...counts });
    return;
  }

  const { rows: products } = await ctx.pool.query<{ name: string }>(
    'select name from products where id = $1',
    [productId],
  );
  const body = renderDigest(counts, products[0]?.name ?? productId);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NEWSLETTER_FROM?.trim();
  const to = settings.rows[0]?.alert_email?.trim();

  if (!apiKey || !from || !to) {
    /*
     * Recorded rather than dropped. A digest that cannot be emailed is still
     * worth reading, and the dashboard is where the operator already looks —
     * so the absence of an email provider costs the delivery, not the content.
     */
    await notify(ctx, 'digest', 'info', 'Daily digest', body);
    ctx.log('digest recorded as a notification; no email provider configured', { productId });
    return;
  }

  await sendNewsletter({
    subject: `${products[0]?.name ?? productId} — daily digest`,
    html: `<pre style="font:14px/1.6 ui-monospace,monospace">${body.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</pre>`,
    text: body,
    // The operator's own address. An unsubscribe link would be wrong here —
    // this is an operational alert to the account owner, not bulk mail — but
    // the transport requires one, so it points at the setting that turns it off.
    recipients: [{ email: to, unsubscribeUrl: `${process.env.HALYARD_PUBLIC_URL ?? ''}/settings` }],
    from,
    apiKey,
    tags: { product: productId, kind: 'digest' },
  });

  ctx.log('digest sent', { productId, to });
}
