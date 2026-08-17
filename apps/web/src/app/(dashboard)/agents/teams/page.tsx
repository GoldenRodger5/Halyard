import Link from 'next/link';
import { Card, PageHeader, SectionTitle } from '@halyard/ui';
import { getTeams } from '@/lib/agentQueries';
import { CapabilityPill } from '@/components/CapabilityPill';
import { AgentsNav } from '../AgentsNav';

export const dynamic = 'force-dynamic';

export default async function AgentTeamsPage() {
  const teams = await getTeams();

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Agents grouped by the team they belong to. A team is rolled up to its worst member, not its average."
      />
      <AgentsNav current="/agents/teams" />

      <div className="space-y-4">
        {teams.map((team) => (
          <Card key={team.team} className="p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <SectionTitle hint={`${team.agents.length} agent(s)`}>
                {team.team.replace(/_/g, ' ')}
              </SectionTitle>
              <CapabilityPill state={team.state} />
            </div>
            <div className="space-y-2">
              {team.agents.map(({ contract, observed, runs }) => (
                <div
                  key={contract.agentId}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-2 first:border-0 first:pt-0"
                >
                  <Link
                    href={`/agents/${contract.agentId}`}
                    className="text-sm text-ink hover:underline"
                  >
                    {contract.name}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {runs === 0 ? 'never run' : `${runs} run(s)`}
                    <CapabilityPill state={observed?.state ?? contract.declaredStatus} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
