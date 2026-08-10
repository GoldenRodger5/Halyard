import Link from 'next/link';
import { Badge, Card, PageHeader, SectionTitle } from '@halyard/ui';
import { assessReadiness, sentryConfig, summarise, type CheckState } from '@halyard/core';
import { getCurrentProduct } from '@/lib/queries';
import { one, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TONE: Record<CheckState, 'good' | 'warn' | 'bad' | 'neutral'> = {
  pass: 'good',
  warn: 'warn',
  fail: 'bad',
  blocked: 'neutral',
};

const MARK: Record<CheckState, string> = { pass: '✓', warn: '!', fail: '✗', blocked: '·' };

/**
 * Readiness. Milestone 47 Part B.
 *
 * One screen answering one question: can this run unattended tomorrow? Every
 * red row says what to do about it, because a failure with no instruction is
 * only an accusation.
 */
export default async function ReadinessPage() {
  const product = await getCurrentProduct();

  const [onboarding, accounts, worker, jobs, renders, flows, pipeline, attribution, settings] =
    await Promise.all([
      product
        ? one<{
            step_ingest_done: boolean;
            step_voice_done: boolean;
            step_calibration_done: boolean;
            step_templates_done: boolean;
            step_accounts_done: boolean;
            calibration_reviewed: number;
            calibration_target: number;
          }>('select * from onboarding_state where product_id = $1', [product.id])
        : Promise.resolve(null),
      query<{
        platform: string;
        persona: string;
        capability_state: string;
        has_token: boolean;
        identity_confirmed: boolean;
        expires_in_days: number | null;
        last_self_test_ok: boolean | null;
      }>(
        `select platform, persona, capability_state,
                (access_token_enc is not null) as has_token,
                (identity_confirmed_at is not null) as identity_confirmed,
                case when token_expires_at is null then null
                     else floor(extract(epoch from token_expires_at - now()) / 86400)::int end
                  as expires_in_days,
                last_self_test_ok
           from social_accounts`,
      ),
      one<{ seconds_ago: number | null }>(
        `select extract(epoch from now() - max(last_seen_at))::int as seconds_ago
           from worker_heartbeats`,
      ),
      one<{ queued: string; dead: string }>(
        `select count(*) filter (where status = 'queued') as queued,
                count(*) filter (where status = 'dead') as dead
           from jobs`,
      ),
      one<{ total: string; done: string }>(
        `select count(*) as total, count(*) filter (where status = 'done') as done
           from renders where created_at > now() - interval '7 days'`,
      ),
      query<{ flow_id: string; ok: boolean }>(
        `select distinct on (flow_id) flow_id, ok from capture_runs
          order by flow_id, started_at desc`,
      ),
      one<{ pending: string }>(
        `select count(*) as pending from content_items where status = 'pending_approval'`,
      ),
      one<{ stamped: string; rows: string; clicks: string }>(
        `select (select count(*) from content_items
                  where final_link_url is not null and status = 'published') as stamped,
                (select count(*) from attribution) as rows,
                (select count(*) from link_clicks) as clicks`,
      ),
      one<{ publishing_enabled: boolean }>(
        'select publishing_enabled from settings where id = true',
      ),
    ]);

  const totalRenders = Number(renders?.total ?? 0);
  const sentry = sentryConfig('web');

  const sections = assessReadiness({
    product: product
      ? {
          id: product.id,
          name: product.name,
          briefLength: (product.brief_markdown ?? product.brief_summary ?? '').length,
          hasDestinations: Boolean(
            (product as unknown as { destinations?: Record<string, string> }).destinations?.web,
          ),
          hasShareTemplate: Boolean(
            (product as unknown as { destinations?: Record<string, string> }).destinations
              ?.share_url_template,
          ),
          connectorType: product.connector_type,
          connectorReachable: null,
          brandTokensSet: Object.keys(product.brand_tokens ?? {}).length > 0,
        }
      : null,
    onboarding: onboarding
      ? {
          ingestDone: onboarding.step_ingest_done,
          voiceDone: onboarding.step_voice_done,
          calibrationDone: onboarding.step_calibration_done,
          templatesDone: onboarding.step_templates_done,
          accountsDone: onboarding.step_accounts_done,
          calibrationReviewed: onboarding.calibration_reviewed,
          calibrationTarget: onboarding.calibration_target,
        }
      : null,
    accounts: accounts.map((a) => ({
      platform: a.platform,
      persona: a.persona,
      capabilityState: a.capability_state,
      hasToken: a.has_token,
      identityConfirmed: a.identity_confirmed,
      tokenExpiresInDays: a.expires_in_days,
      lastSelfTestOk: a.last_self_test_ok,
    })),
    pipeline: {
      workerSeenSecondsAgo: worker?.seconds_ago ?? null,
      queuedJobs: Number(jobs?.queued ?? 0),
      deadJobs: Number(jobs?.dead ?? 0),
      renderSuccessRate: totalRenders === 0 ? null : Number(renders?.done ?? 0) / totalRenders,
      flowsVerified: flows.filter((f) => f.ok).length,
      flowsBroken: flows.filter((f) => !f.ok).length,
      flowsNeverRun: Math.max(0, 3 - flows.length),
      pendingApproval: Number(pipeline?.pending ?? 0),
    },
    attribution: {
      utmStampedPosts: Number(attribution?.stamped ?? 0),
      attributionRows: Number(attribution?.rows ?? 0),
      appStoreConfigured: Boolean(process.env.APP_STORE_KEY_ID),
      routedClicks: Number(attribution?.clicks ?? 0),
    },
    safety: {
      publishingEnabled: settings?.publishing_enabled ?? false,
      tokenEncryptionKeySet: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
      devUnauthenticated: process.env.HALYARD_DEV_UNAUTHENTICATED === '1',
      sentryConfigured: sentry !== null,
      release: sentry?.release ?? process.env.HALYARD_RELEASE ?? 'unknown',
    },
    env: process.env as Record<string, string | undefined>,
  });

  const verdict = summarise(sections);

  return (
    <>
      <PageHeader
        title="Readiness"
        subtitle="Whether this installation can be trusted to run unattended tomorrow. Not whether the code is finished — whether the setup is."
        actions={
          <Link href="/settings" className="text-sm text-primary underline">
            Settings
          </Link>
        }
      />

      <Card
        className={`mb-8 p-5 ${
          verdict.ready ? 'border-good/40 bg-good/5' : 'border-danger/40 bg-danger/5'
        }`}
      >
        <p className={`text-lg ${verdict.ready ? 'text-ink' : 'text-danger'}`}>
          {verdict.summary}
        </p>
        <p className="mt-1 text-sm text-muted">
          {verdict.failures} failing · {verdict.warnings} warnings ·{' '}
          {verdict.needsYou} that only you can resolve
        </p>
      </Card>

      <div className="space-y-8">
        {sections.map((section) => {
          const worst = section.checks.some((c) => c.state === 'fail')
            ? 'fail'
            : section.checks.some((c) => c.state === 'warn')
              ? 'warn'
              : 'pass';

          return (
            <section key={section.id}>
              <SectionTitle hint={section.why}>
                {section.title}{' '}
                <Badge tone={TONE[worst as CheckState]}>
                  {worst === 'pass' ? 'ready' : worst === 'warn' ? 'usable' : 'blocked'}
                </Badge>
              </SectionTitle>
              <Card className="divide-y divide-line">
                {section.checks.map((check) => (
                  <div key={check.id} className="flex gap-3 p-4">
                    <span
                      className={`mt-0.5 shrink-0 font-mono ${
                        check.state === 'pass'
                          ? 'text-good'
                          : check.state === 'warn'
                            ? 'text-warn'
                            : 'text-danger'
                      }`}
                    >
                      {MARK[check.state]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                        {check.label}
                        {check.needsYou && check.state !== 'pass' ? (
                          <Badge tone="neutral">needs you</Badge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">{check.detail}</p>
                      {check.fix ? (
                        <p className="mt-1.5 rounded-lg bg-sunk px-3 py-2 text-sm text-ink">
                          {check.fix}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
