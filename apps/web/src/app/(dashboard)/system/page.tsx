import { Card, PageHeader, SectionTitle } from '@halyard/ui';
import { getSystemHealth } from '@/lib/agentQueries';
import { HealthPill } from '@/components/CapabilityPill';
import { SystemNav } from '../agents/AgentsNav';

export const dynamic = 'force-dynamic';

export default async function SystemHealthPage() {
  const checks = await getSystemHealth();
  const unknown = checks.filter((c) => c.state === 'unknown');

  return (
    <>
      <PageHeader title="System health" subtitle="Measured, not asserted. Every check shows its value." />
      <SystemNav current="/system" />

      <Card className="divide-y divide-line">
        {checks.map((check) => (
          <div key={check.id} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
            <div>
              <p className="font-medium text-ink">{check.label}</p>
              <p className="text-sm text-muted">{check.detail}</p>
            </div>
            <HealthPill state={check.state}>{check.state}</HealthPill>
          </div>
        ))}
      </Card>

      {unknown.length > 0 ? (
        <Card className="mt-6 p-4">
          <SectionTitle>Why some checks say unknown</SectionTitle>
          <p className="text-sm text-muted">
            A check that cannot measure something reports <strong>unknown</strong> rather than
            <strong> ok</strong>. It is the same rule the quality gates follow: never call an
            unmeasured dimension passed. {unknown.length} check
            {unknown.length === 1 ? '' : 's'} currently {unknown.length === 1 ? 'has' : 'have'}
            {' '}nothing to measure.
          </p>
        </Card>
      ) : null}
    </>
  );
}
