/**
 * Settle an asynchronous provider submission.
 *
 * Blotato returns a postSubmissionId when it accepts work. That receipt proves
 * only that the job entered Blotato, not that a social platform published it.
 * This handler is the second half of the transaction: poll the receipt until
 * it becomes published or failed, and never submit the post a second time while
 * the first submission is still in flight.
 */
import {
  adapterForAccount,
  type PlatformId,
  type ProviderCapabilities,
  type PublishAccount,
} from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';

const MAX_POLLS = 24;
const POLL_SECONDS = 15;

interface DeliveryRow {
  publication_id: string;
  content_item_id: string;
  submission_id: string | null;
  platform: PlatformId;
  account_id: string;
  handle: string;
  transport: 'direct' | 'unified';
  provider_account_id: string | null;
  content_status: string;
}

export async function reconcileDeliveryHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const publicationId = String(job.payload.publicationId ?? '');
  const pollNumber = Number(job.payload.pollNumber ?? 1);
  if (!publicationId) throw new Error('reconcile_delivery job has no publicationId');

  const { rows } = await ctx.pool.query<DeliveryRow>(
    `select p.id as publication_id,
            p.content_item_id,
            p.platform_post_id as submission_id,
            p.platform,
            p.account_id,
            sa.handle,
            sa.transport,
            sa.provider_account_id,
            ci.status as content_status
       from publications p
       join social_accounts sa on sa.id = p.account_id
       join content_items ci on ci.id = p.content_item_id
      where p.id = $1`,
    [publicationId],
  );
  const row = rows[0];
  if (!row) return;

  if (row.transport !== 'unified' || !row.submission_id) {
    ctx.log('delivery reconciliation skipped', {
      publicationId,
      why: row.transport !== 'unified' ? 'not a unified transport' : 'no submission id',
    });
    return;
  }

  const { rows: providerRows } = await ctx.pool.query<{ capabilities: ProviderCapabilities }>(
    `select capabilities from provider_capabilities where provider = 'blotato'`,
  );
  const capabilities = providerRows[0]?.capabilities;
  if (!capabilities) {
    ctx.log('delivery reconciliation cannot run', {
      publicationId,
      why: 'no Blotato capability record exists',
    });
    return;
  }

  const adapter = adapterForAccount(
    {
      platform: row.platform,
      transport: 'unified',
      provider_account_id: row.provider_account_id,
    },
    capabilities,
  );
  if (!adapter.fetchDeliveryStatus) {
    throw new Error(`unified adapter for ${row.platform} cannot reconcile delivery`);
  }

  const account: PublishAccount = {
    id: row.account_id,
    platform: row.platform,
    handle: row.handle,
    capabilityState: 'live',
    tokens: { accessToken: 'managed-by-unified-provider', scopes: [] },
    meta: { providerAccountId: row.provider_account_id },
  };

  const status = await adapter.fetchDeliveryStatus(row.submission_id, account);

  if (status.state === 'published') {
    await ctx.pool.query(
      `update publications
          set permalink = coalesce($2, permalink),
              published_at = now(),
              raw_response = $3,
              error = null,
              needs_reconciliation = false
        where id = $1`,
      [publicationId, status.publicUrl ?? null, status.raw ?? null],
    );
    await ctx.pool.query(
      `update content_items
          set status = 'published',
              published_at = now(),
              eligible_for_repost_at = now() + interval '90 days'
        where id = $1`,
      [row.content_item_id],
    );
    await ctx.pool.query(
      `update social_accounts set last_published_at = now() where id = $1`,
      [row.account_id],
    );

    await recordSuccessfulCapability(ctx, row.platform, status.publicUrl ?? null);

    await ctx.pool.query(
      `insert into audit_log (actor, action, entity_type, entity_id, detail)
       values ('worker', 'publish_settled', 'content_item', $1, $2)`,
      [
        row.content_item_id,
        {
          provider: 'blotato',
          submissionId: row.submission_id,
          publicUrl: status.publicUrl ?? null,
          pollNumber,
        },
      ],
    );

    await ctx.enqueue(
      'collect_metrics',
      { publicationId },
      { runAfter: new Date(Date.now() + 60 * 60_000), dedupeKey: `metrics:${publicationId}:1h` },
    );

    await ctx.enqueue(
      'collect_comments',
      { publicationId, pollNumber: 1 },
      { runAfter: new Date(Date.now() + 5 * 60_000), dedupeKey: `comments:${publicationId}:1` },
    );

    ctx.log('provider delivery published', {
      publicationId,
      contentItemId: row.content_item_id,
      platform: row.platform,
      submissionId: row.submission_id,
      publicUrl: status.publicUrl ?? null,
    });
    return;
  }

  if (status.state === 'failed') {
    const message = status.errorMessage ?? 'Blotato reported that the post failed.';
    await ctx.pool.query(
      `update publications
          set error = $2, raw_response = $3, needs_reconciliation = false
        where id = $1`,
      [publicationId, message.slice(0, 2000), status.raw ?? null],
    );
    await ctx.pool.query(
      `update content_items set status = 'failed' where id = $1`,
      [row.content_item_id],
    );

    await ctx.pool.query(
      `insert into audit_log (actor, action, entity_type, entity_id, detail)
       values ('worker', 'publish_failed_at_provider', 'content_item', $1, $2)`,
      [
        row.content_item_id,
        {
          provider: 'blotato',
          submissionId: row.submission_id,
          error: message.slice(0, 500),
          pollNumber,
        },
      ],
    );
    ctx.log('provider delivery failed', {
      publicationId,
      contentItemId: row.content_item_id,
      platform: row.platform,
      error: message.slice(0, 500),
    });
    return;
  }

  if (pollNumber >= MAX_POLLS) {
    await ctx.pool.query(
      `update publications
          set needs_reconciliation = true,
              raw_response = $2,
              error = $3
        where id = $1`,
      [
        publicationId,
        status.raw ?? null,
        `Blotato was still ${status.state} after ${MAX_POLLS} polls; manual reconciliation required.`,
      ],
    );

    ctx.log('provider delivery still unsettled; manual reconciliation required', {
      publicationId,
      contentItemId: row.content_item_id,
      platform: row.platform,
      status: status.state,
      polls: pollNumber,
    });
    return;
  }

  await ctx.enqueue(
    'reconcile_delivery',
    { publicationId, pollNumber: pollNumber + 1 },
    {
      runAfter: new Date(Date.now() + POLL_SECONDS * 1000),
      dedupeKey: `reconcile_delivery:${publicationId}:${pollNumber + 1}`,
      priority: 8,
    },
  );
  ctx.log('provider delivery still pending', {
    publicationId,
    platform: row.platform,
    status: status.state,
    pollNumber,
  });
}

