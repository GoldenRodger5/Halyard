import { NextResponse, type NextRequest } from 'next/server';
import {
  refreshDueTokens,
  safeEqual,
  tokenExpiryState,
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

/**
 * Vercel Cron issues **GET**, not POST.
 *
 * This route exported only POST, so all three scheduled tasks would have
 * returned 405 forever — and quietly, because a cron that 405s does not page
 * anybody. `refresh_tokens` is on that list, so the first thing to break would
 * have been every OAuth token expiring with nothing to renew it, about an hour
 * into production.
 *
 * Both verbs are exported: GET because that is what the scheduler sends, POST
 * because that is what `scripts/` and any manual trigger send.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ task: string }> }) {
  return POST(request, context);
}

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

  /**
   * Record that it ran.
   *
   * A cron that stops firing is invisible: nothing errors, work simply does not
   * happen, and the first sign is a symptom weeks later. That a route *responds*
   * when called by hand — which is all a deploy can prove — says nothing about
   * whether the scheduler is actually calling it. This row is the difference
   * between the two, and `/settings/health` reads it.
   */
  await query(
    // The task name goes in `detail`, not `entity_id`: that column is a uuid,
    // and this is a task name. The first version of this line put it there and
    // failed on every call — invisibly, because the catch below swallowed it.
    `insert into audit_log (actor, action, entity_type, detail)
     values ('system', 'cron_ran', 'cron', $1)`,
    [{ task, at: new Date().toISOString() }],
  ).catch((err: unknown) => {
    // Bookkeeping must never stop the work it describes — but it must not be
    // silent either. A swallowed error here is what made the broken insert
    // above look like a working one.
    console.error('cron_ran audit insert failed', { task, error: String(err) });
  });

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
  /**
   * Delegates to the shared implementation in core.
   *
   * This route kept the only copy of the refresh, and `vercel.json` schedules
   * it `0 4 * * *` — once a day, the Hobby limit — against X tokens that live
   * two hours. The worker now runs the same function hourly; this stays as the
   * documented backstop for the case where the worker is down, which is the one
   * failure the worker cannot cover for itself.
   */
  const result = await refreshDueTokens({
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> =>
      (await query(sql, params)) as T[],
  });
  return { refreshed: result.refreshed, failed: result.failed };
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
