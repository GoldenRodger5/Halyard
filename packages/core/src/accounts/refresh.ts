/**
 * Refreshing platform tokens before they expire.
 *
 * ## Why this moved out of the web tier
 *
 * The refresh was implemented once, correctly, inside the web app's cron route,
 * and scheduled in `apps/web/vercel.json` as `0 4 * * *` — **once a day**,
 * because Hobby accounts are limited to one cron run per day.
 *
 * An X OAuth 2.0 access token lives **two hours**. A daily refresh therefore
 * cannot keep one alive: the token expires, the next publish fails, the account
 * is marked `error`, and the operator is told to reconnect an account that was
 * working. `apps/worker/src/scheduler.ts` already says this in its own comment
 * and schedules `refresh_tokens` hourly for exactly this reason — but the
 * worker's handler only logged which accounts were due and deferred the work
 * back to the web tier, so nothing refreshed anything on a survivable cadence.
 *
 * So the logic lives here, where both callers can run it, and the worker — which
 * has no cron frequency limit — becomes the one that actually does it.
 *
 * ## What this needs from its environment
 *
 * Client credentials. X's token endpoint authenticates the *client* on refresh,
 * not just the user, so `X_CLIENT_ID` and `X_CLIENT_SECRET` must be present
 * wherever this runs. That is why the worker now needs them and did not before.
 *
 * ## What it does on failure
 *
 * §531. It used to mark the account `error` immediately and raise a critical
 * notification. The intent, stated one paragraph up, was that *"a transient
 * provider outage must not become a permanent disconnection"* — and the select
 * below read `capability_state in ('live','draft_only')`, so marking an account
 * `error` removed it from every future refresh. One blip and the account was
 * out of the loop for good, holding a refresh token still valid for six months
 * that nothing would ever use again. The only exit was a person pressing
 * Reconnect.
 *
 * That is now a lease, a backoff and a threshold:
 *
 * - **A lease.** X's refresh token is *single use*: every refresh returns a new
 *   one and invalidates the old immediately. Three things called this function
 *   with no coordination — the worker's schedule, the web tier's daily cron
 *   backstop, and routinely a second worker (gotcha 13). Two refreshing one
 *   account at once is how a rotating chain dies: one rotates, the other
 *   presents a token that no longer exists. X answers *"Value passed for the
 *   token was invalid"*, which is precisely what was recorded against
 *   @Recipe_Fix on 23 August. Widely reported by other developers, including
 *   the case of one app connected from two environments cutting itself off.
 * - **A backoff.** A failure sets `refresh_next_attempt_at`, doubling from five
 *   minutes. The account stays in the scan.
 * - **A threshold.** Only after `MAX_REFRESH_FAILURES` consecutive failures —
 *   several hours of trying — is a person told, because by then the grant
 *   really is gone. Even then the account stays in the scan, so a provider that
 *   comes back fixes itself.
 */
import { getAdapter, PLATFORM_CLIENT_ENV } from '../adapters/index.js';
import { needsRefresh } from '../adapters/oauth.js';
import type { PlatformId } from '../adapters/types.js';
import { openToken, sealToken } from '../crypto/tokenCrypto.js';

/**
 * §531. How long one process may hold an account before another may take over.
 *
 * Long enough that a slow token endpoint is not overtaken mid-call, short
 * enough that a process killed between claiming and refreshing does not strand
 * the account. Five minutes against a request that normally takes under a
 * second.
 */
export const REFRESH_LEASE_MINUTES = 5;

/**
 * §532. Two environments cannot share one X account.
 *
 * X keeps a single token chain per (user, developer app). @Recipe_Fix is
 * authorised in the local development database *and* in production, through
 * the same `X_CLIENT_ID` — so a refresh in either one rotates the chain and
 * silently kills the other's stored refresh token. Whichever ran last wins,
 * and the loser reports "Value passed for the token was invalid" and asks a
 * person to reconnect. Other developers have reported exactly this shape:
 * connecting the same app from dev and live cuts one of them off.
 *
 * No amount of locking fixes it, because the two refreshers are in different
 * databases and cannot see each other. The only correct answer is that one
 * environment owns the tokens. `HALYARD_TOKEN_REFRESH=off` is how a
 * development machine says it is not that one.
 *
 * Defaults to *on*, so production and a fresh clone keep the behaviour they
 * have; a laptop opts out, and `.env` carries it through `env-sync`.
 */
