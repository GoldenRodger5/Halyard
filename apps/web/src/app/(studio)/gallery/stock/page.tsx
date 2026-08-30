/**
 * §386. Gallery ▸ Stock — everything a piece can be made out of.
 *
 * Four inventories that were four separate screens: media, sound, submissions
 * and social proof. They are one tab because an operator does not think about
 * them separately — the question is always "is there anything here to work
 * with, and is any of it a problem".
 *
 * ## Each section leads with the problem, not the count
 *
 * A count is reassuring and mostly useless: 103 assets is not information, but
 * *"six beds, none of which may be published"* is. So each section reads its
 * own gate — `assetStaleness`, the audio provenance rule, the consent flag —
 * and says the count only after.
 *
 * The sound rule is the sharpest of these. `music_beds` is read by the bed
 * director on every video and guarded at publish by `audioIsPublishable`, and
 * a bed whose provenance is not `licensed_production` cannot go out. Six beds
 * that all fail that check means every video is silent, which is a fact about
 * the whole system that was previously only visible by reading a table.
 */
import Link from 'next/link';
import { ASSET_STALE_DAYS } from '@halyard/core';
import { Label, Sheet, Tally } from '@halyard/ui/studio';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Counts {
  assets: number;
  assets_stale: number;
  beds: number;
  beds_publishable: number;
  sfx: number;
  sfx_publishable: number;
  submissions_open: number;
  submissions: number;
  proof_waiting: number;
  proof: number;
}

export default async function GalleryStock() {
  const product = await getCurrentProduct();
  const productId = product?.id ?? null;

  /*
   * One round trip. Five separate reads for a summary screen is five times the
   * latency for the same page, and none of these depend on each other.
   */
  const [row] = await query<Counts>(
    `select
       (select count(*) from assets
         where ($1::text is null or product_id = $1) and archived_at is null)::int as assets,
       (select count(*) from assets
         where ($1::text is null or product_id = $1) and archived_at is null
           and captured_at is not null
           and captured_at < now() - ($2 || ' days')::interval)::int              as assets_stale,
       (select count(*) from music_beds where active)::int                        as beds,
       (select count(*) from music_beds
         where active and provenance = 'licensed_production')::int                as beds_publishable,
       (select count(*) from sound_effects)::int                                  as sfx,
       (select count(*) from sound_effects
         where provenance = 'licensed_production')::int                           as sfx_publishable,
       (select count(*) from submissions where status = 'draft')::int             as submissions_open,
       (select count(*) from submissions)::int                                    as submissions,
       (select count(*) from social_proof where consent_state = 'unknown')::int   as proof_waiting,
       (select count(*) from social_proof)::int                                   as proof`,
    [productId, String(ASSET_STALE_DAYS)],
  );

  const c = row ?? ({} as Counts);

  return (
    <div className="grid gap-3.5 md:grid-cols-2">
      <Section
        title="Media"
        href="/gallery/stock/media"
        lamp={c.assets === 0 ? 'onair' : c.assets_stale > 0 ? 'working' : 'ready'}
        headline={
          c.assets === 0
            ? 'Nothing to shoot with.'
            : c.assets_stale > 0
              ? `${c.assets_stale} older than ${ASSET_STALE_DAYS} days.`
              : 'All current.'
        }
        detail={
          c.assets === 0
            ? 'Every visual piece needs a real photograph of the product. Until there is one, renders fall back to type on a ground.'
            : `${c.assets} usable. A stale asset still renders — it just shows a version of the product that has moved on.`
        }
      />

      <Section
        title="Sound"
        href="/gallery/stock/sound"
        lamp={c.beds_publishable === 0 ? 'onair' : 'ready'}
        headline={
          c.beds_publishable === 0
            ? `0 of ${c.beds} beds may be published.`
            : `${c.beds_publishable} of ${c.beds} beds may be published.`
        }
        detail={
          c.beds_publishable === 0
            ? 'Every video goes out silent. A bed is only publishable once its provenance is licensed_production with proof recorded — the publish gate refuses the rest, which is the correct behaviour and worth knowing about before a render, not after.'
            : `${c.sfx_publishable} of ${c.sfx} effects are cleared too.`
        }
      />

      <Section
        title="Submissions"
        href="/gallery/stock/submissions"
        lamp={c.submissions_open > 0 ? 'working' : c.submissions === 0 ? 'holding' : 'ready'}
        headline={
          c.submissions === 0
            ? 'None yet.'
            : c.submissions_open > 0
              ? `${c.submissions_open} to finish.`
              : `${c.submissions} sent.`
        }
        detail="What a platform review needs before it will unlock a capability. Nothing here is a failure — a submission only exists once you have started one."
      />

      <Section
        title="Social proof"
        href="/gallery/stock/proof"
        lamp={c.proof_waiting > 0 ? 'working' : c.proof === 0 ? 'holding' : 'ready'}
        headline={
          c.proof === 0
            ? 'None captured.'
            : c.proof_waiting > 0
              ? `${c.proof_waiting} waiting on consent.`
              : `${c.proof} cleared.`
        }
        detail="Somebody else's words about the product. Nothing is used until consent is recorded — an unasked person is not a testimonial."
      />

      <p className="text-xs leading-relaxed text-quiet md:col-span-2">
        Stock is what the floor draws on. If a brief cannot find a picture or a bed, this is
        where the reason is. <Link href="/floor" className="text-lit underline">Brief the floor</Link>
      </p>
    </div>
  );
}

function Section({
  title,
  href,
  lamp,
  headline,
  detail,
}: {
  title: string;
  /** Where the inventory itself lives. A hub that cannot be opened is a summary. */
  href: string;
  lamp: 'holding' | 'working' | 'ready' | 'onair';
  headline: string;
  detail: string;
}) {
  return (
    <Sheet tone={lamp === 'onair' ? 'onair' : lamp === 'working' ? 'lit' : 'plain'}>
      <Label>{title}</Label>
      <p className="flex items-start gap-2 font-display text-[15px] font-semibold leading-snug tracking-[-0.02em]">
        <span className="mt-1.5">
          <Tally state={lamp} on="light" size={8} />
        </span>
        <span className="min-w-0">{headline}</span>
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-quiet">{detail}</p>
      <Link
        href={href}
        className="mt-2.5 inline-block font-data text-[10px] uppercase tracking-[0.1em] text-lit underline decoration-rule2 underline-offset-2"
      >
        Open {title.toLowerCase()} →
      </Link>
    </Sheet>
  );
}
