import { Card, EmptyState, PageHeader } from '@halyard/ui';
import { getAgentOverview } from '@/lib/agentQueries';
import { CapabilityPill } from '@/components/CapabilityPill';
import { AgentsNav } from '../AgentsNav';

export const dynamic = 'force-dynamic';

/**
 * Agent health: the ones that need attention, and why.
 *
 * Deliberately shows only the problems. A health screen listing everything is a
 * second copy of the overview, and the thing an operator needs from a health
 * screen is the short list.
 */
export default async function AgentHealthPage() {
  const agents = await getAgentOverview();

  const problems = agents.filter((a) => {
    const state = a.observed?.state ?? a.contract.declaredStatus;
    return state !== 'implemented_exercised' && state !== 'planned';
  });

  const failing = agents.filter((a) => a.failures > 0);
  const unconsumed = agents.filter((a) => a.runs > 0);

  return (
    <>
      <PageHeader
        title="Agent health"
        subtitle="What needs attention. Anything working is deliberately absent."
      />
      <AgentsNav current="/agents/health" />

      {problems.length === 0 ? (
        <EmptyState title="Nothing needs attention" body="Every registered agent is exercised." />
      ) : (
        <Card className="divide-y divide-line">
          {problems.map(({ contract, observed }) => (
            <div key={contract.agentId} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink">{contract.name}</span>
                <CapabilityPill
                  state={observed?.state ?? contract.declaredStatus}
                  declared={observed ? observed.declared_state : null}
                />
              </div>
              <p className="mt-1 text-sm text-muted">
                {observed?.reason ?? contract.statusNote ?? 'No reason recorded.'}
              </p>
              {contract.expectedCallers.length === 0 ? (
                <p className="mt-1 text-xs text-muted">
                  The contract declares no caller, so this is a tracked defect rather than a
                  surprise.
                </p>
              ) : null}
            </div>
          ))}
        </Card>
      )}

      {failing.length > 0 ? (
        <Card className="mt-6 p-4">
          <p className="text-sm font-medium text-ink">Recent failures</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {failing.map((a) => (
              <li key={a.contract.agentId}>
                {a.contract.name}: {a.failures} of {a.runs} run(s) failed
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {unconsumed.length === 0 ? (
        <Card className="mt-6 p-4">
          <p className="text-sm text-muted">
            No agent has run, so nothing can be reported about output consumption or failure rates
            yet. That is the honest state, not a gap in this screen.
          </p>
        </Card>
      ) : null}
    </>
  );
}
