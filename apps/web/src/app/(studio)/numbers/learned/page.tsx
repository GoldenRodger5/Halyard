/**
 * §388. Numbers ▸ Learned — beliefs computed from measured performance.
 *
 * The hardest room in the console to build honestly, because it is the one
 * where a plausible-looking number would be most useful and most wrong.
 *
 * A belief here is a row in `learned_insights`: a cohort mean, a baseline, a
 * lift and a sample size. It is computed, never written by a model. That is
 * gotcha 9's rule at its sharpest — `halyard_empirical` claims require real
 * observations, and they are zero everywhere by design until something has
 * actually published and been measured.
 *
 * So the empty state does not apologise. It says which link in the chain is
 * missing, because "no beliefs yet" and "the learning loop is broken" look
 * identical otherwise.
 */
import Link from 'next/link';
import { Label, Sheet } from '@halyard/ui/studio';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Belief {
  id: string;
  scope: string;
  platform: string | null;
  feature: string;
  feature_value: string | null;
  lift: number | null;
  sample_size: number | null;
  baseline_size: number | null;
  confidence: string | null;
  status: string;
  observation: string | null;
  recommendation: string | null;
}

interface Decision {
  id: string;
  objective: string | null;
  creation_mode: string | null;
  why_now: string | null;
  rationale: string | null;
  platform: string | null;
  account_handle: string | null;
  signal_summary: string | null;
  evidence: string[];
  preferred_treatments: string[];
  avoid_treatments: string[];
  publish_earliest: string | null;
  publish_latest: string | null;
  timing_reason: string | null;
  primary_metric: string | null;
  success_threshold: string | null;
  measurement_basis: string | null;
  review_after: string | null;
  confidence: string | null;
  content_item_id: string | null;
  content_status: string | null;
  created_at: string;
}

