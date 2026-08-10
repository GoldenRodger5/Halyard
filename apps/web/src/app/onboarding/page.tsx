import Link from 'next/link';
import { Badge, Card, PageHeader } from '@halyard/ui';
import { getOnboarding, getProducts } from '@/lib/queries';
import { query } from '@/lib/db';
import { startCalibrationBatch, reviewCalibrationDraft, completeStep } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The first-run wizard. Build pack §2, and it is not optional.
 *
 * "Twenty drafts takes about thirty minutes and it is the single highest-leverage
 * half hour in the whole system. Do not skip it, and do not let it get deferred
 * to after the build."
 */
export default async function OnboardingPage() {
  const products = await getProducts();
  const product = products[0];
  if (!product) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Card className="p-8">
          <h1 className="font-serif text-3xl">No product yet</h1>
          <p className="mt-2 text-sm text-muted">Apply the seed to configure RecipeFix.</p>
        </Card>
      </main>
    );
  }

  const onboarding = await getOnboarding(product.id);
  const drafts = await query<{
    id: string;
    platform: string;
    body: string;
    verdict: string | null;
    reason: string | null;
  }>(
    `select ci.id, ci.platform, ci.body, cr.verdict, cr.reason
       from content_items ci
       left join calibration_reviews cr on cr.content_item_id = ci.id
      where ci.product_id = $1 and ci.status = 'draft'
        and ci.generation_meta ->> 'calibration' = 'true'
      order by ci.created_at`,
    [product.id],
  );

  const reviewed = drafts.filter((d) => d.verdict).length;
  const target = onboarding?.calibration_target ?? 20;

  const steps = [
    {
      key: 'ingest',
      title: 'Ingest the brief',
      done: onboarding?.step_ingest_done ?? false,
      body: 'Upload the product overview. Halyard compresses it into a summary that rides in every prompt and extracts brand tokens as editable defaults.',
      action: (
        <Link href={`/products/${product.id}`} className="text-sm text-primary underline">
          Paste the brief
        </Link>
      ),
    },
    {
      key: 'voice',
      title: 'Voice bootstrap',
      done: onboarding?.step_voice_done ?? false,
      body: 'Eight questions, then Halyard drafts both personas and you edit them directly. Who you write as, whose voice you like, what phrasing makes you cringe, what you should never be caught saying.',
      action: (
        <Link href={`/products/${product.id}`} className="text-sm text-primary underline">
          Answer and edit
        </Link>
      ),
    },
    {
      key: 'calibration',
      title: `Calibration batch — ${reviewed} of ${target} reviewed`,
      done: onboarding?.step_calibration_done ?? false,
      body: 'Twenty drafts with no intent to publish. Approve, reject, or edit each one, and every rejection asks why in one line. Those lines become the negative examples the copywriter is held to.',
      action:
        drafts.length === 0 ? (
          <form action={startCalibrationBatch}>
            <input type="hidden" name="productId" value={product.id} />
            <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
              Generate 20 drafts
            </button>
          </form>
        ) : null,
    },
    {
      key: 'templates',
      title: 'Template preview',
      done: onboarding?.step_templates_done ?? false,
      body: 'Render every image and video template against a real adaptation. Templates you reject are disabled rather than deleted.',
      action: (
        <Link href="/templates" className="text-sm text-primary underline">
          Review templates
        </Link>
      ),
    },
    {
      key: 'accounts',
      title: 'Connect accounts',
      done: onboarding?.step_accounts_done ?? false,
      body: 'OAuth all six, then submit the reviews the same day. Reviews are wall-clock time you cannot compress.',
      action: (
        <Link href="/accounts" className="text-sm text-primary underline">
          Connect
        </Link>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <PageHeader
        title="First run"
        subtitle="The riskiest failure mode is not a bug. It is Halyard working perfectly and producing content nobody wants. This is the guard against that, and daily generation does not start until it is done."
      />

      <ol className="space-y-4">
        {steps.map((step, index) => (
          <Card key={step.key} as="li" className={`p-5 ${step.done ? 'opacity-70' : ''}`}>
            <div className="flex items-start gap-4">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                  step.done ? 'bg-good text-white' : 'bg-sunk text-muted'
                }`}
              >
                {step.done ? '✓' : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-serif text-xl text-ink">{step.title}</h2>
                  {step.done ? <Badge tone="good">done</Badge> : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {step.action}
                  {!step.done && step.key !== 'calibration' ? (
                    <form action={completeStep}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="step" value={step.key} />
                      <button className="text-xs text-muted underline">Mark done</button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </ol>

      {drafts.length > 0 && !onboarding?.step_calibration_done ? (
        <section className="mt-10">
          <h2 className="mb-1 font-serif text-2xl text-ink">Calibration drafts</h2>
          <p className="mb-4 text-sm text-muted">
            Approve what sounds like you. Reject what does not, and say why in one line — that line
            is the whole point.
          </p>
          <ul className="space-y-3">
            {drafts.map((draft) => (
              <Card as="li" key={draft.id} className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="neutral">{draft.platform}</Badge>
                  {draft.verdict ? (
                    <Badge tone={draft.verdict === 'approved' ? 'good' : 'warn'}>
                      {draft.verdict}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed text-ink">{draft.body}</p>
                {draft.reason ? (
                  <p className="mt-2 text-xs italic text-muted">Rejected: {draft.reason}</p>
                ) : (
                  <form action={reviewCalibrationDraft} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={draft.id} />
                    <input type="hidden" name="productId" value={product.id} />
                    <input
                      name="reason"
                      placeholder="why not, in one line"
                      className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-sm"
                    />
                    <button
                      name="verdict"
                      value="approved"
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
                    >
                      Sounds like me
                    </button>
                    <button
                      name="verdict"
                      value="rejected"
                      className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger"
                    >
                      Not me
                    </button>
                  </form>
                )}
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-center text-sm text-muted">
        <Link href="/" className="text-primary underline">
          Back to the dashboard
        </Link>
      </p>
    </main>
  );
}
