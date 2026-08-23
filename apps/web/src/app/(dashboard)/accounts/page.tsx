import Link from 'next/link';
import {
  Badge,
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
  getAdapter,
  describeGap,
  describePersona,
  tokenExpiryState,
  type PlatformCapability,
  type PlatformId,
  type ProviderCapabilities,
} from '@halyard/core';
import { getAllAccounts, type AccountRow } from '@/lib/queries';
import { accountStatus, APPROVAL_LABEL } from '@halyard/core';
import {
  getAccountObservations,
  getRecentProbes,
  resolveForAccount,
  strategyView,
  type StrategyView,
} from '@/lib/capabilityQueries';
import { CapabilityPanel } from './CapabilityPanel';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';
import {
  connectBluesky,
  disconnectAccount,
  runSelfTest,
  setCapabilityState,
  setTransport,
} from './actions';

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
  searchParams: Promise<{
    error?: string;
    connected?: string;
    discarded?: string;
    disconnected?: string;
  }>;
}) {
  const sp = await searchParams;
  const [products, accounts, pending, provider, settings] = await Promise.all([
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
    // The global kill switch. Read here so a card cannot say "ready to publish"
    // while publishing is paused everywhere.
    query<{ publishing_enabled: boolean }>(
      'select publishing_enabled from settings where id = true',
    ),
  ]);

  const adapters = allAdapters();
  const personalProduct = products.find((p) => p.kind === 'personal');
  const capabilities = provider[0]?.capabilities ?? null;
  const publishingEnabled = settings[0]?.publishing_enabled ?? false;

  /**
   * Capability, resolved per connected platform rather than stored.
   *
   * Computed at read time so it cannot drift from the account state, the probe
   * and the policy it derives from — the same reasoning P1 applied to fact
   * status. Every account for a platform shares the platform's transport
   * observation, so one account per platform is enough to show the picture.
   */
  const probes = await getRecentProbes();
  const seenPlatforms = new Map<string, AccountRow>();
  for (const account of accounts) {
    if (!seenPlatforms.has(account.platform)) seenPlatforms.set(account.platform, account);
  }
  /**
   * Account-scoped observations, loaded in one query for every account on the
   * page. These are the only route by which an engagement read can show as
   * verified rather than merely declared.
   */
  const observations = await getAccountObservations([...seenPlatforms.values()].map((a) => a.id));
  const capabilityViews = [...seenPlatforms.entries()].map(([platform, account]) =>
    resolveForAccount({
      platform: platform as Parameters<typeof strategyView>[0],
      accountId: account.id,
      accountState: account.capability_state as never,
      transport: capabilities?.platforms?.[platform as never] ?? null,
      provider: capabilities ? 'blotato' : null,
      transportVerifiedAt: capabilities?.verifiedAt ? new Date(capabilities.verifiedAt) : null,
      observations: observations.get(account.id) ?? [],
    }),
  );
  const strategies: StrategyView[] = [...seenPlatforms.keys()].map((platform) =>
    strategyView(platform as Parameters<typeof strategyView>[0]),
  );

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
      {/* Says what was erased and, just as importantly, what was not. */}
      {sp.disconnected ? (
        <Card className="mb-6 p-4">
          <p className="text-sm text-ink">{sp.disconnected}</p>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <Card className="mb-6 border-warn/40 bg-warn/5 p-4">
          <h2 className="text-sm font-medium text-ink">Waiting for you to confirm the right account</h2>
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
                  publishingEnabled={publishingEnabled}
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
              publishingEnabled={publishingEnabled}
            />
          ))}
        </div>
      </section>

      <SectionTitle hint="what unreviewed access actually gives you">Review gates</SectionTitle>
      <Card className="mb-8 overflow-x-auto" scrollLabel="Connected accounts">
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

      <CapabilityPanel views={capabilityViews} probes={probes} strategies={strategies} />

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
  publishingEnabled,
}: {
  platform: PlatformId;
  persona: 'brand' | 'founder';
  productId: string;
  timeZone: string;
  account?: AccountRow;
  unified: PlatformCapability | null;
  publishingEnabled: boolean;
}) {
  const preflight = PREFLIGHT[platform];
  const connectHref = `/api/oauth/${platform}/start?persona=${persona}&product=${productId}`;
  const expiry = tokenExpiryState(
    account?.token_expires_at ? new Date(account.token_expires_at) : null,
  );

  /**
   * One human-readable summary, derived from the state that already exists.
   *
   * The page previously showed four independent badges and left the operator to
   * combine them. `accountStatus` does that combining in one tested place, in
   * the same precedence the backend enforces — it reports the rules rather than
   * relaxing any of them.
   */
  const status = accountStatus({
    account: account
      ? {
          capabilityState: account.capability_state,
          hasToken: account.has_token,
          identityConfirmedAt: account.identity_confirmed_at,
          handle: account.handle,
        }
      : null,
    requiresPlatformReview: getAdapter(platform).constraints.requiresReviewForPublicPosting,
    publishingEnabled,
    tokenExpired: expiry.level === 'expired',
  });

  /** Whether connecting is the action this card is actually asking for. */
  const isPrimary = status.nextAction === 'connect' || status.nextAction === 'reconnect';

  /** Stored platform detail, minus the one sentence written in Halyard's own terms. */
  const detail =
    account?.capability_detail && !/marked live by the operator/i.test(account.capability_detail)
      ? account.capability_detail
      : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformDot platform={platform} />
            <span className="font-medium text-ink">{PLATFORM_LABELS[platform]}</span>
            <span className="text-sm text-muted">{account?.handle ?? 'no account yet'}</span>
          </div>

          {/* ── Status: one summary, then what it means ──────────────────── */}
          <div className="mt-3">
            <Badge tone={status.tone}>{status.label}</Badge>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">{status.explanation}</p>
          </div>

          {/* ── Capabilities: the three questions, answered separately ────
              Publishing and reading are different permissions, and platform
              approval is a different thing again — an account can be approved
              and still unable to publish. Collapsing them is what made the old
              badges unreadable. */}
          {/* ── The three questions, answered separately ─────────────────
              Account status, publishing and connection are different things,
              and the middle one is the trap: an account can be perfectly
              connected while the global switch means nothing will go out.
              "Ready to publish" must never imply a post leaves right now. */}
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted">Account status</dt>
              {/* Whether Halyard has a working connection — deliberately not a
                  restatement of the publish verdict, which is the row below. An
                  account can be soundly connected and still unable to publish. */}
              <dd className={status.canRead ? 'text-ink' : 'text-muted'}>
                {status.canRead ? '✓ Connected' : status.label}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted">Publishing</dt>
              <dd className={status.canPublish ? 'text-good' : 'text-muted'}>
                {status.canPublish
                  ? '✓ Ready'
                  : status.status === 'publishing_paused'
                    ? '⏸ Paused globally'
                    : status.status === 'awaiting_platform_approval'
                      ? 'Waiting for platform approval'
                      : 'Not available yet'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted">Connection</dt>
              <dd className={status.canRead ? 'text-ink' : 'text-muted'}>
                {status.canRead ? '✓ Working' : 'Not established'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted">Platform approval</dt>
              <dd className="text-ink">{APPROVAL_LABEL[status.approval]}</dd>
            </div>
          </dl>

          {/*
            * The platform-specific detail, which is where the genuinely useful
            * per-platform facts live — TikTok's inability to attach trending
            * audio, Pinterest's sandbox pins, YouTube's private uploads.
            *
            * One stored value is not like the others: an X row reads "Marked
            * live by the operator after platform review", which describes
            * Halyard's own bookkeeping rather than anything the operator can
            * act on, and `status.explanation` already says it properly. That
            * one sentence is suppressed here rather than edited in the
            * database, because the column is backend state this pass must not
            * touch.
            */}


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

          {/* ── Credential expiry ────────────────────────────────────────
              Prominent and actionable when it is close, and silent when it is
              not. This deliberately stays out of Advanced: a credential about
              to expire is the one piece of technical state an operator must
              act on, and burying it guarantees they find out from a failed
              post instead. */}
          {expiry.message ? (
            <div
              className={`mt-3 rounded-lg px-3 py-2 ${
                expiry.level === 'expired' ? 'bg-danger/10' : 'bg-warn/10'
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  expiry.level === 'expired' ? 'text-danger' : 'text-ink'
                }`}
              >
                {expiry.level === 'expired' ? 'Connection expired' : 'Connection expires soon'}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {expiry.message}
                {account?.token_expires_at && expiry.level !== 'expired'
                  ? ` Reconnect before ${formatInOperatorTz(account.token_expires_at, timeZone)} or scheduled posts may fail.`
                  : ''}
              </p>
            </div>
          ) : null}

          {account ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                Advanced connection details
              </summary>
              {/* Provider-specific facts, including cost per call on X. Kept
                  available — never deleted — but out of the primary hierarchy. */}
              {detail ? (
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">{detail}</p>
              ) : null}
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
            </details>
          ) : null}

          {account?.last_self_test_detail && account.last_self_test_ok === false ? (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              {account.last_self_test_detail}
            </p>
          ) : null}

          <details className="group mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-ink">
              What this account needs before connecting ({preflight.items.length})
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
              <p className="mt-2 text-[11px] text-muted">
                Needs these set up before connecting:{' '}
                <span className="font-mono">{preflight.credentials.join(', ')}</span>
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
              className={
                isPrimary
                  ? 'rounded-lg bg-primary px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-primary-dark'
                  : 'rounded-lg border border-line px-3 py-1.5 text-center text-sm text-muted hover:bg-sunk hover:text-ink'
              }
            >
              {account?.has_token ? 'Reconnect' : 'Connect'}
            </a>
          )}

          {/* The one thing worth doing when a connection is waiting on a person
              rather than on a platform. Links to the existing confirmation
              screen; no new behaviour. */}
          {status.nextAction === 'confirm_identity' && account ? (
            <a
              href={`/accounts/confirm/${account.id}`}
              className="rounded-lg bg-primary px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-primary-dark"
            >
              Confirm identity
            </a>
          ) : null}

          {/* Publishing is paused globally, so say where that is changed rather
              than leaving the operator to hunt for it. */}
          {status.nextAction === 'enable_publishing' ? (
            <a
              href="/settings"
              className="rounded-lg border border-line px-3 py-1.5 text-center text-sm text-muted hover:bg-sunk hover:text-ink"
            >
              Publishing settings
            </a>
          ) : null}

          {/* Nothing to do here but wait for the platform. The link goes to the
              screen that tracks those reviews with dates. */}
          {status.nextAction === 'complete_platform_approval' ? (
            <a
              href="/submissions"
              className="rounded-lg border border-line px-3 py-1.5 text-center text-sm text-muted hover:bg-sunk hover:text-ink"
            >
              Approval status
            </a>
          ) : null}

          {account?.has_token ? (
            <form action={runSelfTest}>
              <input type="hidden" name="id" value={account.id} />
              <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                Run connection test
              </button>
            </form>
          ) : null}

          {account && account.capability_state === 'draft_only' ? (
            <form action={setCapabilityState}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="state" value="live" />
              <button
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                title="Use this once the platform has approved public posting for this account."
              >
                Platform approved it
              </button>
            </form>
          ) : null}

          {account && account.capability_state === 'live' ? (
            <form action={setCapabilityState}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="state" value="disabled" />
              <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk">
                Disable account
              </button>
            </form>
          ) : null}

          {account && account.capability_state === 'disabled' ? (
            <form action={setCapabilityState}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="state" value="draft_only" />
              <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk">
                Re-enable account
              </button>
            </form>
          ) : null}

          {/* ── Transport ──────────────────────────────────────────────────
              Direct, or through the provider whose own app already passed
              the platform reviews. One dropdown and no redeploy, because the
              provider recommendation was made on incomplete information. */}
          {account?.has_token || account?.transport === 'unified' ? (
            <details className="border-t border-line pt-3">
              <summary className="cursor-pointer text-[11px] uppercase tracking-[0.08em] text-muted hover:text-ink">
                Advanced
              </summary>
            <form action={setTransport} className="mt-2 flex flex-col gap-1.5">
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
            </details>
          ) : null}

          {/* ── Disconnect ──────────────────────────────────────────────────
              The only irreversible button on this page, and the one the
              privacy policy describes. "Disable account" above changes a
              state; this destroys the credential. Kept behind a disclosure
              and a typed handle because the cards sit in a grid and the two
              words are easy to confuse. */}
          {account ? (
            <details className="border-t border-line pt-3">
              <summary className="cursor-pointer text-[11px] uppercase tracking-[0.08em] text-muted hover:text-danger">
                Disconnect
              </summary>
              <form action={disconnectAccount} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="id" value={account.id} />
                <p className="text-xs leading-relaxed text-muted">
                  Erases the stored credential for {account.handle} and everything observed through
                  it — permissions, formats, identity confirmation. Posts already published stay,
                  and still say they came from this account. This does <strong>not</strong> revoke
                  the permission at {PLATFORM_LABELS[platform]}; do that in its own app settings if
                  you want the grant gone too.
                </p>
                <input
                  name="confirmHandle"
                  required
                  autoComplete="off"
                  placeholder={`type ${account.handle} to confirm`}
                  className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs text-ink placeholder:text-muted"
                />
                <button className="rounded-lg border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/5">
                  Disconnect and erase credential
                </button>
              </form>
            </details>
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

  // A capability verified as absent is a different fact from one nobody has
  // checked, and only the first is a reason not to use this transport here.
  if (capability.altText === 'no') {
    parts.push(
      'This transport has no alt-text field for this platform, so every post routed through it goes out without alt text. The direct adapter carries it.',
    );
  }

  const unchecked = (['carousel', 'shortVideo', 'scheduling'] as const).filter(
    (k) => capability[k] === 'unknown',
  );
  const absent = (['carousel', 'shortVideo', 'scheduling'] as const).filter(
    (k) => capability[k] === 'no',
  );
  if (absent.length > 0) parts.push(`Not supported here: ${absent.join(', ')}.`);
  if (unchecked.length > 0) parts.push(`Not confirmed working: ${unchecked.join(', ')}.`);

  const gap = describeGap(platform, capability.metrics);
  if (gap) parts.push(gap);

  return parts.join(' ');
}
