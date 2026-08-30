/**
 * §368. What each platform allows, and what a review unlocks.
 *
 * All of this lived at the bottom of the connection screen: the review-gate
 * table, the full capability matrix, the platform-strategy notes and the
 * browser-profile rule, underneath eight account cards per persona. That screen
 * came to eight thousand pixels, and none of this answers the question somebody
 * opens it with — *is this connected, and if not, why not?*
 *
 * It is reference. You read it when deciding whether a platform is worth the
 * review, or when a capability turns out not to be there. Neither is something
 * you do while connecting an account, so it is one click away and named for
 * what it tells you.
 *
 * Nothing was rewritten in the move. The tables, the wording and the data all
 * come from the same places they always did — `REVIEW_GATES`, the adapters'
 * own constraints, and the probes — because the problem was where they were,
 * not what they said.
 */
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
  REVIEW_GATES,
  allAdapters,
  type ProviderCapabilities,
} from '@halyard/core';
import {
  getAccountObservations,
  getRecentProbes,
  resolveForAccount,
  strategyView,
  type StrategyView,
} from '@/lib/capabilityQueries';
import { CapabilityPanel } from '../CapabilityPanel';
import { getAllAccounts, type AccountRow } from '@/lib/queries';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function PlatformRulesPage() {
  const adapters = allAdapters();
  const [accounts, provider] = await Promise.all([
    getAllAccounts(),
    query<{ capabilities: ProviderCapabilities }>(
      `select capabilities from provider_capabilities where provider = 'blotato'`,
    ),
  ]);
  const capabilities = provider[0]?.capabilities ?? null;

  const probes = await getRecentProbes();
  /* One account per platform is enough: the transport observation is shared. */
  const seenPlatforms = new Map<string, AccountRow>();
  for (const account of accounts) {
    if (!seenPlatforms.has(account.platform)) seenPlatforms.set(account.platform, account);
  }
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
        title="Platform rules"
        subtitle="What every platform allows before a review, what a review unlocks, and how long it takes. Read this when deciding whether a platform is worth submitting for, or when a capability turns out not to be there."
      />

      <div className="mb-6">
        <Link href="/master" className="text-sm text-primary underline">
          Back to accounts
        </Link>
      </div>

      <PageHeader
        title="Platform rules"
        subtitle="What every platform allows before a review, what a review unlocks, and how long it takes. Read this when deciding whether a platform is worth submitting for."
      />

      <div className="mb-6">
        <Link href="/master" className="text-sm text-primary underline">
          Back to accounts
        </Link>
      </div>

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
