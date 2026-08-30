/**
 * §389. Master ▸ The product — what Halyard believes, and what backs it.
 *
 * The Product Brain (P1) turns evidence into facts. Every fact here carries the
 * number of sources behind it and whether it has been verified, because a fact
 * with no source is an assertion and this system is not allowed to make those
 * about a product it is marketing.
 *
 * ## Contradictions are shown, not resolved silently
 *
 * When two pieces of evidence disagree the Brain records the contradiction and
 * its reconciliation rather than picking a winner quietly. That is the row an
 * operator most needs to see, so contradictions sort to the top.
 */
import Link from 'next/link';
import { Action, Label, Sheet, Tally, cx } from '@halyard/ui/studio';
import { Deeper } from '@/components/studio/Deeper';
import { getCategorySummary, getFacts } from '@/lib/brainQueries';
import { getCurrentProduct } from '@/lib/queries';
import { collectEvidence, rebuildBrain } from '@/app/(studio)/master/product/actions';

export const dynamic = 'force-dynamic';

export default async function TheProduct() {
  const product = await getCurrentProduct();

  if (!product) {
    return (
      <Sheet tone="lit">
        <Label>No product</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          Halyard markets a product, so it cannot do anything until it has one.
        </p>
      </Sheet>
    );
  }

  const [facts, summary] = await Promise.all([
    getFacts(product.id),
    getCategorySummary(product.id),
  ]);

  /* Contradictions first: they are the rows that need a person. */
  const ordered = [...facts].sort((a, b) => {
    const ca = a.contradicts ? 0 : 1;
    const cb = b.contradicts ? 0 : 1;
    return ca - cb || a.category.localeCompare(b.category);
  });

  const verified = facts.filter((f) => f.status === 'verified').length;
  const unsourced = facts.filter((f) => f.sourceCount === 0).length;

  return (
    <div className="flex flex-col gap-3.5">
      <Sheet tone={facts.length === 0 ? 'lit' : 'plain'}>
        <Label>{product.name}</Label>
        <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-quiet">
          {facts.length === 0 ? (
            <>
              The Brain has no facts about this product. Everything generated is downstream of
              what Halyard believes, so an empty Brain produces copy that would fit any product.
            </>
          ) : (
            <>
              {facts.length} facts, {verified} verified.
              {unsourced > 0
                ? ` ${unsourced} have no source behind them, which makes them assertions rather than facts.`
                : ' Every one has at least one source behind it.'}
            </>
          )}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <form action={collectEvidence}>
            <input type="hidden" name="productId" value={product.id} />
            <Action tone={facts.length === 0 ? 'brass' : 'ghost'} small>
              Collect evidence
            </Action>
          </form>
          <form action={rebuildBrain}>
            <input type="hidden" name="productId" value={product.id} />
            <Action tone="ghost" small>Rebuild from evidence</Action>
          </form>
        </div>
      </Sheet>

      {summary.length > 0 ? (
        <Sheet>
          <Label>By category</Label>
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-data text-[11px] text-quiet">
            {summary.map((c) => (
              <span key={c.category}>
                {c.category}{' '}
                <b className="font-medium text-sink">
                  {c.verified}/{c.total}
                </b>
              </span>
            ))}
          </div>
        </Sheet>
      ) : null}

      {ordered.length > 0 ? (
        <Sheet>
          <Label>What Halyard believes</Label>
          <ul className="flex flex-col">
            {ordered.map((fact) => (
              <li
                key={fact.id}
                className="border-t border-rule2 py-2.5 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Tally
                    state={
                      fact.contradicts
                        ? 'onair'
                        : fact.status === 'verified'
                          ? 'ready'
                          : fact.sourceCount === 0
                            ? 'onair'
                            : 'holding'
                    }
                    on="light"
                    size={6}
                  />
                  <span className="font-data text-[10px] uppercase tracking-[0.06em] text-quiet">
                    {fact.category}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">{fact.value}</span>
                  <span
                    className={cx(
                      'shrink-0 font-data text-[10px]',
                      fact.sourceCount === 0 ? 'text-onair' : 'text-quiet',
                    )}
                    title={
                      fact.sourceCount === 0
                        ? 'No source. This is an assertion, not a fact.'
                        : undefined
                    }
                  >
                    {fact.sourceCount} {fact.sourceCount === 1 ? 'source' : 'sources'}
                  </span>
                  {/*
                    Shown only when it is *not* safe to quote, because that is
                    the surprising case. A fact can be fine to show an operator
                    long before it is fine to put in a post, and a post carrying
                    one that is not is the mistake this flag exists to prevent.
                  */}
                  {!fact.safeToQuote ? (
                    <span
                      className="shrink-0 font-data text-[9px] uppercase tracking-[0.07em] text-parked"
                      title="Fine for you to read; not cleared to appear in a post."
                    >
                      not quotable
                    </span>
                  ) : null}
                </div>
                {fact.detail ? (
                  <p className="mt-0.5 pl-4 text-[11.5px] leading-relaxed text-quiet">
                    {fact.detail}
                  </p>
                ) : null}
                {/*
                  The contradiction and how it was reconciled, together. Showing
                  one without the other is how a resolved disagreement reads as
                  an unresolved one.
                */}
                {fact.contradicts ? (
                  <p className="mt-1 pl-4 text-[11.5px] leading-relaxed text-onair">
                    Contradicts: {fact.contradicts}
                    {fact.reconciliation ? ` — ${fact.reconciliation}` : ' — not yet reconciled.'}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      <p className="text-xs leading-relaxed text-quiet">
        Everything <Link href="/floor" className="text-lit underline">the floor</Link> writes is
        downstream of this.
      </p>
      <Deeper
        links={[
          { href: '/master/product/evidence', label: 'Evidence' },
          { href: '/master/product/contradictions', label: 'Contradictions' },
          { href: '/master/product/features', label: 'Feature claims' },
          { href: '/master/product/new', label: 'Add a product' },
          { href: '/master/product/edit', label: 'Edit this product' },
        ]}
      />
    </div>
  );
}
