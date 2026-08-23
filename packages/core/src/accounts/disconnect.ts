/**
 * Disconnecting an account — the erasure Halyard claimed and did not have.
 *
 * ## Why this exists
 *
 * The privacy and data-deletion pages had to be written to say that Halyard
 * *cannot* erase a stored credential on request, because it could not: the only
 * thing resembling a disconnect was `setCapabilityState(… 'disabled')`, which
 * changes one text column and leaves `access_token_enc` exactly where it was. A
 * "switched off" account still held a live, decryptable platform token.
 *
 * That is the gap this closes. It is the one operation in Halyard whose whole
 * purpose is to destroy data, so it is written to be checkable rather than
 * trusted:
 *
 *   - it **verifies** the erasure took effect by reading the columns back, and
 *     throws if anything survived, rather than reporting a success it did not
 *     observe;
 *   - it clears the *staged* copy too — `pending_connections` holds sealed
 *     tokens for thirty minutes, and an erasure that leaves one behind has not
 *     erased the credential;
 *   - it records what it destroyed in `audit_log`, because the one thing that
 *     must survive deleting a credential is the fact that it was deleted.
 *
 * ## What it deliberately does not do
 *
 * **It does not delete the account row.** Publications reference it, and a
 * publication that cannot say which account it went out from is worse than a
 * retained handle. Identity fields — handle, platform user id, display name —
 * are what make historical publications explicable, so they stay. Everything
 * that is a *credential*, or was *derived from* one, goes.
 *
 * **It does not revoke at the platform.** Erasing Halyard's copy is not the
 * same as invalidating the token, and pretending otherwise would be the exact
 * class of overclaim this codebase keeps finding. The outcome says so, the UI
 * says so, and the legal pages say so. Provider-side revocation (X's
 * `/2/oauth2/revoke`, Meta's `DELETE /me/permissions`) is a real follow-on and
 * is recorded as one — it needs an adapter method on all seven platforms and a
 * live credential to test against, and it must run *before* erasure or the
 * token needed to revoke is already gone.
 */
import type { PlatformId } from '../adapters/types.js';

/** The narrow database surface this needs, so a test can drive it. */
export type DisconnectQuery = <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface DisconnectDeps {
  query: DisconnectQuery;
  accountId: string;
  /** Who asked. Recorded in the audit entry; this is never an automated act. */
  actor: string;
  /** Optional free text, e.g. a platform's deletion request reference. */
  reason?: string;
}

export interface DisconnectOutcome {
  /** False when no such account exists. Never reported as a successful erase. */
  found: boolean;
  accountId: string;
  platform: PlatformId | null;
  handle: string | null;
  /** Whether a stored access token was actually present before this ran. */
  hadAccessToken: boolean;
  hadRefreshToken: boolean;
  /** Sealed tokens removed from `pending_connections` for the same slot. */
  pendingDiscarded: number;
  /**
   * True when this account was routed through the unified provider, which holds
   * its own connection to the platform that Halyard cannot reach or erase.
   */
  providerHoldsSeparateConnection: boolean;
}

interface AccountRow {
  id: string;
  product_id: string;
  platform: PlatformId;
  persona: string;
  handle: string;
  transport: string;
  has_access_token: boolean;
  has_refresh_token: boolean;
}

interface ErasedRow {
  access_token_enc: Buffer | null;
  refresh_token_enc: Buffer | null;
  token_expires_at: string | null;
  scopes: string[];
  identity_confirmed_at: string | null;
  capability_state: string;
}

/**
 * Erase every credential Halyard holds for one account.
 *
 * Idempotent: running it against an already-disconnected account clears nothing
 * further, reports `hadAccessToken: false`, and still writes an audit entry —
 * a second request is a fact worth keeping, not a no-op worth hiding.
 */
