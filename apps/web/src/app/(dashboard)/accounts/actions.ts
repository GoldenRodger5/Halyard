'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  PLATFORM_SCOPES,
  getAdapter,
  openToken,
  selfTest,
  type PlatformId,
} from '@halyard/core';
import { one, query } from '@/lib/db';
import { stagePendingConnection } from '@/lib/connections';
import { requireOperator } from '@/lib/auth';

/**
 * Bluesky, which has no OAuth for this use case.
 *
 * The operator creates an app password and pastes it. The path after that is
 * identical to every other platform: exchange, fetch the identity, stage it,
 * confirm. An app password is a real credential and is sealed the same way.
 */
export async function connectBluesky(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('product'));
  const persona = String(formData.get('persona')) as 'brand' | 'founder';
  const handle = String(formData.get('handle') ?? '').trim().replace(/^@/, '');
  const appPassword = String(formData.get('appPassword') ?? '').trim();

  const fail = (message: string): never =>
    redirect(`/accounts?error=${encodeURIComponent(message)}`);

  if (!handle || !appPassword) {
    fail('A Bluesky handle and an app password are both required.');
  }
  if (/^[^:]+$/.test(appPassword) === false) {
    fail('That does not look like an app password. Create one at bsky.app/settings/app-passwords.');
  }

  const adapter = getAdapter('bluesky');
  let pendingId: string;
  try {
    const tokens = await adapter.exchangeCode(`${handle}:${appPassword}`, {
      clientId: '',
      clientSecret: '',
      redirectUri: '',
    });
    const identity = await adapter.fetchIdentity({
      id: 'pending',
      platform: 'bluesky',
      handle,
      platformUserId: (tokens.meta?.did as string | undefined) ?? null,
      capabilityState: 'pending_auth',
      tokens,
      meta: tokens.meta,
    });
    pendingId = await stagePendingConnection({
      productId,
      platform: 'bluesky',
      persona,
      tokens,
      identity,
    });
  } catch (err) {
    fail(`Bluesky refused the app password: ${(err as Error).message}`);
  }

  redirect(`/accounts/confirm/${pendingId!}`);
}

/**
 * Verify a credential without publishing: token present, not expired, scopes
 * sufficient, one trivial read succeeds. A dead token found here is an
 * inconvenience; found by a publish job it is a missed slot.
 */
export async function runSelfTest(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  const account = await one<{
    id: string;
    platform: PlatformId;
    handle: string;
    platform_user_id: string | null;
    capability_state: string;
    access_token_enc: Buffer | null;
    refresh_token_enc: Buffer | null;
    token_expires_at: string | null;
    scopes: string[];
  }>(
    `select id, platform, handle, platform_user_id, capability_state, access_token_enc,
            refresh_token_enc, token_expires_at, scopes
       from social_accounts where id = $1`,
    [id],
  );

  if (!account) return;

  let result;
  if (!account.access_token_enc) {
    result = {
      ok: false,
      summary: `${account.platform}: no token is stored. Connect the account before self-testing it.`,
    };
  } else {
    try {
      const adapter = getAdapter(account.platform);
      result = await selfTest(
        adapter,
        {
          id: account.id,
          platform: account.platform,
          handle: account.handle,
          platformUserId: account.platform_user_id,
          capabilityState: account.capability_state as 'live',
          tokens: {
            accessToken: openToken(account.access_token_enc),
            refreshToken: account.refresh_token_enc ? openToken(account.refresh_token_enc) : null,
            expiresAt: account.token_expires_at ? new Date(account.token_expires_at) : null,
            scopes: account.scopes,
          },
          meta: { did: account.platform_user_id },
        },
        PLATFORM_SCOPES[account.platform] ?? [],
      );
    } catch (err) {
      // An unsealable token is itself the finding, and the most likely cause is
      // a rotated TOKEN_ENCRYPTION_KEY.
      result = {
        ok: false,
        summary: `${account.platform}: the stored token could not be opened — ${(err as Error).message}. If TOKEN_ENCRYPTION_KEY was rotated, every account must be reconnected.`,
      };
    }
  }

  await query(
    `update social_accounts
        set last_self_test_at = now(), last_self_test_ok = $2, last_self_test_detail = $3
      where id = $1`,
    [id, result.ok, result.summary.slice(0, 500)],
  );

  revalidatePath('/accounts');
}

/**
 * Manual capability override. v1 §8: "Manual override to flip draft_only → live
 * once approval lands." Halyard cannot see a platform's review decision, so the
 * operator records it.
 */
export async function setCapabilityState(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const id = String(formData.get('id'));
  const state = String(formData.get('state'));

  if (!['live', 'draft_only', 'disabled', 'pending_auth'].includes(state)) return;

  await query(
    `update social_accounts
        set capability_state = $2,
            capability_detail = case when $2 = 'live' then 'Marked live by the operator after platform review.' else capability_detail end,
            last_error = case when $2 <> 'error' then null else last_error end
      where id = $1`,
    [id, state],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'capability_state_change', 'social_account', $1, $2)`,
    [id, { state, operator: operator.email }],
  );

  revalidatePath('/accounts');
  revalidatePath('/');
}
