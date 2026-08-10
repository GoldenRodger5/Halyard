import { Badge, Card, EmptyState, PLATFORM_LABELS, PageHeader, PlatformDot, SectionTitle } from '@halyard/ui';
import { REVIEW_GATES, type PlatformId } from '@halyard/core';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';
import { updateSubmission } from './actions';

export const dynamic = 'force-dynamic';

interface SubmissionRow {
  id: string;
  platform: string;
  review_name: string;
  status: string;
  submitted_at: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  requirements: string[];
  external_url: string | null;
  capability_state: string | null;
}

const TONE: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  not_started: 'neutral',
  preparing: 'info',
  submitted: 'warn',
  changes_requested: 'warn',
  approved: 'good',
  rejected: 'bad',
  abandoned: 'neutral',
};

/**
 * Platform review submissions. Milestone 43, item 3, and round 3 A.2.
 *
 * Every platform except X and Bluesky gates public posting behind a manual
 * review measured in weeks of wall-clock time nobody can compress. This screen
 * exists so "blocked on review" is a fact with a date attached rather than a
 * shrug — the difference between waiting and having forgotten.
 */
export default async function SubmissionsPage() {
  const product = await getCurrentProduct();
  const timeZone = product?.operator_timezone ?? 'UTC';

  const submissions = await query<SubmissionRow>(
    `select rs.*, sa.capability_state
       from review_submissions rs
       left join social_accounts sa
         on sa.product_id = rs.product_id and sa.platform = rs.platform and sa.persona = 'brand'
      where rs.product_id = $1
      order by
        case rs.status
          when 'changes_requested' then 0
          when 'submitted' then 1
          when 'preparing' then 2
          when 'not_started' then 3
          else 4 end,
        rs.platform`,
    [product?.id ?? 'recipefix'],
  );

  const waiting = submissions.filter((s) => s.status === 'submitted');
  const approved = submissions.filter((s) => s.status === 'approved');

  return (
    <>
      <PageHeader
        title="Review submissions"
        subtitle="Every platform except X and Bluesky gates public posting behind a manual review. These are weeks of wall-clock time that cannot be compressed, so the only thing that helps is starting them early and knowing exactly where each one stands."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-muted">Approved</p>
          <p className="mt-1 text-2xl tabular-nums text-ink">{approved.length}</p>
          <p className="mt-1 text-xs text-muted">of {submissions.length} platforms</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-muted">Waiting on a decision</p>
          <p className="mt-1 text-2xl tabular-nums text-ink">{waiting.length}</p>
          <p className="mt-1 text-xs text-muted">
            {waiting.length > 0 && waiting[0]!.submitted_at
              ? `oldest submitted ${formatInOperatorTz(waiting[0]!.submitted_at, timeZone, 'd MMM')}`
              : 'nothing submitted yet'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-muted">Not started</p>
          <p className="mt-1 text-2xl tabular-nums text-ink">
            {submissions.filter((s) => s.status === 'not_started').length}
          </p>
          <p className="mt-1 text-xs text-muted">each one is weeks of waiting once begun</p>
        </Card>
      </div>

      <SectionTitle hint="what each review actually asks for">Submissions</SectionTitle>

      {submissions.length === 0 ? (
        <EmptyState
          title="No reviews tracked"
          body="These are seeded on install for every platform that gates publishing. If this is empty, seed.sql did not run."
        />
      ) : (
        <div className="space-y-3">
          {submissions.map((submission) => {
            const gate = REVIEW_GATES[submission.platform as PlatformId];
            const daysWaiting = submission.submitted_at
              ? Math.floor(
                  (Date.now() - new Date(submission.submitted_at).getTime()) / 86_400_000,
                )
              : null;

            return (
              <Card key={submission.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformDot platform={submission.platform} />
                      <span className="font-medium text-ink">
                        {PLATFORM_LABELS[submission.platform] ?? submission.platform}
                      </span>
                      <Badge tone={TONE[submission.status] ?? 'neutral'}>
                        {submission.status.replace(/_/g, ' ')}
                      </Badge>
                      {submission.capability_state ? (
                        <span className="text-xs text-muted">
                          account is {submission.capability_state.replace(/_/g, ' ')}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-ink">{submission.review_name}</p>
                    {gate ? (
                      <p className="mt-0.5 text-xs text-muted">
                        Unreviewed access gives you: {gate.unreviewedGives}. Typical wait:{' '}
                        {gate.typicalWeeks}.
                      </p>
                    ) : null}

                    {submission.requirements.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {submission.requirements.map((requirement) => (
                          <li key={requirement} className="text-xs text-muted">
                            · {requirement}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <p className="mt-2 text-xs text-muted">
                      {submission.submitted_at
                        ? `Submitted ${formatInOperatorTz(submission.submitted_at, timeZone, 'd MMM')}` +
                          (daysWaiting !== null && !submission.decided_at
                            ? ` · ${daysWaiting} day${daysWaiting === 1 ? '' : 's'} waiting`
                            : '')
                        : 'Not submitted.'}
                      {submission.decided_at
                        ? ` · decided ${formatInOperatorTz(submission.decided_at, timeZone, 'd MMM')}`
                        : ''}
                    </p>

                    {submission.decision_notes ? (
                      <p className="mt-2 rounded-lg bg-sunk px-3 py-2 text-xs text-ink">
                        {submission.decision_notes}
                      </p>
                    ) : null}
                  </div>

                  <form action={updateSubmission} className="w-full shrink-0 space-y-2 sm:w-64">
                    <input type="hidden" name="id" value={submission.id} />
                    <select
                      name="status"
                      defaultValue={submission.status}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink"
                    >
                      {Object.keys(TONE).map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                    <input
                      name="external_url"
                      defaultValue={submission.external_url ?? ''}
                      placeholder="link to the submission"
                      className="w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
                    />
                    <textarea
                      name="decision_notes"
                      rows={2}
                      defaultValue={submission.decision_notes ?? ''}
                      placeholder="their words, not a paraphrase"
                      className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
                    />
                    <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                      Save
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
