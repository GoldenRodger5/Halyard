/**
 * §364. What Halyard has learned, and why it is currently nothing.
 *
 * Three subsystems write to this database and none had a screen:
 *
 * - `learned_insights` (§204) — beliefs computed from measured performance, at
 *   account, platform and global scope. Read by `concepts.ts` and `generate.ts`
 *   to steer what gets made.
 * - `strategy_decisions` (0049) — what was chosen, for whom, why now, what
 *   would count as success and when to look again.
 * - `account_intelligence` — what a window of published work says about an
 *   account's balance and its gaps.
 *
 * Every one of them is wired into the pipeline and invisible to the operator.
 * That is the failure this application keeps repeating in a new place: the
 * capability is real, complete, tested, and has no window.
 *
 * ## The empty state is the point
 *
 * All three are empty, and they are empty for one honest reason — nothing has
 * published, so nothing has been measured. Gotcha 9 says `null` means unmeasured
 * and `0` means measured zero, and the difference matters most exactly here: a
 * screen that renders "0 insights" beside a chart implies Halyard looked and
 * found nothing. It has not looked, because there is nothing to look at.
 *
 * So this screen says which of the two it is, every time, and names the thing
 * that has to happen before a number can appear. An operator should never have
 * to ask whether an empty panel is a bug.
 */
import Link from 'next/link';
import { Badge, Card, PageHeader, SectionTitle } from '@halyard/ui';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface InsightRow {
  id: string;
  scope: string;
  platform: string | null;
  feature: string;
  feature_value: string;
  lift: string | number | null;
  sample_size: number;
  baseline_size: number;
  status: string;
  confidence: string | number | null;
  observation: string | null;
  recommendation: string | null;
  created_at: string;
}

interface DecisionRow {
  id: string;
  platform: string | null;
  objective: string | null;
  creation_mode: string | null;
  why_now: string | null;
  audience: string | null;
  rationale: string | null;
  primary_metric: string | null;
  success_threshold: string | number | null;
  review_after: string | null;
  confidence: string | number | null;
  created_at: string;
}

interface IntelligenceRow {
  id: string;
  account_id: string;
  handle: string | null;
  platform: string | null;
  observed_at: string;
  window_size: number;
  summary: string | null;
  findings: unknown;
  gaps: unknown;
  exploration_share: string | number | null;
}

/**
 * How many posts have been measured at all.
 *
 * The single number every empty panel on this page depends on. Asked once and
 * shared, because three panels each saying "nothing measured" without agreeing
 * on the count would eventually disagree.
 */
async function measuredCount(): Promise<{ scored: number; published: number }> {
  const [scored, published] = await Promise.all([
    query<{ n: string }>('select count(*)::text as n from performance_scores'),
    query<{ n: string }>(
      "select count(*)::text as n from content_items where status = 'published'",
    ),
  ]);
  return { scored: Number(scored[0]?.n ?? 0), published: Number(published[0]?.n ?? 0) };
}

/**
 * The honest explanation for an empty panel.
 *
 * Distinguishes "has not run" from "ran and found nothing", which read
 * identically as a blank list and mean opposite things.
 */
function Nothing({
  what,
  published,
  scored,
  needs,
}: {
  what: string;
  published: number;
  scored: number;
  needs: string;
}) {
  if (published === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm leading-relaxed text-ink">
          No {what} yet, and the reason is upstream: nothing has published, so nothing has been
          measured.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This is an absent number rather than a low one. {needs}
        </p>
      </Card>
    );
  }
  if (scored === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm leading-relaxed text-ink">
          {published} {published === 1 ? 'post has' : 'posts have'} published and none has been
          scored, so there is nothing to learn from yet.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Metrics are collected on a delay and scored after that. If this stays at zero, the
          collection jobs are the place to look.
        </p>
        <Link href="/system/jobs" className="mt-3 inline-block text-sm text-primary underline">
          Jobs
        </Link>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <p className="text-sm leading-relaxed text-ink">
        {scored} {scored === 1 ? 'post has' : 'posts have'} been scored and no {what} has cleared
        its threshold yet.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{needs}</p>
    </Card>
  );
}

