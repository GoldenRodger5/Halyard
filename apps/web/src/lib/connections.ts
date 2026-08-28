import 'server-only';
import {
  checkIdentity,
  expectedHandleFor,
  sealToken,
  type PlatformId,
  type PlatformIdentity,
  type TokenSet,
} from '@halyard/core';
import { query } from './db';

/**
 * Stage an authorised token as a pending connection.
 *
 * Shared by the OAuth callback and the Bluesky app-password form, because the
 * rule they enforce is the same one: a token becomes an account only after a
 * human has looked at the identity it belongs to.
 */
export async function stagePendingConnection(input: {
  productId: string;
  platform: PlatformId;
  persona: 'founder' | 'brand';
  tokens: TokenSet;
  identity: PlatformIdentity;
}): Promise<string> {
  const { productId, platform, persona, tokens, identity } = input;

  const existing = await query<{
    id: string;
    product_id: string;
    persona: 'founder' | 'brand';
    platform: PlatformId;
    platform_user_id: string | null;
    handle: string;
    identity_confirmed_at: string | null;
  }>(
    /*
     * §176. `identity_confirmed_at` too. A row exists for every platform before
     * anything is connected, so its presence proves nothing; whether a person
     * ever confirmed who it is decides whether this is a first connection or a
     * reconnection, and that governs every check downstream.
     */
    `select id, product_id, persona, platform, platform_user_id, handle, identity_confirmed_at
       from social_accounts`,
  );

  const reconnecting = await query<{ id: string }>(
    'select id from social_accounts where product_id = $1 and platform = $2 and persona = $3',
    [productId, platform, persona],
  );

  /*
   * §175. The whole object, resolved in code rather than in SQL.
   *
   * This selected `expected_handles ->> persona`, which cannot express a handle
   * that differs per platform — and the product's does: @Recipe_Fix on X,
   * @recipe.fix on Instagram and Threads. `expectedHandleFor` prefers
   * `"<persona>:<platform>"` and falls back to `"<persona>"`.
   */
  const expected = await query<{ expected_handles: Record<string, unknown> | null }>(
    'select expected_handles from products where id = $1',
    [productId],
  );

  const warnings = checkIdentity({
    platform,
    persona,
    productId,
    expectedHandle: expectedHandleFor(expected[0]?.expected_handles, persona, platform),
    identity,
    existing: existing.map((a) => ({
      id: a.id,
      productId: a.product_id,
      persona: a.persona,
      platform: a.platform,
      platformUserId: a.platform_user_id,
      handle: a.handle,
      identityConfirmedAt: a.identity_confirmed_at,
    })),
    reconnectingAccountId: reconnecting[0]?.id ?? null,
  });

  const rows = await query<{ id: string }>(
    `insert into pending_connections
       (product_id, platform, persona, platform_user_id, handle, display_name, avatar_url,
        follower_count, scopes, access_token_enc, refresh_token_enc, token_expires_at,
        token_meta, alternatives, warnings, reconnect_account_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     returning id`,
    [
      productId,
      platform,
      persona,
      identity.platformUserId,
      identity.handle,
      identity.displayName ?? null,
      identity.avatarUrl ?? null,
      identity.followerCount ?? null,
      tokens.scopes ?? [],
      sealToken(tokens.accessToken),
      tokens.refreshToken ? sealToken(tokens.refreshToken) : null,
      tokens.expiresAt ?? null,
      // Adapter meta can carry a fetch override in tests; never persist a function.
      JSON.stringify(
        Object.fromEntries(
          Object.entries(tokens.meta ?? {}).filter(([, v]) => typeof v !== 'function'),
        ),
      ),
      JSON.stringify(identity.alternatives ?? []),
      JSON.stringify(warnings),
      reconnecting[0]?.id ?? null,
    ],
  );

  return rows[0]!.id;
}
