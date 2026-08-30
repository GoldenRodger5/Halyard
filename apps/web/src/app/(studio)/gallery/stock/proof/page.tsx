import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';
import { declineProof, setConsent, turnIntoPost } from './actions';

export const dynamic = 'force-dynamic';

interface ProofRow {
  id: string;
  source: string;
  source_id: string;
  source_url: string | null;
  author_display: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  posted_at: string | null;
  consent_state: string;
  status: string;
  content_item_id: string | null;
  fetched_at: string;
}

const SOURCE_LABEL: Record<string, string> = {
  app_store: 'App Store',
  play_store: 'Play Store',
  user_feedback: 'In-app feedback',
  beta_feedback: 'Beta feedback',
  comment: 'Comment',
  email: 'Email',
};

/**
 * Social proof. Milestone 45.
 *
 * Everything real people have said, and nothing else. "Turn into a post" quotes
 * the row verbatim and attaches it, so the proof gate can verify the quote
 * resolves — a testimonial that does not match a stored row fails QC and never
 * reaches the approval queue.
 */
export default async function SocialProofPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const product = await getCurrentProduct();
  const timeZone = product?.operator_timezone ?? 'UTC';
  const status = sp.status ?? 'new';

  const [proof, counts] = await Promise.all([
    query<ProofRow>(
      `select * from social_proof
        where product_id = $1 and ($2 = 'all' or status = $2)
        order by coalesce(posted_at, fetched_at) desc limit 100`,
      [product?.id ?? 'recipefix', status],
    ),
    query<{ status: string; n: string }>(
      `select status, count(*) as n from social_proof where product_id = $1 group by status`,
      [product?.id ?? 'recipefix'],
    ),
  ]);

  const total = counts.reduce((sum, row) => sum + Number(row.n), 0);

  return (
    <>
      <PageHeader
        title="Social proof"
        subtitle="Everything real people have actually said. A quote that does not resolve to one of these rows fails QC and never reaches the queue — fabricated praise is the one content failure that cannot be walked back."
      />

      {sp.error ? (
        <Card className="mb-6 border-danger/40 bg-danger/5 p-4">
          <p className="text-sm text-danger">{sp.error}</p>
        </Card>
      ) : null}

      <Card className="mb-6 p-3">
        <nav className="flex flex-wrap gap-2">
          {['new', 'used', 'declined', 'all'].map((value) => (
            <Link
              key={value}
              href={`/social-proof?status=${value}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                status === value
                  ? 'border-primary bg-primary/10 text-ink'
                  : 'border-line text-muted hover:bg-sunk hover:text-ink'
              }`}
            >
              {value}
              <span className="ml-2 tabular-nums text-muted">
                {value === 'all' ? total : (counts.find((c) => c.status === value)?.n ?? 0)}
              </span>
            </Link>
          ))}
        </nav>
      </Card>

      <SectionTitle hint="quoted verbatim or not at all">
        {status === 'all' ? 'Everything' : status}
      </SectionTitle>

      {proof.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="App Store reviews arrive through App Store Connect, and in-app feedback through the RecipeFix connector. Both need credentials — /settings/readiness says which are missing."
        />
      ) : (
        <div className="space-y-3">
          {proof.map((row) => {
            const canName =
              row.consent_state === 'granted' || row.consent_state === 'public_by_default';

            return (
              <Card key={row.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{SOURCE_LABEL[row.source] ?? row.source}</Badge>
                      {row.rating ? (
                        <span className="text-sm text-muted">
                          {'★'.repeat(row.rating)}
                          <span className="text-line">{'★'.repeat(5 - row.rating)}</span>
                        </span>
                      ) : null}
                      {row.author_display ? (
                        <span className="text-sm text-ink">{row.author_display}</span>
                      ) : null}
                      <Badge tone={canName ? 'good' : 'warn'}>
                        {row.consent_state.replace(/_/g, ' ')}
                      </Badge>
                      {row.status === 'used' ? <Badge tone="info">used</Badge> : null}
                    </div>

                    {row.title ? (
                      <p className="mt-2 font-medium text-ink">{row.title}</p>
                    ) : null}
                    <blockquote className="mt-1 border-l-2 border-line pl-3 text-sm leading-relaxed text-ink">
                      {row.body}
                    </blockquote>

                    <p className="mt-2 text-xs text-muted">
                      {row.posted_at
                        ? formatInOperatorTz(row.posted_at, timeZone, 'd MMM yyyy')
                        : `collected ${formatInOperatorTz(row.fetched_at, timeZone, 'd MMM')}`}
                      {row.source_url ? (
                        <>
                          {' · '}
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            source
                          </a>
                        </>
                      ) : null}
                      {row.content_item_id ? (
                        <>
                          {' · '}
                          <Link
                            href={`/queue/${row.content_item_id}`}
                            className="text-primary hover:underline"
                          >
                            the post
                          </Link>
                        </>
                      ) : null}
                    </p>

                    {!canName ? (
                      <p className="mt-2 text-xs text-muted">
                        Without consent this can still be quoted, but not attributed by name. A
                        private message is not a public quote.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-52">
                    {row.status === 'new' ? (
                      <>
                        <form action={turnIntoPost} className="flex gap-2">
                          <input type="hidden" name="id" value={row.id} />
                          <select
                            name="platform"
                            defaultValue="x"
                            className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                          >
                            {['x', 'instagram', 'threads', 'bluesky'].map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                          <button className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
                            Turn into a post
                          </button>
                        </form>

                        <form action={setConsent} className="flex gap-2">
                          <input type="hidden" name="id" value={row.id} />
                          <select
                            name="consent_state"
                            defaultValue={row.consent_state}
                            className="flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink"
                          >
                            <option value="not_asked">not asked</option>
                            <option value="granted">consent granted</option>
                            <option value="declined">consent declined</option>
                            <option value="public_by_default">public already</option>
                          </select>
                          <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                            Set
                          </button>
                        </form>

                        <form action={declineProof}>
                          <input type="hidden" name="id" value={row.id} />
                          <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                            Not usable
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
