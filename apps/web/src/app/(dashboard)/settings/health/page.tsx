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
import { allFlows } from '@halyard/core';
import { getHealth, getProducts } from '@/lib/queries';
import { formatInOperatorTz, formatRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** build pack §8 — a missing heartbeat is the only way to detect a dead worker. */
const HEARTBEAT_STALE_SECONDS = 15 * 60;
const QUEUE_DEPTH_ALERT = 50;

export default async function HealthPage() {
  const [health, products] = await Promise.all([getHealth(), getProducts()]);
  const timeZone = products[0]?.operator_timezone ?? 'UTC';

  const workerAlive = health.workers.some((w) => w.seconds_ago < HEARTBEAT_STALE_SECONDS);

  return (
    <>
      <PageHeader
        title="Health"
        subtitle="The four things that fail silently: a dead worker, a dead token, a backed-up queue, and renders that stopped succeeding."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={`p-4 ${workerAlive ? '' : 'border-danger/40 bg-danger/5'}`}>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Worker</p>
          <p className="mt-1 font-serif text-2xl text-ink">
            {workerAlive ? 'alive' : health.workers.length === 0 ? 'never seen' : 'missing'}
          </p>
          <p className="mt-1 text-xs text-muted">
            {health.workers.length === 0
              ? 'No heartbeat has ever been written.'
              : `Last beat ${formatRelative(health.workers[0]!.last_seen_at, timeZone)}`}
          </p>
        </Card>

        <Card
          className={`p-4 ${health.queue.queued > QUEUE_DEPTH_ALERT ? 'border-warn/40 bg-warn/5' : ''}`}
        >
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Queue depth</p>
          <p className="mt-1 font-serif text-2xl text-ink">{health.queue.queued}</p>
          <p className="mt-1 text-xs text-muted">
            {health.queue.running} running · alert above {QUEUE_DEPTH_ALERT}
          </p>
        </Card>

        <Card className={`p-4 ${health.queue.dead > 0 ? 'border-danger/40 bg-danger/5' : ''}`}>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Dead jobs</p>
          <p className="mt-1 font-serif text-2xl text-ink">{health.queue.dead}</p>
          <p className="mt-1 text-xs text-muted">{health.queue.failed_24h} failed in 24h</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Render success</p>
          <p className="mt-1 font-serif text-2xl text-ink">
            {health.renderSuccessRate === null
              ? '—'
              : `${(health.renderSuccessRate * 100).toFixed(0)}%`}
          </p>
          <p className="mt-1 text-xs text-muted">last 7 days</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>Accounts and token expiry</SectionTitle>
          <Card className="divide-y divide-line">
            {health.accounts.length === 0 ? (
              <p className="p-4 text-sm text-muted">No accounts connected.</p>
            ) : (
              health.accounts.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <PlatformDot platform={account.platform} />
                  <span className="w-24 text-ink">{PLATFORM_LABELS[account.platform]}</span>
                  <span className="text-muted">{account.persona}</span>
                  <Badge tone={CAPABILITY_TONE[account.capability_state] ?? 'neutral'}>
                    {CAPABILITY_LABEL[account.capability_state]}
                  </Badge>
                  <span className="ml-auto text-xs text-muted">
                    {account.token_expires_at
                      ? `expires ${formatInOperatorTz(account.token_expires_at, timeZone, 'd MMM HH:mm')}`
                      : 'no token'}
                  </span>
                </div>
              ))
            )}
          </Card>

          <div className="mt-6">
            <SectionTitle>Last publish per platform</SectionTitle>
            <Card className="divide-y divide-line">
              {health.lastPublishByPlatform.length === 0 ? (
                <p className="p-4 text-sm text-muted">Nothing has been published yet.</p>
              ) : (
                health.lastPublishByPlatform.map((row) => (
                  <div key={row.platform} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <PlatformDot platform={row.platform} />
                    <span className="text-ink">{PLATFORM_LABELS[row.platform] ?? row.platform}</span>
                    <span className="ml-auto text-muted">
                      {formatRelative(row.published_at, timeZone)}
                    </span>
                  </div>
                ))
              )}
            </Card>
          </div>
        </section>

        {/* ── What is actually deployed ──────────────────────────────────
            The product this markets ran sixteen days out of sync with its repo
            because nothing surfaced this. */}
        <section>
          <SectionTitle hint="baked in at build time, so it cannot drift">
            This build
          </SectionTitle>
          <Card className="p-4">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-[0.08em] text-muted">Commit</dt>
                <dd className="mt-1 font-mono text-sm text-ink">
                  {(process.env.HALYARD_RELEASE ?? 'unknown').slice(0, 12)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.08em] text-muted">Built</dt>
                <dd className="mt-1 text-sm text-ink">
                  {process.env.HALYARD_BUILT_AT
                    ? formatRelative(process.env.HALYARD_BUILT_AT, timeZone)
                    : 'unknown'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.08em] text-muted">Branch</dt>
                <dd className="mt-1 font-mono text-sm text-ink">
                  {process.env.HALYARD_BRANCH || 'local'}
                </dd>
              </div>
            </dl>
            {process.env.HALYARD_RELEASE === 'unknown' ? (
              <p className="mt-3 text-xs text-muted">
                No commit stamp. A regression cannot be mapped to a change from here — set
                SENTRY_RELEASE, or deploy somewhere that exposes the commit.
              </p>
            ) : null}
          </Card>
        </section>

        {/* ── Capture flows ───────────────────────────────────────────────
            These depend on live strings in a product that ships with no CI, so
            a broken selector is only ever found by running them. */}
        <section>
          <SectionTitle hint="verified against the live site, on every deploy and weekly">
            Capture flows
          </SectionTitle>
          <Card className="divide-y divide-line">
            {allFlows().map((flow) => {
              const run = health.flows.find((f) => f.flow_id === flow.id);
              const broken = run !== undefined && !run.ok;
              return (
                <div
                  key={flow.id}
                  className={`p-4 ${broken ? 'bg-danger/5' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{flow.title}</span>
                    {run === undefined ? (
                      <Badge tone="warn">never verified</Badge>
                    ) : run.ok ? (
                      <Badge tone="good">passing</Badge>
                    ) : (
                      <Badge tone="bad">broken</Badge>
                    )}
                    {run?.app_version ? (
                      <span className="font-mono text-xs text-muted">{run.app_version}</span>
                    ) : null}
                  </div>
                  <p className={`mt-1 text-sm ${broken ? 'text-danger' : 'text-muted'}`}>
                    {run
                      ? run.summary
                      : 'This flow has never been run against the live site, so nothing is known about whether its selectors still resolve.'}
                  </p>
                  {broken ? (
                    <p className="mt-1.5 text-xs text-muted">
                      Nothing is recorded while this is failing: capture verifies first and stops,
                      so no footage of an error state can reach a post. Re-running it is also how
                      it recovers — start one from{' '}
                      <a href="/assets" className="text-primary underline">
                        Assets
                      </a>{' '}
                      after fixing the selector in{' '}
                      <code>packages/core/src/capture/flows.ts</code>.
                    </p>
                  ) : null}
                  {run ? (
                    <p className="mt-1 text-xs text-muted">
                      {run.mode === 'verify' ? 'Verified' : 'Captured'}{' '}
                      {formatRelative(run.started_at, timeZone)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </Card>
        </section>

        <section>
          <SectionTitle hint="most recent first">Alerts</SectionTitle>
          <Card className="divide-y divide-line">
            {health.notifications.length === 0 ? (
              <p className="p-4 text-sm text-muted">Nothing has needed your attention.</p>
            ) : (
              health.notifications.map((notification) => (
                <div key={notification.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        notification.severity === 'critical'
                          ? 'bad'
                          : notification.severity === 'warning'
                            ? 'warn'
                            : 'neutral'
                      }
                    >
                      {notification.kind.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-sm font-medium text-ink">{notification.title}</span>
                    <span className="ml-auto text-xs text-muted">
                      {formatRelative(notification.created_at, timeZone)}
                    </span>
                  </div>
                  {notification.body ? (
                    <p className="mt-1 text-sm leading-relaxed text-muted">{notification.body}</p>
                  ) : null}
                </div>
              ))
            )}
          </Card>

          <div className="mt-6">
            <SectionTitle>Workers</SectionTitle>
            <Card className="divide-y divide-line">
              {health.workers.length === 0 ? (
                <p className="p-4 text-sm leading-relaxed text-muted">
                  No worker has ever checked in. Start the container with{' '}
                  <code className="rounded bg-sunk px-1">pnpm --filter @halyard/worker start</code>.
                </p>
              ) : (
                health.workers.map((worker) => (
                  <div key={worker.worker_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        worker.seconds_ago < HEARTBEAT_STALE_SECONDS ? 'bg-good' : 'bg-danger'
                      }`}
                    />
                    <span className="font-mono text-xs text-ink">{worker.worker_id}</span>
                    <span className="ml-auto text-muted">
                      {formatRelative(worker.last_seen_at, timeZone)}
                    </span>
                  </div>
                ))
              )}
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}
