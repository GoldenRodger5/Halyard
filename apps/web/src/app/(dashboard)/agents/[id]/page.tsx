import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, KeyValue, PageHeader, SectionTitle } from '@halyard/ui';
import { agentById } from '@halyard/core';
import { getAgentRunsFor } from '@/lib/agentQueries';
import { getProducts } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { CapabilityPill } from '@/components/CapabilityPill';

export const dynamic = 'force-dynamic';

/** The full execution contract for one agent, plus its run history. */
export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = agentById(id);
  if (!contract) notFound();

  const [runs, products] = await Promise.all([getAgentRunsFor(id), getProducts()]);
  const tz = products[0]?.operator_timezone ?? 'UTC';

  return (
    <>
      <PageHeader title={contract.name} subtitle={contract.purpose} />
      <Link href="/agents" className="mb-4 inline-block text-sm text-muted hover:text-ink">
        ← All agents
      </Link>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle>Contract</SectionTitle>
            <div className="space-y-2 text-sm">
              <KeyValue label="Implementation">
                <code className="text-xs">{contract.implementation}</code>
              </KeyValue>
              <KeyValue label="Expected callers">
                {contract.expectedCallers.length === 0 ? (
                  <span className="text-muted">
                    none declared — this agent is a tracked orphan
                  </span>
                ) : (
                  <ul className="space-y-0.5">
                    {contract.expectedCallers.map((c) => (
                      <li key={c}>
                        <code className="text-xs">{c}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </KeyValue>
              <KeyValue label="Downstream consumer">
                {contract.downstreamConsumer ?? (
                  <span className="text-muted">nothing consumes this</span>
                )}
              </KeyValue>
              <KeyValue label="Tools">
                {contract.tools.length > 0 ? contract.tools.join(', ') : '—'}
              </KeyValue>
              <KeyValue label="Attribution">
                {contract.runtimeAttribution === 'prompt_version'
                  ? `prompt version: ${contract.promptVersions.join(', ')}`
                  : 'recorded explicitly — does not go through the LLM seam'}
              </KeyValue>
              <KeyValue label="Retries / timeout">
                {contract.retries} / {contract.timeoutMs ? `${contract.timeoutMs} ms` : 'inherits'}
              </KeyValue>
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle hint={`${runs.length} shown`}>Runs</SectionTitle>
            {runs.length === 0 ? (
              <p className="text-sm text-muted">
                No recorded execution. A caller existing is not proof that it ran.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {runs.map((run) => (
                  <div key={run.run_id} className="py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-muted">{formatInOperatorTz(run.started_at, tz)}</span>
                      <Badge tone={run.status === 'succeeded' ? 'good' : 'bad'}>{run.status}</Badge>
                    </div>
                    {run.error ? <p className="mt-1 text-xs text-bad">{run.error}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle>State</SectionTitle>
            <CapabilityPill state={contract.declaredStatus} />
            {contract.statusNote ? (
              <p className="mt-2 text-sm text-muted">{contract.statusNote}</p>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              This is the contract&apos;s declared status. The observed state comes from the
              Auditor and is shown on the overview.
            </p>
          </Card>

          <Card className="p-4">
            <SectionTitle>Input</SectionTitle>
            <dl className="space-y-1 text-xs">
              {Object.entries(contract.inputSchema).map(([key, type]) => (
                <div key={key}>
                  <dt className="text-ink">{key}</dt>
                  <dd className="text-muted">{type}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-4">
            <SectionTitle>Output</SectionTitle>
            <dl className="space-y-1 text-xs">
              {Object.entries(contract.outputSchema).map(([key, type]) => (
                <div key={key}>
                  <dt className="text-ink">{key}</dt>
                  <dd className="text-muted">{type}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-4">
            <SectionTitle>Acceptance tests</SectionTitle>
            {contract.acceptanceTests.length === 0 ? (
              <p className="text-sm text-muted">None. This path is not covered.</p>
            ) : (
              <ul className="space-y-0.5 text-xs text-muted">
                {contract.acceptanceTests.map((t) => (
                  <li key={t}>
                    <code>{t}</code>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
