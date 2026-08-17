import Link from 'next/link';
import { Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { getAgentOverview } from '@/lib/agentQueries';
import { formatInOperatorTz } from '@/lib/format';
import { getProducts } from '@/lib/queries';
import { CapabilityPill } from '@/components/CapabilityPill';
import { AgentsNav } from './AgentsNav';

export const dynamic = 'force-dynamic';

export default async function AgentsOverviewPage() {
  const [agents, products] = await Promise.all([getAgentOverview(), getProducts()]);
  const tz = products[0]?.operator_timezone ?? 'UTC';

  const unaudited = agents.filter((a) => a.observed === null).length;
  const orphans = agents.filter(
    (a) => (a.observed?.state ?? a.contract.declaredStatus) === 'implemented_no_caller',
  ).length;
  const everRun = agents.filter((a) => a.runs > 0).length;

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="Every agent Halyard declares, and what the evidence says about it."
      />
      <AgentsNav current="/agents" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-2xl font-semibold text-ink">{agents.length}</p>
          <p className="text-sm text-muted">registered</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold text-ink">{everRun}</p>
          <p className="text-sm text-muted">have ever run</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold text-ink">{orphans}</p>
          <p className="text-sm text-muted">with no caller</p>
        </Card>
      </div>

      {unaudited > 0 ? (
        <Card className="mb-6 border-l-2 border-l-warn p-4">
          <p className="text-sm text-ink">
            {unaudited} agent{unaudited === 1 ? ' has' : 's have'} never been audited.
          </p>
          <p className="mt-1 text-sm text-muted">
            The state shown for those is what the contract <em>claims</em>, not what was observed.
            Run <code className="rounded bg-sunk px-1">pnpm audit-halyard --runtime --persist</code>{' '}
            to replace a claim with evidence.
          </p>
        </Card>
      ) : null}

      {agents.length === 0 ? (
        <EmptyState
          title="No agents registered"
          body="The registry in packages/core/src/agents/registry.ts is empty, which almost certainly means it failed to load rather than that Halyard has no agents."
        />
      ) : (
        <Card className="divide-y divide-line">
          {agents.map(({ contract, observed, runs, failures, lastRunAt }) => (
            <div key={contract.agentId} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/agents/${contract.agentId}`}
                  className="font-medium text-ink hover:underline"
                >
                  {contract.name}
                </Link>
                <CapabilityPill
                  state={observed?.state ?? contract.declaredStatus}
                  declared={observed ? observed.declared_state : null}
                />
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted">{contract.purpose}</p>
              <p className="mt-2 text-xs text-muted">
                {contract.team} · v{contract.version} ·{' '}
                {runs === 0 ? 'never run' : `${runs} run${runs === 1 ? '' : 's'}`}
                {failures > 0 ? `, ${failures} failed` : ''}
                {lastRunAt ? ` · last ${formatInOperatorTz(lastRunAt, tz)}` : ''}
              </p>
              {observed ? (
                <p className="mt-1 text-xs text-muted">{observed.reason}</p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Never audited — this is the contract&apos;s own claim.
                </p>
              )}
            </div>
          ))}
        </Card>
      )}

      <Card className="mt-6 p-4">
        <SectionTitle>How a state is decided</SectionTitle>
        <p className="text-sm text-muted">
          The Auditor derives every state from source code, the call graph and execution records.
          It never reads an agent&apos;s own declared status — a contract cannot talk itself green.
          Reaching <strong>exercised</strong> needs an implementation, a caller, a recorded run, a
          consumer that stamped the output, and a test.
        </p>
      </Card>
    </>
  );
}
