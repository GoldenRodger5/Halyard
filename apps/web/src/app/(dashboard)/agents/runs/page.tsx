import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader } from '@halyard/ui';
import { getAgentRuns } from '@/lib/agentQueries';
import { getProducts } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { AgentsNav } from '../AgentsNav';

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  succeeded: 'good',
  running: 'info',
  failed: 'bad',
  refused: 'warn',
  skipped: 'neutral',
} as const;

export default async function AgentRunsPage() {
  const [runs, products] = await Promise.all([getAgentRuns(200), getProducts()]);
  const tz = products[0]?.operator_timezone ?? 'UTC';

  return (
    <>
      <PageHeader title="Agent runs" subtitle="Every recorded agent execution, newest first." />
      <AgentsNav current="/agents/runs" />

      {runs.length === 0 ? (
        <EmptyState
          title="No agent has ever run"
          body={
            <>
              This is a real finding, not a missing feature. Execution records are written at the
              LLM client seam, so any agent that reached a model would appear here. Nothing has,
              because nothing has been generated yet — publishing is off and no account is
              connected.
            </>
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {runs.map((run) => (
            <div key={run.run_id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/agents/${run.agent_id}`}
                  className="font-medium text-ink hover:underline"
                >
                  {run.agent_id}
                </Link>
                <Badge tone={STATUS_TONE[run.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                  {run.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                v{run.agent_version} · {run.trigger}
                {run.trigger_ref ? ` (${run.trigger_ref})` : ''} ·{' '}
                {formatInOperatorTz(run.started_at, tz)}
                {run.duration_ms !== null ? ` · ${run.duration_ms} ms` : ''}
                {run.cost_usd ? ` · $${Number(run.cost_usd).toFixed(4)}` : ''}
              </p>
              {run.error ? <p className="mt-1 text-sm break-words text-danger">{run.error}</p> : null}
              <p className="mt-1 text-xs text-muted">
                {run.downstream_consumed_at
                  ? `output used by ${run.downstream_consumer}`
                  : run.status === 'succeeded'
                    ? 'output not recorded as consumed'
                    : ''}
              </p>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