export default async function LearningPage() {
  const [{ scored, published }, insights, decisions, intelligence] = await Promise.all([
    measuredCount(),
    query<InsightRow>(
      `select id, scope, platform, feature, feature_value, lift, sample_size, baseline_size,
              status, confidence, observation, recommendation, created_at
         from learned_insights
        order by (status = 'validated') desc, abs(coalesce(lift, 0)) desc
        limit 50`,
    ),
    query<DecisionRow>(
      `select id, platform, objective, creation_mode, why_now, audience, rationale,
              primary_metric, success_threshold, review_after, confidence, created_at
         from strategy_decisions
        order by created_at desc
        limit 25`,
    ),
    query<IntelligenceRow>(
      `select ai.id, ai.account_id, sa.handle, sa.platform, ai.observed_at, ai.window_size,
              ai.summary, ai.findings, ai.gaps, ai.exploration_share
         from account_intelligence ai
         left join social_accounts sa on sa.id = ai.account_id
        order by ai.observed_at desc
        limit 20`,
    ),
  ]);

  return (
    <>
      <PageHeader
        title="What Halyard has learned"
        subtitle="Beliefs computed from measured performance, the decisions they informed, and what a window of published work says about each account. Nothing here is written by a model — every number can be recomputed from the cohorts stored beside it."
      />

      <div className="mt-6">
        <SectionTitle>Beliefs</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          Computed at account, platform and global scope. A later decision prefers the narrowest
          scope that has earned confidence, so an account with its own evidence is not steered by
          an average across accounts that behave differently.
        </p>
        {insights.length === 0 ? (
          <Nothing
            what="belief"
            published={published}
            scored={scored}
            needs="A belief needs a cohort and a baseline it can be compared against — roughly twenty posts in a category before a difference means anything."
          />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {insights.map((row) => (
              <li key={row.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm text-ink">
                    {row.feature.replace(/_/g, ' ')}: {row.feature_value}
                  </span>
                  <Badge
                    tone={
                      row.status === 'validated'
                        ? 'good'
                        : row.status === 'inferred'
                          ? 'warn'
                          : 'info'
                    }
                  >
                    {row.status}
                  </Badge>
                  <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                    {row.scope}
                    {row.platform ? ` · ${row.platform}` : ''}
                  </span>
                </div>
                {row.observation ? (
                  <p className="mt-1 text-sm leading-snug text-ink">{row.observation}</p>
                ) : null}
                {row.recommendation ? (
                  <p className="mt-0.5 text-sm leading-snug text-muted">{row.recommendation}</p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted">
                  {row.lift !== null ? `lift ${Number(row.lift).toFixed(2)} · ` : ''}
                  {row.sample_size} in cohort against {row.baseline_size} baseline
                  {row.confidence !== null
                    ? ` · confidence ${Number(row.confidence).toFixed(2)}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10">
        <SectionTitle>Decisions</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          What was chosen and why, recorded when it was decided rather than reconstructed
          afterwards — including what would count as success and when to come back and check.
        </p>
        {decisions.length === 0 ? (
          <Nothing
            what="decision"
            published={published}
            scored={scored}
            needs="A strategy decision is recorded when the strategist chooses an objective for a piece. Nothing has reached that point."
          />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {decisions.map((row) => (
              <li key={row.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm text-ink">{row.objective ?? 'No objective named'}</span>
                  {row.platform ? (
                    <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                      {row.platform}
                    </span>
                  ) : null}
                  {row.creation_mode ? (
                    <Badge tone="neutral">{row.creation_mode}</Badge>
                  ) : null}
                </div>
                {row.why_now ? (
                  <p className="mt-1 text-sm leading-snug text-ink">{row.why_now}</p>
                ) : null}
                {row.rationale ? (
                  <p className="mt-0.5 text-sm leading-snug text-muted">{row.rationale}</p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted">
                  {row.audience ? `for ${row.audience} · ` : ''}
                  {row.primary_metric
                    ? `measured by ${row.primary_metric}${
                        row.success_threshold !== null ? ` ≥ ${row.success_threshold}` : ''
                      }`
                    : 'no metric named'}
                  {row.review_after
                    ? ` · review after ${new Date(row.review_after).toISOString().slice(0, 10)}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10">
        <SectionTitle>Each account</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          What a window of published work says about an account&rsquo;s balance and what it has
          never tried.
        </p>
        {intelligence.length === 0 ? (
          <Nothing
            what="observation"
            published={published}
            scored={scored}
            needs="Account intelligence is built from a window of published posts on that account."
          />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {intelligence.map((row) => {
              const findings = Array.isArray(row.findings) ? row.findings : [];
              const gaps = row.gaps && typeof row.gaps === 'object' ? Object.entries(row.gaps) : [];
              return (
                <li key={row.id} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm text-ink">
                      {row.handle ?? 'Unknown account'}
                      {row.platform ? ` · ${row.platform}` : ''}
                    </span>
                    <span className="text-[11px] text-muted">
                      {row.window_size} {row.window_size === 1 ? 'post' : 'posts'} in the window
                    </span>
                  </div>
                  {row.summary ? (
                    <p className="mt-1 text-sm leading-snug text-ink">{row.summary}</p>
                  ) : null}
                  {findings.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                      {findings.slice(0, 6).map((finding, i) => (
                        <li key={i}>
                          {typeof finding === 'string' ? finding : JSON.stringify(finding)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {gaps.length > 0 ? (
                    <p className="mt-1 text-[11px] text-muted">
                      Never tried: {gaps.map(([k]) => k).join(', ')}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted">
                    observed {new Date(row.observed_at).toISOString().slice(0, 16).replace('T', ' ')}
                    {row.exploration_share !== null
                      ? ` · ${Math.round(Number(row.exploration_share) * 100)}% exploration`
                      : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