export function tokenRefreshDisabled(env: NodeJS.ProcessEnv): boolean {
  return (env.HALYARD_TOKEN_REFRESH ?? '').trim().toLowerCase() === 'off';
}

/**
 * Consecutive failures before a person is told to reconnect.
 *
 * Six, doubling from five minutes, is a little over five hours of trying — long
 * enough that a provider outage, a rate limit or a transient
 * "token was invalid" has been given every chance, and short enough that a
 * genuinely revoked grant is reported the same day. X's own developers report
 * this error clearing on retry, which is the whole reason the first failure
 * must not be terminal.
 */
export const MAX_REFRESH_FAILURES = 6;

/** Five minutes doubling to a cap, so a dead account is polled, not hammered. */
export function backoffMinutes(failures: number): number {
  return Math.min(5 * 2 ** Math.max(0, failures - 1), 180);
}

export interface RefreshableAccount {
  id: string;
  platform: PlatformId;
  access_token_enc: Buffer | null;
  refresh_token_enc: Buffer | null;
  token_expires_at: string | Date | null;
  /** §531. Consecutive failures so far, for the backoff and the threshold. */
  refresh_failures?: number;
}

/** The narrow database surface this needs, so it can be driven by a test. */
export type RefreshQuery = <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface RefreshOutcome {
  refreshed: number;
  failed: number;
  /** Accounts skipped because this environment has no credentials for them. */
  skippedNoCredentials: number;
  /** Accounts whose token is not close enough to expiry to bother. */
  skippedNotDue: number;
  /** §531. Accounts another process was already refreshing. */
  skippedLocked?: number;
  /** §531. Accounts that have now failed enough times to need a person. */
  needsReconnect?: number;
  /** §532. This environment is not the one that owns the tokens. */
  disabled?: boolean;
}

export interface RefreshDeps {
  query: RefreshQuery;
  env?: NodeJS.ProcessEnv;
}

/**
 * Refresh every account whose token is close to expiring.
 *
 * Idempotent by construction: an account that is not near expiry is skipped, so
 * running this every hour costs one query and no provider calls until a token
 * actually approaches its deadline.
 */