export async function disconnectAccount(deps: DisconnectDeps): Promise<DisconnectOutcome> {
  const { query, accountId, actor } = deps;

  const before = await query<AccountRow>(
    `select id, product_id, platform, persona, handle, transport,
            access_token_enc is not null as has_access_token,
            refresh_token_enc is not null as has_refresh_token
       from social_accounts where id = $1`,
    [accountId],
  );

  const account = before[0];
  if (!account) {
    return {
      found: false,
      accountId,
      platform: null,
      handle: null,
      hadAccessToken: false,
      hadRefreshToken: false,
      pendingDiscarded: 0,
      providerHoldsSeparateConnection: false,
    };
  }

  /**
   * Everything that is a credential, or was derived from holding one.
   *
   * `identity_confirmed_at` goes with them deliberately. The confirmation was a
   * human saying "yes, this token belongs to the account I meant" — about a
   * token that no longer exists. Leaving it set would let a later reconnect
   * inherit a confirmation nobody gave for the new credential.
   *
   * `scopes`, `supported_formats`, `last_verified_at` and the self-test result
   * are observations made *through* the erased credential. Keeping them would
   * leave the account describing permissions Halyard can no longer demonstrate
   * it has — the same "unknown rendered as fact" failure the capability model
   * exists to prevent.
   */
  const erased = await query<ErasedRow>(
    `update social_accounts
        set access_token_enc = null,
            refresh_token_enc = null,
            token_expires_at = null,
            scopes = '{}',
            supported_formats = '{}',
            identity_confirmed_at = null,
            identity_warning = null,
            last_verified_at = null,
            last_self_test_at = null,
            last_self_test_ok = null,
            last_self_test_detail = null,
            last_error = null,
            capability_state = 'pending_auth',
            capability_detail = 'Credential erased at the operator''s request. Reconnect to use this account again.'
      where id = $1
      returning access_token_enc, refresh_token_enc, token_expires_at, scopes,
                identity_confirmed_at, capability_state`,
    [accountId],
  );

  /**
   * Read the erasure back rather than assuming the UPDATE meant what it said.
   *
   * A policy, a trigger or a rewritten statement could leave the token in place
   * while the call returns cleanly, and this is the one operation where
   * reporting an unobserved success is itself the harm. Throwing leaves the row
   * as it is and surfaces the failure; it does not tell anyone the credential
   * is gone.
   */
  const after = erased[0];
  if (
    !after ||
    after.access_token_enc !== null ||
    after.refresh_token_enc !== null ||
    after.token_expires_at !== null ||
    (after.scopes ?? []).length > 0 ||
    after.identity_confirmed_at !== null
  ) {
    throw new Error(
      `Credential erasure for account ${accountId} did not take effect. The stored token may still exist; nothing has been reported as deleted.`,
    );
  }

  /**
   * The staged copy. `pending_connections` holds a sealed token for thirty
   * minutes while an operator confirms an identity, so a disconnect that only
   * touched `social_accounts` would leave a usable credential for the same
   * account sitting in the other table.
   */
  const pending = await query<{ id: string }>(
    `delete from pending_connections
      where (product_id = $1 and platform = $2 and persona = $3)
         or reconnect_account_id = $4
      returning id`,
    [account.product_id, account.platform, account.persona, accountId],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'account_disconnected', 'social_account', $1, $2)`,
    [
      accountId,
      JSON.stringify({
        operator: actor,
        platform: account.platform,
        persona: account.persona,
        handle: account.handle,
        erasedAccessToken: account.has_access_token,
        erasedRefreshToken: account.has_refresh_token,
        pendingDiscarded: pending.length,
        // Stated in the record itself so a later reader is not left to assume
        // the platform-side grant went with it. It did not.
        revokedAtPlatform: false,
        reason: deps.reason ?? null,
      }),
    ],
  );

  return {
    found: true,
    accountId,
    platform: account.platform,
    handle: account.handle,
    hadAccessToken: account.has_access_token,
    hadRefreshToken: account.has_refresh_token,
    pendingDiscarded: pending.length,
    providerHoldsSeparateConnection: account.transport === 'unified',
  };
}
