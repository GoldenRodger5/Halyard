import Link from 'next/link';
import {
  Badge,
  CAPABILITY_LABEL,
  CAPABILITY_TONE,
  Card,
  PLATFORM_LABELS,
  PageHeader,
  PlatformDot,
  SectionTitle,
} from '@halyard/ui';
import {
  BROWSER_PROFILE_RULE,
  PREFLIGHT,
  REVIEW_GATES,
  allAdapters,
  describeGap,
  describePersona,
  tokenExpiryState,
  type PlatformCapability,
  type PlatformId,
  type ProviderCapabilities,
} from '@halyard/core';
import { getAllAccounts, type AccountRow } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';
import { connectBluesky, runSelfTest, setCapabilityState, setTransport } from './actions';

export const dynamic = 'force-dynamic';

interface ProductRow {
  id: string;
  name: string;
  kind: 'product' | 'personal';
  operator_timezone: string;
}

/**
 * Accounts. Milestone 40.
 *
 * Grouped by product and then persona, because that is the shape of the model
 * rather than the shape of the platform list: brand accounts belong to exactly
 * one product, and the founder account is one identity shared across all of
 * them. The database enforces the same split with a routing constraint, so a
 * brand post cannot reach the founder account even if this screen were wrong.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; discarded?: string }>;
}) {
  const sp = await searchParams;
  const [products, accounts, pending, provider] = await Promise.all([
    query<ProductRow>(
      `select id, name, kind, operator_timezone from products
        where status <> 'archived'
        order by (kind = 'product') desc, created_at`,
    ),
    getAllAccounts(),
    query<{ id: string; handle: string; platform: string; persona: string; product_id: string }>(
      `select id, handle, platform, persona, product_id from pending_connections
        where expires_at > now() order by created_at desc`,
    ),
    query<{ capabilities: ProviderCapabilities }>(
      `select capabilities from provider_capabilities where provider = 'blotato'`,
    ),
  ]);

  const adapters = allAdapters();
  const personalProduct = products.find((p) => p.kind === 'personal');
  const capabilities = provider[0]?.capabilities ?? null;

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Every platform except X and Bluesky gates public posting behind a manual review. That is the single most important planning fact in this build, so it is stated here rather than remembered."
      />

      {sp.error ? (
        <Card className="mb-6 border-danger/40 bg-danger/5 p-4">
          <p className="text-sm text-danger">{sp.error}</p>
        </Card>
      ) : null}
      {sp.connected ? (
        <Card className="mb-6 border-good/40 bg-good/5 p-4">
          <p className="text-sm text-ink">
            Saved @{sp.connected}. Its capability state below says what it can actually do.
          </p>
        </Card>
      ) : null}
      {sp.discarded ? (
        <Card className="mb-6 p-4">
          <p className="text-sm text-muted">Token discarded. Nothing was saved.</p>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <Card className="mb-6 border-warn/40 bg-warn/5 p-4">
          <h2 className="text-sm font-medium text-ink">Waiting for you to confirm an identity</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {pending.map((p) => (
              <li key={p.id}>
                <Link href={`/accounts/confirm/${p.id}`} className="text-primary hover:underline">
                  @{p.handle} on {PLATFORM_LABELS[p.platform as PlatformId]} as the {p.persona}{' '}
                  account for {p.product_id}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            The token is sealed and held for thirty minutes. It is not an account until you confirm
            it.
          </p>
        </Card>
      ) : null}

      {/* ── One group per product, then the shared founder identity ───────── */}
      {products
        .filter((p) => p.kind === 'product')
        .map((product) => (
          <section key={product.id} className="mb-10">
            <SectionTitle hint="brand accounts, one per platform, scoped to this product">
              {product.name}
            </SectionTitle>
            <div className="space-y-3">
              {adapters.map((adapter) => (
                <AccountCard
                  key={`${product.id}-${adapter.platform}`}
                  platform={adapter.platform}
                  persona="brand"
                  productId={product.id}
                  timeZone={product.operator_timezone}
                  account={accounts.find(
                    (a) =>
                      a.product_id === product.id &&
                      a.platform === adapter.platform &&
                      a.persona === 'brand',
                  )}
                  unified={capabilities?.platforms?.[adapter.platform] ?? null}
                />
              ))}
            </div>
          </section>
        ))}

      <section className="mb-10">
        <SectionTitle hint={describePersona('founder')}>
          {personalProduct?.name ?? 'Founder'}
        </SectionTitle>
        <div className="space-y-3">
          {adapters.map((adapter) => (
            <AccountCard
              key={`founder-${adapter.platform}`}
              platform={adapter.platform}
              persona="founder"
              productId={personalProduct?.id ?? ''}
              timeZone={personalProduct?.operator_timezone ?? 'UTC'}
              account={accounts.find(
                (a) => a.persona === 'founder' && a.platform === adapter.platform,
              )}
              unified={capabilities?.platforms?.[adapter.platform] ?? null}
            />
          ))}
        </div>
      </section>

      <SectionTitle hint="what unreviewed access actually gives you">Review gates</SectionTitle>
      <Card className="mb-8 overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Review required</th>
              <th className="px-4 py-3 font-medium">What unreviewed access gives you</th>
              <th className="px-4 py-3 font-medium">Typical wait</th>
              <th className="px-4 py-3 font-medium">Link strategy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {adapters.map((adapter) => {
              const gate = REVIEW_GATES[adapter.platform];
              return (
                <tr key={adapter.platform}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-medium text-ink">
                      <PlatformDot platform={adapter.platform} />
                      {PLATFORM_LABELS[adapter.platform]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {adapter.constraints.requiresReviewForPublicPosting ? (
                      <Badge tone="warn">{gate.review}</Badge>
                    ) : (
                      <Badge tone="good">none</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{gate.unreviewedGives}</td>
                  <td className="px-4 py-3 text-muted">{gate.typicalWeeks}</td>
                  <td className="px-4 py-3 text-muted">
                    {adapter.constraints.linkStrategy.replace(/_/g, ' ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className="max-w-3xl text-sm text-muted">{BROWSER_PROFILE_RULE}</p>
    </>
  );
}

function AccountCard({
  platform,
  persona,
  productId,
  timeZone,
  account,
  unified,
}: {
  platform: PlatformId;
  persona: 'brand' | 'founder';
  productId: string;
  timeZone: string;
  account?: AccountRow;
  unified: PlatformCapability | null;
}) {
  const preflight = PREFLIGHT[platform];
  const connectHref = `/api/oauth/${platform}/start?persona=${persona}&product=${productId}`;
  const expiry = tokenExpiryState(
    account?.token_expires_at ? new Date(account.token_expires_at) : null,
  );

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformDot platform={platform} />
            <span className="font-medium text-ink">{PLATFORM_LABELS[platform]}</span>
            <span className="text-sm text-muted">{account?.handle ?? 'not connected'}</span>
            <Badge tone={CAPABILITY_TONE[account?.capability_state ?? 'pending_auth']!}>
              {CAPABILITY_LABEL[account?.capability_state ?? 'pending_auth']}
            </Badge>
            {account && !account.identity_confirmed_at ? (
              <Badge tone="warn">identity unconfirmed</Badge>
            ) : null}
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {account?.capability_detail ??
              (preflight.credentials.length > 0
                ? `Not connected. Needs ${preflight.credentials.join(' and ')} in the environment, then an OAuth round trip.`
                : 'Not connected. No developer app and no review — create an app password and paste it.')}
          </p>

          {account?.transport === 'unified' ? (
            <p className="mt-2 max-w-2xl rounded-lg bg-sunk px-3 py-2 text-xs leading-relaxed text-muted">
              {describeTransport(platform, unified)}
            </p>
          ) : null}

          {account?.identity_warning ? (
            <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-ink">
              Confirmed despite a warning: {account.identity_warning}
            </p>
          ) : null}

          {account?.last_error ? (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
              {account.last_error}
            </p>
          ) : null}

          {expiry.message ? (
            <p
              className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                expiry.level === 'expired' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-ink'
              }`}
            >
              {expiry.message}
            </p>
          ) : null}

          {account ? (
            <p className="mt-2 text-xs text-muted">
              {account.token_expires_at
                ? `Token expires ${formatInOperatorTz(account.token_expires_at, timeZone)}`
                : account.has_token
                  ? 'Token stored, no expiry reported.'
                  : 'No token stored.'}
              {account.last_verified_at
                ? ` · verified ${formatInOperatorTz(account.last_verified_at, timeZone, 'd MMM')}`
                : ''}
              {account.last_self_test_at
                ? ` · self-test ${account.last_self_test_ok ? 'passed' : 'failed'} ${formatInOperatorTz(account.last_self_test_at, timeZone, 'd MMM HH:mm')}`
                : ''}
              {account.last_published_at
                ? ` · last posted ${formatInOperatorTz(account.last_published_at, timeZone, 'd MMM')}`
                : ' · never posted'}
            </p>
          ) : null}

          {account?.last_self_test_detail && account.last_self_test_ok === false ? (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              {account.last_self_test_detail}
            </p>
          ) : null}

          <details className="group mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-ink">
              Before you connect — {preflight.items.length} things that must already be true
            </summary>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">
              {preflight.browserProfile}
            </p>
            <ol className="mt-2 max-w-2xl space-y-2 text-xs text-muted">
              {preflight.items.map((item) => (
                <li key={item.requirement} className="border-l-2 border-line pl-3">
                  <span className="text-ink">{item.requirement}</span>
                  {item.where ? <span className="block text-muted">{item.where}</span> : null}
                  <span className="block italic">Otherwise: {item.otherwise}</span>
                </li>
              ))}
            </ol>
            {preflight.credentials.length > 0 ? (
              <p className="mt-2 font-mono text-[11px] text-muted">
                Environment: {preflight.credentials.join(', ')}
              </p>
            ) : null}
          </details>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {platform === 'bluesky' ? (
            // No OAuth here. The operator pastes an app password, and everything
            // after that — identity fetch, confirmation, sealing — is the same.
            <form action={connectBluesky} className="flex w-56 flex-col gap-2">
              <input type="hidden" name="product" value={productId} />
              <input type="hidden" name="persona" value={persona} />
              <input
                name="handle"
                required
                placeholder="handle.bsky.social"
                defaultValue={account?.handle?.replace(/^@/, '') ?? ''}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
              />
              <input
                name="appPassword"
                type="password"
                required
                placeholder="app password"
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
              />
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                {account?.has_token ? 'Reconnect' : 'Connect'}
              </button>
            </form>
          ) : (
            <a
              href={connectHref}
              className="rounded-lg border border-line px-3 py-1.5 text-center text-sm text-muted hover:bg-sunk hover:text-ink"
            >
              {account?.has_token ? 'Reconnect' : 'Connect'}
            </a>
          )}

          {account?.has_token ? (
            <form action={runSelfTest}>
              <input type="hidden" name="id" value={account.id} />
              <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                Self-test
              </button>
            </form>
          ) : null}

          {account && account.capability_state === 'draft_only' ? (
            <form action={setCapabilityState}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="state" value="live" />
              <button
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                title="Flip to live once the platform review has landed."
              >
                Approval landed
              </button>
            </form>
          ) : null}

          {account && account.capability_state === 'live' ? (
            <form action={setCapabilityState}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="state" value="disabled" />
              <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk">
                Disable
              </button>
            </form>
          ) : null}

          {account && account.capability_state === 'disabled' ? (
            <form action={setCapabilityState}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="state" value="draft_only" />
              <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk">
                Re-enable
              </button>
            </form>
          ) : null}

          {/* ── Transport ──────────────────────────────────────────────────
              Direct, or through the provider whose own app already passed
              the platform reviews. One dropdown and no redeploy, because the
              provider recommendation was made on incomplete information. */}
          {account?.has_token || account?.transport === 'unified' ? (
            <form action={setTransport} className="flex flex-col gap-1.5 border-t border-line pt-3">
              <input type="hidden" name="id" value={account.id} />
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted">Transport</span>
              <select
                name="transport"
                defaultValue={account.transport}
                className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink"
              >
                <option value="direct">direct — our own app</option>
                <option value="unified" disabled={unified?.publish !== 'yes'}>
                  unified{unified?.publish === 'yes' ? '' : ' — unverified'}
                </option>
              </select>
              <input
                name="providerAccountId"
                defaultValue={account.provider_account_id ?? ''}
                placeholder="provider account id"
                className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs text-ink placeholder:text-muted"
              />
              <button className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:bg-sunk hover:text-ink">
                Switch transport
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/**
 * What the unified transport actually does for this platform, in the operator's
 * language rather than the provider's.
 *
 * Every sentence here is sourced from what `pnpm verify-provider` observed
 * against a real account. Where it observed nothing, this says so — an unchecked
 * capability is never described as working, and a provider that uploads to
 * drafts is never described as posting.
 */
function describeTransport(platform: PlatformId, capability: PlatformCapability | null): string {
  if (!capability || capability.publish === 'unknown') {
    return 'Routed through the unified provider, which has never been verified for this platform. Publishing will refuse until `pnpm verify-provider` has watched it work against a real account.';
  }
  if (capability.publish === 'no') {
    return `The unified provider cannot publish here. ${capability.notes.join(' ')}`;
  }

  const parts: string[] = [];
  if (capability.publishesPublicly === 'yes') {
    parts.push('Verified to post publicly through the provider\u2019s own reviewed app.');
  } else if (capability.publishesPublicly === 'no') {
    parts.push(
      'Verified to upload to drafts only \u2014 the post is created but you finish and publish it in the app. That is the intended path here for TikTok anyway, because no API can attach trending audio.',
    );
  } else {
    parts.push(
      'Publishing works, but whether it lands publicly or as a draft has not been observed. Treat it as a draft until it has been.',
    );
  }

  const thin = (['carousel', 'shortVideo', 'altText', 'scheduling'] as const).filter(
    (k) => capability[k] !== 'yes',
  );
  if (thin.length > 0) {
    parts.push(`Not confirmed working: ${thin.join(', ')}.`);
  }

  const gap = describeGap(platform, capability.metrics);
  if (gap) parts.push(gap);

  return parts.join(' ');
}
