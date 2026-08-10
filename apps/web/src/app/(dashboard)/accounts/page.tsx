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
import { PLATFORM_CLIENT_ENV, REVIEW_GATES, allAdapters } from '@halyard/core';
import { getAccounts, getCurrentProduct } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { setCapabilityState } from './actions';

export const dynamic = 'force-dynamic';

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const product = await getCurrentProduct((await searchParams).product);
  const accounts = await getAccounts(product?.id);
  const timeZone = product?.operator_timezone ?? 'UTC';

  const adapters = allAdapters();

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Every platform except X gates public posting behind a manual review. That is the single most important planning fact in this build, so it is stated here rather than remembered."
      />

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

      <SectionTitle hint="one row per platform per persona">Connections</SectionTitle>
      <div className="space-y-3">
        {adapters.flatMap((adapter) =>
          (['brand', 'founder'] as const).map((persona) => {
            const account = accounts.find(
              (a) => a.platform === adapter.platform && a.persona === persona,
            );
            const env = PLATFORM_CLIENT_ENV[adapter.platform];
            const connectHref = `/api/oauth/${adapter.platform}/start?persona=${persona}&product=${product?.id ?? ''}`;

            return (
              <Card key={`${adapter.platform}-${persona}`} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformDot platform={adapter.platform} />
                      <span className="font-medium text-ink">
                        {PLATFORM_LABELS[adapter.platform]}
                      </span>
                      <span className="text-sm text-muted">{account?.handle ?? 'not connected'}</span>
                      <Badge tone="neutral">{persona}</Badge>
                      <Badge tone={CAPABILITY_TONE[account?.capability_state ?? 'pending_auth']!}>
                        {CAPABILITY_LABEL[account?.capability_state ?? 'pending_auth']}
                      </Badge>
                    </div>

                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                      {account?.capability_detail ??
                        `Needs ${env.id} and ${env.secret} in the environment, then an OAuth round trip.`}
                    </p>

                    {account?.last_error ? (
                      <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
                        {account.last_error}
                      </p>
                    ) : null}

                    <p className="mt-2 text-xs text-muted">
                      {account?.token_expires_at
                        ? `Token expires ${formatInOperatorTz(account.token_expires_at, timeZone)}`
                        : 'No token stored.'}
                      {account?.last_verified_at
                        ? ` · verified ${formatInOperatorTz(account.last_verified_at, timeZone, 'd MMM')}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <a
                      href={connectHref}
                      className="rounded-lg border border-line px-3 py-1.5 text-center text-sm text-muted hover:bg-sunk hover:text-ink"
                    >
                      {account ? 'Reconnect' : 'Connect'}
                    </a>

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
                  </div>
                </div>
              </Card>
            );
          }),
        )}
      </div>
    </>
  );
}
