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
 * Marks the account `error` with the reason, and raises a critical
 * notification. It does **not** retry blindly against a dead credential, and it
 * does not delete the stored refresh token — a transient provider outage must
 * not become a permanent disconnection.
 */
import { getAdapter, PLATFORM_CLIENT_ENV } from '../adapters/index.js';
import { needsRefresh } from '../adapters/oauth.js';
import type { PlatformId } from '../adapters/types.js';
import { openToken, sealToken } from '../crypto/tokenCrypto.js';

export interface RefreshableAccount {
  id: string;
  platform: PlatformId;
  access_token_enc: Buffer | null;
  refresh_token_enc: Buffer | null;
  token_expires_at: string | Date | null;
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

  const accounts = await deps.query<RefreshableAccount>(
    `select id, platform, access_token_enc, refresh_token_enc, token_expires_at
       from social_accounts
      where capability_state in ('live','draft_only') and token_expires_at is not null`,
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

    try {
      const adapter = getAdapter(account.platform);
      const next = await adapter.refresh(
        {
          accessToken: openToken(account.access_token_enc),
          refreshToken: account.refresh_token_enc ? openToken(account.refresh_token_enc) : null,
        },
        { clientId, clientSecret },
      );

      await deps.query(
        `update social_accounts
            set access_token_enc = $2, refresh_token_enc = $3, token_expires_at = $4,
                last_error = null
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
      await deps.query(
        `update social_accounts set capability_state = 'error', last_error = $2 where id = $1`,
        [account.id, `Token refresh failed: ${(err as Error).message.slice(0, 400)}`],
      );
      await deps.query(
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

  return out;
}
