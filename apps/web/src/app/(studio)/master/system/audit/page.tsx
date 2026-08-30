import { Badge, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { getLatestAudit } from '@/lib/agentQueries';
import { getProducts } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE = { error: 'bad', warning: 'warn', info: 'neutral' } as const;

export default async function SystemAuditPage() {
  const [{ run, findings }, products] = await Promise.all([getLatestAudit(), getProducts()]);
  const tz = products[0]?.operator_timezone ?? 'UTC';

  return (
    <>
      <PageHeader
        title="Audit"
        subtitle="What the Halyard Auditor observed, comparing the architecture against the source, the call graph, the job graph and execution records."
      />

      {!run ? (
        <EmptyState
          title="The Auditor has never run"
          body={
            <>
              Run <code className="rounded bg-sunk px-1">pnpm audit-halyard --runtime --persist</code>{' '}
              to produce a verdict. Until then this screen shows nothing rather than showing a
              green state it cannot support.
            </>
          }
        />
      ) : (
        <>
          <Card className="mb-6 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-sm text-ink">
                  {run.capabilities_audited} capabilities audited ·{' '}
                  {formatInOperatorTz(run.started_at, tz)}
                </p>
                <p className="text-sm text-muted">
                  {run.findings_error} error(s), {run.findings_warning} warning(s)
                  {run.duration_ms ? ` · ${run.duration_ms} ms` : ''}
                  {run.git_sha ? ` · ${run.git_sha.slice(0, 7)}` : ''}
                </p>
              </div>
              <Badge tone={run.findings_error > 0 ? 'bad' : run.findings_warning > 0 ? 'warn' : 'good'}>
                {run.findings_error > 0 ? 'errors' : run.findings_warning > 0 ? 'warnings' : 'clean'}
              </Badge>
            </div>
          </Card>

          {findings.length === 0 ? (
            <EmptyState title="No findings" body="The Auditor found nothing to report." />
          ) : (
            <Card className="divide-y divide-line">
              {findings.map((f) => (
                <div key={f.id} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-sm text-ink">{f.rule}</span>
                    <Badge tone={SEVERITY_TONE[f.severity as keyof typeof SEVERITY_TONE] ?? 'neutral'}>
                      {f.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    <span className="text-ink">{f.subject}</span> — {f.detail}
                  </p>
                  {Object.keys(f.evidence).length > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted">Evidence</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-sunk p-2 text-xs text-muted">
                        {JSON.stringify(f.evidence, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      <Card className="mt-6 p-4">
        <SectionTitle>What the Auditor is</SectionTitle>
        <p className="text-sm text-muted">
          Entirely deterministic. No model is asked whether a function has a caller, because that
          question has an exact answer a parser can compute. It reads the TypeScript AST rather
          than grepping — the previous hand audit was wrong twice, once by matching the wrong
          substring and once by counting build output as source.
        </p>
      </Card>
    </>
  );
}
