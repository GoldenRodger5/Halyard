'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  PLATFORM_SCOPES,
  disconnectAccount as disconnectAccountCredential,
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

/**
 * Switch an account between the direct adapter and the unified provider.
 *
 * One dropdown, no redeploy — which is deliberate, because the provider
 * recommendation was made on incomplete information and the cost of it being
 * wrong should be exactly this.
 */
export async function setTransport(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const transport = String(formData.get('transport'));
  const providerAccountId = String(formData.get('providerAccountId') ?? '').trim();

  if (!['direct', 'unified'].includes(transport)) return;

  if (transport === 'unified' && !providerAccountId) {
    redirect(
      '/accounts?error=' +
        encodeURIComponent(
          'The unified transport needs the provider\u2019s account id. Find it in the provider dashboard, or run `pnpm verify-provider` which lists every connected account.',
        ),
    );
  }

  const capabilities = await one<{
    capabilities: { platforms?: Record<string, { publish?: string; altText?: string }> };
  }>(
    `select capabilities from provider_capabilities where provider = 'blotato'`,
  );
  const account = await one<{ platform: string }>(
    'select platform from social_accounts where id = $1',
    [id],
  );

  if (transport === 'unified') {
    const platformCapability = capabilities?.capabilities?.platforms?.[account?.platform ?? ''];
    const verified = platformCapability?.publish;
    if (verified !== 'yes') {
      // Unknown is not permission. The same rule the QC gates now follow.
      redirect(
        '/accounts?error=' +
          encodeURIComponent(
            `The unified provider has not been verified for ${account?.platform}. Run \`pnpm verify-provider\` before routing real posts through it.`,
          ),
      );
    }
  }

  await query(
    `update social_accounts
        set transport = $2,
            provider_account_id = case when $2 = 'unified' then $3 else null end
      where id = $1`,
    [id, transport, providerAccountId || null],
  );

  // Recorded so a later "why did alt text stop appearing" has an answer.
  const losesAltText =
    transport === 'unified' &&
    capabilities?.capabilities?.platforms?.[account?.platform ?? '']?.altText === 'no';

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'transport_changed', 'social_account', $1, $2)`,
    [id, { transport, losesAltText }],
  );

  revalidatePath('/accounts');
}

/**
 * Run the provider capability probe.
 *
 * **This is the ignition `verify-provider` never had.** The script has existed
 * since milestone 49 and `provider_capabilities` has never held a row, because
 * running it was something an operator had to remember — the same shape
 * `explore_product` had before P1.
 *
 * Deliberately a button rather than a schedule: a live probe spends real API
 * calls against a third party, so it stays a deliberate act. The handler
 * records an observation either way, including when the credential is absent —
 * an unavailable probe is a result, not a failure to hide.
 */
export async function probeProviderCapability(formData: FormData): Promise<void> {
  await requireOperator();
  const provider = String(formData.get('provider') ?? 'blotato');

  // Bare `on conflict do nothing`: the dedupe index is partial
  // (`dedupe_key is not null and status in ('queued','running')`), so naming the
  // column without repeating that predicate matches no index.
  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('verify_provider_capability', $1, 35, $2)
     on conflict do nothing`,
    [JSON.stringify({ provider }), `verify_provider_capability:${provider}:${new Date().toISOString().slice(0, 16)}`],
  );
  revalidatePath('/accounts');
}

/**
 * Erase every credential Halyard holds for an account.
 *
 * The action `/privacy` and `/data-deletion` describe. Until this existed the
 * strongest thing available was "Disable account", which changes one text
 * column and leaves a live, decryptable token in place — so those pages had to
 * be written to say Halyard could not erase a credential on request.
 *
 * Guarded by typing the handle rather than a confirm dialog, for the same
 * reason `git branch -D` wants the name: this is the only irreversible button
 * on the page, and the accounts sit next to each other in a grid. A mistyped
 * handle erases nothing and says so.
 */
export async function disconnectAccount(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const id = String(formData.get('id'));
  const typed = String(formData.get('confirmHandle') ?? '').trim();

  const account = await one<{ handle: string }>(
    'select handle from social_accounts where id = $1',
    [id],
  );
  if (!account) {
    redirect('/accounts?error=' + encodeURIComponent('That account no longer exists.'));
  }

  // Compared without the leading @ and without case, because the stored handle
  // carries one and the operator reading the card may not type it.
  const normalise = (value: string) => value.replace(/^@/, '').toLowerCase();
  if (normalise(typed) !== normalise(account.handle)) {
    redirect(
      '/accounts?error=' +
        encodeURIComponent(
          `Nothing was erased. To disconnect ${account.handle}, type its handle exactly.`,
        ),
    );
  }

  const outcome = await disconnectAccountCredential({
    query: async <T>(sql: string, params?: unknown[]) =>
      (await query(sql, params ?? [])) as T[],
    accountId: id,
    // A dev-bypass operator has no email; the id still identifies who acted.
    actor: operator.email ?? operator.id,
  });

  revalidatePath('/accounts');
  revalidatePath('/');

  /**
   * The message says what was erased *and* what was not. A disconnect that let
   * an operator believe the platform-side grant went with it would be the same
   * overclaim in the UI that the legal pages were corrected for.
   */
  const stillGranted =
    ' Halyard can no longer act as this account. This does not revoke the permission at the platform — do that in the platform’s own app settings if you want the grant gone too.';
  const providerNote = outcome.providerHoldsSeparateConnection
    ? ' This account was routed through the unified provider, which holds its own separate connection.'
    : '';

  redirect(
    '/accounts?disconnected=' +
      encodeURIComponent(
        `${outcome.handle ?? 'The account'}: stored credential erased.${
          outcome.pendingDiscarded > 0 ? ` ${outcome.pendingDiscarded} staged token discarded.` : ''
        }${stillGranted}${providerNote}`,
      ),
  );
}