/**
 * A real public post is stronger evidence than a capability probe.
 * Preserve every other observed field and upgrade only what this event proves.
 */
async function recordSuccessfulCapability(
  ctx: HandlerContext,
  platform: PlatformId,
  publicUrl: string | null,
): Promise<void> {
  const { rows } = await ctx.pool.query<{ capabilities: ProviderCapabilities }>(
    `select capabilities from provider_capabilities where provider = 'blotato'`,
  );
  const capabilities = rows[0]?.capabilities;
  if (!capabilities) return;

  const current = capabilities.platforms[platform];
  if (!current) return;

  const verifiedAt = new Date().toISOString();
  capabilities.verifiedAt = verifiedAt;
  capabilities.platforms[platform] = {
    ...current,
    publish: 'yes',
    publishesPublicly: 'yes',
    verifiedAt,
    notes: [
      ...current.notes.filter((note) => !/publishing is still unverified/i.test(note)),
      `Public publication confirmed through Blotato${publicUrl ? ` at ${publicUrl}` : ''}.`,
    ],
  };

  await ctx.pool.query(
    `update provider_capabilities
        set capabilities = $2::jsonb, verified_at = now(), method = 'real_publication'
      where provider = $1`,
    ['blotato', JSON.stringify(capabilities)],
  );
}
