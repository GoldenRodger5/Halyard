import { Badge, Card, PageHeader } from '@halyard/ui';
import { getVersions } from '@/lib/agentQueries';
import { AgentsNav } from '../AgentsNav';

export const dynamic = 'force-dynamic';

export default async function AgentVersionsPage() {
  const versions = await getVersions();
  const stale = versions.filter((v) => v.neverInvoked);

  return (
    <>
      <PageHeader
        title="Versions"
        subtitle="What the registry declares, against what has actually run."
      />
      <AgentsNav current="/agents/versions" />

      {stale.length > 0 ? (
        <Card className="mb-6 border-l-2 border-l-bad p-4">
          <p className="text-sm text-ink">
            {stale.length} agent{stale.length === 1 ? '' : 's'} declare a version that has never
            run.
          </p>
          <p className="mt-1 text-sm text-muted">
            The code shipped and the path reaching it did not. Invisible without this comparison,
            because the deploy succeeded and the tests passed.
          </p>
        </Card>
      ) : null}

      <Card className="divide-y divide-line">
        {versions.map((v) => (
          <div key={v.agentId} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
            <span className="text-sm text-ink">{v.agentId}</span>
            <span className="flex items-center gap-2 text-xs text-muted">
              declared v{v.declared}
              {v.seen.length === 0 ? (
                <Badge tone="neutral">never run</Badge>
              ) : v.neverInvoked ? (
                <Badge tone="bad">only v{v.seen.join(', v')} seen</Badge>
              ) : (
                <Badge tone="good">v{v.seen.join(', v')} seen</Badge>
              )}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}
