import { NextResponse, type NextRequest } from 'next/server';
import {
  needsRefresh,
  openToken,
  safeEqual,
  sealToken,
  getAdapter,
  tokenExpiryState,
  PLATFORM_CLIENT_ENV,
  type PlatformId,
} from '@halyard/core';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Cron entrypoints. Vercel Cron calls these; the worker owns anything that
 * takes minutes, so these handlers only enqueue jobs or do short work.
 *
 * Every call is authenticated with CRON_SECRET, compared in constant time.
 */
const TASKS = [
  'collect_signals',
  'generate',
  'reconcile_schedule',
  'collect_attribution',
  'score_performance',
  'refresh_tokens',
  'digest_email',
  'account_health',
  'purge_request_logs',
  'collect_app_store',
  'mark_stale_assets',
  'verify_flows',
] as const;

type Task = (typeof TASKS)[number];

export async function POST(request: NextRequest, context: { params: Promise<{ task: string }> }) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { task } = await context.params;
  if (!TASKS.includes(task as Task)) {
    return NextResponse.json({ error: `unknown task '${task}'` }, { status: 404 });
  }

  // Token refresh needs the client credentials, which live here rather than in
  // the worker's environment, so it is the one cron that does real work inline.
  if (task === 'refresh_tokens') {
    return NextResponse.json(await refreshTokens());
  }

  if (task === 'account_health') {
    return NextResponse.json(await accountHealth());
  }

  if (task === 'purge_request_logs') {
    // build pack §8 — request logs are kept for seven days and no longer.
    const purged = await query<{ id: string }>(
      'delete from platform_requests where purge_after < now() returning id',
    );
    return NextResponse.json({ task, purged: purged.length });
  }

  // Weekly flow verification (milestone 41 Part B) is a capture job in verify
  // mode: it never records, it only proves the selectors still resolve.
  if (task === 'verify_flows') {
    const enqueued = await query<{ id: string }>(
      `insert into jobs (kind, payload, priority, dedupe_key)
       select 'capture', jsonb_build_object('flowId', 'adapt_and_reveal', 'productId', id, 'verifyOnly', true),
              30, 'verify_flows:' || id || ':' || to_char(now(), 'IYYY-IW')
         from products where status = 'active' and kind = 'product'
       on conflict do nothing
       returning id`,
    );
    return NextResponse.json({ task, enqueued: enqueued.length });
  }

  const products = await query<{ id: string }>(`select id from products where status = 'active'`);
  let enqueued = 0;

  for (const product of products) {
    await query(
      `insert into jobs (kind, payload, priority, dedupe_key)
       values ($1, $2, 60, $3) on conflict do nothing`,
      [task, { productId: product.id }, `${task}:${product.id}:${new Date().toISOString().slice(0, 13)}`],
    );
    enqueued++;
  }

  return NextResponse.json({ task, enqueued });
}

/**
 * v1 §7 — refresh runs an hour before expiry. A refresh that fails is an auth
 * error, so the account is marked and its queue paused rather than retried
 * blindly against a dead token.
 */
async function refreshTokens(): Promise<{ refreshed: number; failed: number }> {
  const accounts = await query<{
    id: string;
    platform: PlatformId;
    access_token_enc: Buffer | null;
    refresh_token_enc: Buffer | null;
    token_expires_at: string | null;
  }>(
    `select id, platform, access_token_enc, refresh_token_enc, token_expires_at
       from social_accounts
      where capability_state in ('live','draft_only') and token_expires_at is not null`,
  );

  let refreshed = 0;
  let failed = 0;

  for (const account of accounts) {
    if (!needsRefresh(account.token_expires_at ? new Date(account.token_expires_at) : null)) continue;

    const env = PLATFORM_CLIENT_ENV[account.platform];
    const clientId = process.env[env.id];
    const clientSecret = process.env[env.secret];
    if (!clientId || !clientSecret || !account.access_token_enc) continue;

    try {
      const adapter = getAdapter(account.platform);
      const next = await adapter.refresh(
        {
          accessToken: openToken(account.access_token_enc),
          refreshToken: account.refresh_token_enc ? openToken(account.refresh_token_enc) : null,
        },
        { clientId, clientSecret },
      );

      await query(
        `update social_accounts
            set access_token_enc = $2, refresh_token_enc = $3, token_expires_at = $4, last_error = null
          where id = $1`,
        [
          account.id,
          sealToken(next.accessToken),
          next.refreshToken ? sealToken(next.refreshToken) : account.refresh_token_enc,
          next.expiresAt ?? null,
        ],
      );
      refreshed++;
    } catch (err) {
      failed++;
      await query(
        `update social_accounts set capability_state = 'error', last_error = $2 where id = $1`,
        [account.id, `Token refresh failed: ${(err as Error).message.slice(0, 400)}`],
      );
      await query(
        `insert into notifications (kind, severity, title, body, entity_type, entity_id)
         values ('auth_failure', 'critical', $1, $2, 'social_account', $3)`,
        [
          `${account.platform} token refresh failed`,
          'The account is marked in error and its queued items are paused. Reconnect on the Accounts screen.',
          account.id,
        ],
      );
    }
  }

  return { refreshed, failed };
}

/**
 * Daily account health. Milestone 40.
 *
 * Two things are worth knowing a week early: a token about to expire, and an
 * identity that was confirmed with a warning and then forgotten. Both are quiet
 * failures — the account looks connected right up to the moment a slot misses.
 */
async function accountHealth(): Promise<{ warned: number; expired: number }> {
  const accounts = await query<{
    id: string;
    platform: string;
    handle: string;
    token_expires_at: string | null;
  }>(
    `select id, platform, handle, token_expires_at
       from social_accounts
      where capability_state in ('live','draft_only')
        and access_token_enc is not null`,
  );

  let warned = 0;
  let expired = 0;

  for (const account of accounts) {
    const state = tokenExpiryState(
      account.token_expires_at ? new Date(account.token_expires_at) : null,
    );
    if (state.level === 'none') continue;
    if (state.level === 'expired') expired++;
    else warned++;

    // One notification per account per day: re-warning hourly trains you to
    // ignore the thing you most need to act on.
    await query(
      `insert into notifications (kind, severity, title, body, entity_type, entity_id, dedupe_key)
       values ('auth_failure', $1, $2, $3, 'social_account', $4, $5)
       on conflict (dedupe_key) do nothing`,
      [
        state.level === 'expired' ? 'critical' : 'warning',
        `${account.platform} token for ${account.handle} ${state.level === 'expired' ? 'has expired' : `expires in ${state.days} days`}`,
        `${state.message} Reconnect on the Accounts screen.`,
        account.id,
        `token_expiry:${account.id}:${new Date().toISOString().slice(0, 10)}`,
      ],
    );
  }

  return { warned, expired };
}
