import { NextResponse, type NextRequest } from 'next/server';
import { needsRefresh, openToken, safeEqual, sealToken, getAdapter, PLATFORM_CLIENT_ENV, type PlatformId } from '@halyard/core';
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
