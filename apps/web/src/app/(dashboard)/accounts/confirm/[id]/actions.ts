'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAdapter, openToken, type PlatformId } from '@halyard/core';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

interface PendingRow {
  id: string;
  product_id: string;
  platform: PlatformId;
  persona: 'founder' | 'brand';
  platform_user_id: string | null;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  scopes: string[];
  access_token_enc: Buffer;
  refresh_token_enc: Buffer | null;
  token_expires_at: string | null;
  token_meta: Record<string, unknown>;
  alternatives: Array<{ platformUserId: string; handle: string; displayName?: string }>;
  warnings: Array<{ kind: string; message: string; severe: boolean }>;
  reconnect_account_id: string | null;
}

/**
 * Promote a pending connection into a real account.
 *
 * This is the only place a platform token is written to `social_accounts`, and
 * it runs only after a human has looked at the handle and said yes. Everything
 * before this point is reversible by doing nothing: the pending row expires.
 */
export async function confirmConnection(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const pendingId = String(formData.get('pendingId'));
  const chosenUserId = formData.get('platformUserId')
    ? String(formData.get('platformUserId'))
    : null;
  const acknowledgeDuplicate = formData.get('acknowledgeDuplicate') === 'on';

  const pending = await one<PendingRow>(
    `select * from pending_connections where id = $1 and expires_at > now()`,
    [pendingId],
  );

  if (!pending) {
    redirect(
      '/accounts?error=' +
        encodeURIComponent(
          'That connection expired before it was confirmed. Tokens are held for thirty minutes and no longer. Connect again.',
        ),
    );
  }

  // If the operator picked a different identity from the alternatives, take its
  // handle with it — the account row must describe what it actually points at.
  let handle = pending.handle;
  let displayName = pending.display_name;
  let platformUserId = pending.platform_user_id;
  if (chosenUserId && chosenUserId !== pending.platform_user_id) {
    const alt = pending.alternatives.find((a) => a.platformUserId === chosenUserId);
    if (alt) {
      platformUserId = alt.platformUserId;
      handle = alt.handle;
      displayName = alt.displayName ?? null;
    }
  }

  const severe = pending.warnings.filter((w) => w.severe);
  const warningSummary = severe.length > 0 ? severe.map((w) => w.message).join(' ') : null;

  const accountRows = await query<{ id: string }>(
    `insert into social_accounts
       (product_id, platform, persona, handle, platform_user_id, display_name, avatar_url,
        follower_count, capability_state, access_token_enc, refresh_token_enc,
        token_expires_at, scopes, identity_confirmed_at, identity_warning,
        duplicate_identity_ack, last_error)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'pending_auth',$9,$10,$11,$12,now(),$13,$14,null)
     on conflict (product_id, platform, persona) do update
       set handle = excluded.handle,
           platform_user_id = excluded.platform_user_id,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           follower_count = excluded.follower_count,
           access_token_enc = excluded.access_token_enc,
           refresh_token_enc = excluded.refresh_token_enc,
           token_expires_at = excluded.token_expires_at,
           scopes = excluded.scopes,
           identity_confirmed_at = now(),
           identity_warning = excluded.identity_warning,
           duplicate_identity_ack = excluded.duplicate_identity_ack,
           last_error = null
     returning id`,
    [
      pending.product_id,
      pending.platform,
      pending.persona,
      `@${handle.replace(/^@/, '')}`,
      platformUserId,
      displayName,
      pending.avatar_url,
      pending.follower_count,
      pending.access_token_enc,
      pending.refresh_token_enc,
      pending.token_expires_at,
      pending.scopes,
      warningSummary,
      acknowledgeDuplicate,
    ],
  );

  const accountId = accountRows[0]!.id;
  await query(`delete from pending_connections where id = $1`, [pendingId]);

  // Now that the account exists, ask the platform what it can actually do and
  // record the answer in the operator's language rather than the API's.
  const adapter = getAdapter(pending.platform);
  try {
    const report = await adapter.verifyCapabilities({
      id: accountId,
      platform: pending.platform,
      handle,
      platformUserId,
      capabilityState: 'pending_auth',
      tokens: {
        accessToken: openToken(pending.access_token_enc),
        refreshToken: pending.refresh_token_enc ? openToken(pending.refresh_token_enc) : null,
        expiresAt: pending.token_expires_at ? new Date(pending.token_expires_at) : null,
        scopes: pending.scopes,
        meta: pending.token_meta,
      },
      meta: pending.token_meta,
    });

    await query(
      `update social_accounts
          set capability_state = $2, capability_detail = $3, supported_formats = $4,
              last_verified_at = now()
        where id = $1`,
      [accountId, report.state, report.detail, report.supportedFormats],
    );
  } catch (err) {
    await query(
      `update social_accounts set last_error = $2, capability_state = 'error' where id = $1`,
      [accountId, (err as Error).message.slice(0, 500)],
    );
  }

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'account_confirmed', 'social_account', $1, $2)`,
    [
      accountId,
      {
        platform: pending.platform,
        persona: pending.persona,
        handle,
        confirmedWithWarnings: pending.warnings.map((w) => w.kind),
        operator: operator.email,
      },
    ],
  );

  revalidatePath('/accounts');
  redirect('/accounts?connected=' + encodeURIComponent(handle));
}

/** Throw the pending token away. The account is left exactly as it was. */
export async function discardConnection(formData: FormData): Promise<void> {
  await requireOperator();
  const pendingId = String(formData.get('pendingId'));
  await query(`delete from pending_connections where id = $1`, [pendingId]);
  revalidatePath('/accounts');
  redirect('/accounts?discarded=1');
}