export default async function Learned() {
  const [beliefs, decisions, counts] = await Promise.all([
    query<Belief>(
      `select id, scope, platform, feature, feature_value, lift, sample_size, baseline_size,
              confidence, status, observation, recommendation
         from learned_insights
        where status <> 'retired'
        order by abs(coalesce(lift, 0)) desc
        limit 40`,
    ),
    query<Decision>(
      `select sd.id, sd.objective, sd.creation_mode, sd.why_now, sd.rationale,
              sd.platform, sa.handle as account_handle, s.summary as signal_summary,
              sd.evidence, sd.preferred_treatments, sd.avoid_treatments,
              sd.publish_earliest, sd.publish_latest, sd.timing_reason,
              sd.primary_metric, sd.success_threshold, sd.measurement_basis,
              sd.review_after, sd.confidence, sd.content_item_id,
              ci.status as content_status, sd.created_at
         from strategy_decisions sd
         left join social_accounts sa on sa.id = sd.account_id
         left join signals s on s.id = sd.signal_id
         left join content_items ci on ci.id = sd.content_item_id
        order by sd.created_at desc
        limit 20`,
    ),
    query<{ published: string; measured: string }>(
      `select (select count(*) from content_items where status = 'published')::text as published,
              (select count(*) from post_metrics)::text as measured`,
    ),
  ]);

  const published = Number(counts[0]?.published ?? 0);
  const measured = Number(counts[0]?.measured ?? 0);

  return (
    <div className="flex flex-col gap-3.5">
      <Sheet>
        <Label>Beliefs · computed from measured performance, never written by a model</Label>
        {beliefs.length === 0 ? (
          <div className="rounded-lg bg-sheet2 px-3 py-3">
            <div className="mb-1 text-[14px] font-semibold leading-snug">
              {/*
                Name the missing link, not the empty result. "No beliefs yet"
                and "the learning loop is broken" look identical from here, and
                only one of them is a problem.
              */}
              {published === 0
                ? 'No beliefs yet, and the reason is upstream: nothing has published, so nothing has been measured.'
                : measured === 0
                  ? `${published} published and none measured — the collection job has not run against them yet.`
                  : 'Measured, but not enough of it to believe anything.'}
            </div>
            <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-quiet">
              A belief needs a cohort and a baseline it can be compared against — roughly twenty
              posts in a category before a difference means anything. Below that a lift is noise
              wearing a number.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {beliefs.map((b) => (
              <li key={b.id} className="border-t border-rule2 py-3 first:border-t-0 first:pt-0">
                <div className="text-[13px] leading-snug">
                  {b.observation ?? `${b.feature}${b.feature_value ? ` = ${b.feature_value}` : ''}`}
                </div>
                <div className="mt-0.5 font-data text-[11px] text-quiet">
                  {[
                    b.platform ?? b.scope,
                    b.lift !== null ? `${b.lift > 0 ? '+' : ''}${Math.round(b.lift * 100)}%` : null,
                    b.sample_size !== null ? `n=${b.sample_size}` : null,
                    b.baseline_size !== null ? `baseline ${b.baseline_size}` : null,
                    b.confidence,
                    b.status,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {b.recommendation ? (
                  <div className="mt-1 text-[12px] leading-relaxed text-lit">{b.recommendation}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet>
        <Label>Decisions · recorded when made, not reconstructed after</Label>
        {decisions.length === 0 ? (
          <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-quiet">
            A strategy decision is recorded when the strategist chooses an objective for a piece.
            Nothing has reached that point. Reconstructing one afterwards from what happened would
            be a story about the past, not a record of a choice.
          </p>
        ) : (
          <ul className="flex flex-col">
            {decisions.map((d) => {
              const autonomy = d.evidence?.includes('autonomy:editorial_cycle');
              const mode = d.evidence?.find((value) => value.startsWith('mode:'))?.slice(5) ?? null;
              return (
                <li key={d.id} className="border-t border-rule2 py-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <div className="text-[13px] leading-snug">{d.objective ?? 'No objective set'}</div>
                    <div className="font-data text-[10px] uppercase tracking-wide text-quiet">
                      {[
                        autonomy ? 'autonomous' : d.creation_mode,
                        mode,
                        d.platform,
                        d.account_handle,
                        d.content_status ?? (d.content_item_id ? 'built' : 'planned'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  {d.signal_summary ? (
                    <div className="mt-1 rounded-md bg-sheet2 px-2.5 py-2 text-[12px] leading-relaxed text-lit">
                      Signal: {d.signal_summary}
                    </div>
                  ) : null}
                  {d.why_now ? (
                    <div className="mt-1 text-[12px] leading-relaxed text-quiet">{d.why_now}</div>
                  ) : null}
                  {d.rationale ? (
                    <div className="mt-0.5 text-[11.5px] leading-relaxed text-quiet">{d.rationale}</div>
                  ) : null}
                  {(d.preferred_treatments?.length ?? 0) > 0 || (d.avoid_treatments?.length ?? 0) > 0 ? (
                    <div className="mt-1 font-data text-[10.5px] text-quiet">
                      {d.preferred_treatments?.length
                        ? `prefer ${d.preferred_treatments.join(', ')}`
                        : null}
                      {d.preferred_treatments?.length && d.avoid_treatments?.length ? ' · ' : null}
                      {d.avoid_treatments?.length ? `avoid ${d.avoid_treatments.join(', ')}` : null}
                    </div>
                  ) : null}
                  <div className="mt-1 font-data text-[11px] text-quiet">
                    {[
                      d.primary_metric,
                      d.success_threshold,
                      d.confidence,
                      d.publish_earliest && d.publish_latest
                        ? `${new Date(d.publish_earliest).toLocaleString()} → ${new Date(d.publish_latest).toLocaleString()}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {d.timing_reason ? (
                    <div className="mt-0.5 text-[11px] leading-relaxed text-quiet">{d.timing_reason}</div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>

      <p className="text-xs leading-relaxed text-quiet">
        Nothing on this page is written by a model.{' '}
        <Link href="/numbers" className="text-lit underline">Performance</Link> is what these are
        computed from, and it is empty for the same reason.
      </p>
    </div>
  );
}
