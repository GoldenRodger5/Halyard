/**
 * §389. Master ▸ Platform rules — what a review actually unlocks.
 *
 * `REVIEW_GATES` has existed since the adapters were written and had no screen.
 * It is the answer to the question a new operator asks on day one — *why can it
 * not just post?* — and the answer is different per platform, measured in
 * weeks, and mostly out of anybody's hands.
 *
 * Read from the adapters rather than restated, so a platform whose review
 * status changes changes here too. A hand-maintained copy of this table would
 * be wrong within a month and nobody would notice.
 */
import { PLATFORM_IDS, REVIEW_GATES, getAdapter, type PlatformId } from '@halyard/core';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Sheet, Tally } from '@halyard/ui/studio';

export const dynamic = 'force-dynamic';

export default function PlatformRules() {
  const rows = PLATFORM_IDS.map((platform: PlatformId) => {
    const adapter = getAdapter(platform);
    const gate = REVIEW_GATES[platform];
    return {
      platform,
      gate,
      requiresReview: adapter.constraints.requiresReviewForPublicPosting,
      constraints: adapter.constraints,
    };
  });

  return (
    <div className="flex flex-col gap-3.5">
      <p className="max-w-[74ch] text-sm leading-relaxed text-quiet">
        Every platform except X and Bluesky gates public posting behind a manual review. This is
        what each one asks for and what you get before it is granted — read from the adapters
        themselves, so it cannot drift out of date.
      </p>

      {rows.map(({ platform, gate, requiresReview, constraints }) => (
        <Sheet key={platform}>
          <div className="flex flex-wrap items-center gap-2.5">
            <Tally state={requiresReview ? 'working' : 'ready'} on="light" size={8} />
            <span className="text-[15px] font-semibold">
              {PLATFORM_LABELS[platform] ?? platform}
            </span>
            <span className="ml-auto font-data text-[10px] uppercase tracking-[0.07em] text-quiet">
              {requiresReview ? `review required · ${howLong(gate?.typicalWeeks)}` : 'no review'}
            </span>
          </div>

          {gate ? (
            <dl className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-relaxed">
              <div>
                <dt className="inline font-data text-[9.5px] uppercase tracking-[0.1em] text-quiet">
                  Review{' '}
                </dt>
                <dd className="inline">{gate.review}</dd>
              </div>
              <div>
                <dt className="inline font-data text-[9.5px] uppercase tracking-[0.1em] text-quiet">
                  Until then{' '}
                </dt>
                <dd className="inline">{gate.unreviewedGives}</dd>
              </div>
            </dl>
          ) : null}

          {/*
            The constraints an operator hits before any review does: what the
            platform will carry at all. A brief refused for "TikTok carries no
            caption-only post" is explained here, not just refused there.
          */}
          <p className="mt-2 max-w-[74ch] font-data text-[11px] leading-relaxed text-quiet">
            {[
              `${constraints.maxChars.toLocaleString()} characters`,
              `${constraints.maxHashtags} hashtags`,
              `carries ${constraints.supportedFormats.join(', ')}`,
              constraints.costPerPostUsd
                ? `$${constraints.costPerPostUsd.withoutLink} a post, $${constraints.costPerPostUsd.withLink} with a link`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {/*
            Where the link is allowed to go. The most consequential per-platform
            rule after the review gate, and the one that silently destroys
            attribution when it is got wrong.
          */}
          <p className="mt-1 max-w-[74ch] text-[12px] leading-relaxed text-quiet">
            {constraints.linkNote}
          </p>
        </Sheet>
      ))}
    </div>
  );
}

/**
 * How long a platform review takes, in a sentence.
 *
 * `typicalWeeks` holds three different shapes — `'0'`, `'2–4 per submission'`,
 * and `'Assume rejection for an internal tool'` — so neither appending "weeks"
 * nor omitting it is right for all of them. The unit goes after the *number*,
 * where it belongs: "2–4 weeks per submission", not "2–4 per submission weeks".
 */
function howLong(typicalWeeks: string | undefined): string {
  if (!typicalWeeks) return 'an unknown time';
  if (typicalWeeks === '0') return 'no wait';
  const numeric = /^([\d]+(?:\s*[–-]\s*\d+)?)(.*)$/.exec(typicalWeeks);
  return numeric ? `${numeric[1]} weeks${numeric[2]}` : typicalWeeks;
}