export async function refreshDueTokens(deps: RefreshDeps): Promise<RefreshOutcome> {
  const env = deps.env ?? process.env;
  const out: RefreshOutcome = {
    refreshed: 0,
    failed: 0,
    skippedNoCredentials: 0,
    skippedNotDue: 0,
  };

  /*
   * §531. `capability_state` is deliberately not a filter any more.
   *
   * It read `in ('live','draft_only')`, and the failure path below set
   * `'error'` — so the first failure removed the account from this query
   * permanently. `disabled` is the one state that should be skipped, because
   * an operator turned it off on purpose. An account in `error` is exactly the
   * one that most needs another attempt.
   */
  /*
   * §532. A development machine must not rotate production's tokens.
   * Checked before the query, so a disabled environment costs nothing at all.
   */
  if (tokenRefreshDisabled(env)) {
    return { ...out, disabled: true };
  }

  const accounts = await deps.query<RefreshableAccount>(
    `select id, platform, access_token_enc, refresh_token_enc, token_expires_at,
            refresh_failures
       from social_accounts
      where token_expires_at is not null
        and capability_state <> 'disabled'
        and (refresh_next_attempt_at is null or refresh_next_attempt_at <= now())`,
  );

  for (const account of accounts) {
    const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : null;
    if (!needsRefresh(expiresAt)) {
      out.skippedNotDue += 1;
      continue;
    }

    const names = PLATFORM_CLIENT_ENV[account.platform];
    const clientId = names ? env[names.id] : undefined;
    const clientSecret = names ? env[names.secret] : undefined;

    /**
     * No credentials here is a *configuration* fact, not a token failure.
     *
     * It must never mark the account `error` — that would tell the operator to
     * reconnect a perfectly good account because the process running this was
     * missing an environment variable.
     */
    if (!clientId || !clientSecret || !account.access_token_enc) {
      out.skippedNoCredentials += 1;
      continue;
    }

    /*
     * §531. Claim the account before touching the provider.
     *
     * A conditional update is the lock, the same shape `jobs` uses. If it
     * returns no row, another process holds the lease and this one must not
     * call the token endpoint: X rotates the refresh token on every use, so the
     * second caller would present one that no longer exists and take the whole
     * chain down with it.
     */
    const claimed = await deps.query<{ id: string }>(
      `update social_accounts
          set refresh_locked_at = now()
        where id = $1
          and (refresh_locked_at is null
               or refresh_locked_at < now() - make_interval(mins => $2))
        returning id`,
      [account.id, REFRESH_LEASE_MINUTES],
    );
    if (claimed.length === 0) {
      out.skippedLocked = (out.skippedLocked ?? 0) + 1;
      continue;
    }

    try {
      const adapter = getAdapter(account.platform);
      const next = await adapter.refresh(
        {
          accessToken: openToken(account.access_token_enc),
          refreshToken: account.refresh_token_enc ? openToken(account.refresh_token_enc) : null,
        },
        { clientId, clientSecret },
      );

      /*
       * §531. Success clears the failure state as well as the token, including
       * a `capability_state` of `error` that a previous failure set — the
       * account demonstrably works, so leaving it marked broken would keep
       * asking a person to fix something already fixed. Restored to
       * `draft_only`, never to `live`: `live` means an operator marked the
       * platform review passed (gotcha 5), and a refresh proves nothing about
       * a review.
       */
      await deps.query(
        `update social_accounts
            set access_token_enc = $2, refresh_token_enc = $3, token_expires_at = $4,
                last_error = null,
                refresh_failures = 0,
                refresh_next_attempt_at = null,
                refresh_locked_at = null,
                capability_state = case when capability_state = 'error'
                                        then 'draft_only' else capability_state end
          where id = $1`,
        [
          account.id,
          sealToken(next.accessToken),
          // X rotates the refresh token on every use. Keeping the previous one
          // when none comes back is deliberate: losing it means the account can
          // never refresh again and must be reconnected by hand.
          next.refreshToken ? sealToken(next.refreshToken) : account.refresh_token_enc,
          next.expiresAt ?? null,
        ],
      );
      out.refreshed += 1;
    } catch (err) {
      out.failed += 1;

      /*
       * §531. A failure is a countdown, not a verdict.
       *
       * The account keeps its refresh token, keeps its place in the scan, and
       * is tried again after a doubling backoff. `capability_state` is only
       * set to `error` once the count passes the threshold, and even then the
       * account stays in the query above, so a provider that recovers fixes
       * itself without anybody being asked to do anything.
       *
       * X's "Value passed for the token was invalid" is the specific reason
       * this cannot be terminal on the first failure: it is what a lost
       * rotation race returns, and other developers report the same message
       * clearing on a later attempt.
       */
      const failures = (account.refresh_failures ?? 0) + 1;
      const fatal = failures >= MAX_REFRESH_FAILURES;
      const reason = `Token refresh failed: ${(err as Error).message.slice(0, 400)}`;

      await deps.query(
        `update social_accounts
            set last_error = $2,
                refresh_failures = $3,
                refresh_next_attempt_at = now() + make_interval(mins => $4),
                refresh_locked_at = null
                ${fatal ? ", capability_state = 'error'" : ''}
          where id = $1`,
        [account.id, reason, failures, backoffMinutes(failures)],
      );

      /*
       * One notification, at the threshold. Raising a critical alert on every
       * transient failure is how an operator learns to ignore them, and the
       * whole point of the backoff is that most failures need nobody.
       */
      if (fatal) {
        out.needsReconnect = (out.needsReconnect ?? 0) + 1;
        await deps.query(
          `insert into notifications (kind, severity, title, body, entity_type, entity_id)
           values ('auth_failure', 'critical', $1, $2, 'social_account', $3)`,
          [
            `${account.platform} token refresh failed ${failures} times`,
            'Halyard has retried for several hours and the provider still refuses the stored ' +
              'refresh token. This one does need you: reconnect it on Master Control. ' +
              'Retries continue in the background in case the provider recovers.',
            account.id,
          ],
        );
      }
    }
  }

  return out;
}
