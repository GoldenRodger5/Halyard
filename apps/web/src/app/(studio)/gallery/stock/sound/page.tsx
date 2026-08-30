/**
 * §363. The sound library, and whether any of it may be published.
 *
 * `music_beds` and `sound_effects` have existed since §221 and §241, are read
 * by the bed director on every video, are guarded at draft time by
 * `directBed`'s provenance check and again at publish by `audioIsPublishable` —
 * and **had no screen at all**. Ten rows of real configuration, a licence
 * regime built to protect the account, and no way for the operator to look at
 * any of it.
 *
 * The consequence is not theoretical. Every bed in this database is a
 * synthesised test fixture whose licence field reads *"NOT a licence"*. The
 * guards are working exactly as designed and correctly refuse all six for a
 * post, so a real video comes out **silent** — and the only place that fact
 * appears is a log line inside a worker. An operator watching a silent video
 * has no route from the symptom to the cause.
 *
 * So this screen answers one question first, at the top, before anything else:
 * **how many beds could actually go out on a post?** Then the library, with the
 * reason each unusable one is unusable.
 *
 * ## Why the provenance rule is restated here rather than imported
 *
 * It is not restated. `LICENSED` is the same single value `directBed` and
 * `audioIsPublishable` test against, and the counting below is a display of
 * their rule, not a second implementation of it — a screen that decided
 * publishability on its own could reassure an operator about a bed the mixer
 * will refuse.
 */
import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The one provenance a post may carry.
 *
 * `directBed` refuses everything else when `forPublication` is true, and
 * `audioIsPublishable` refuses it again against what was actually mixed. This
 * constant exists so the screen shows that rule rather than guessing at it.
 */
const LICENSED = 'licensed_production';

interface AudioRow {
  id: string;
  title: string;
  provenance: string;
  licence: string | null;
  licensor: string | null;
  licence_proof: string | null;
  attribution_required: boolean;
  attribution_text: string | null;
  expires_at: string | null;
  prohibited_platforms: string[] | null;
  active: boolean;
  usage_count: number;
  duration_seconds: string | number | null;
  /** Music only. */
  mood?: string | null;
  energy?: string | number | null;
  bpm?: number | null;
  has_vocals?: boolean;
  /** Effects only. */
  role?: string | null;
}

/**
 * Why this cannot go on a post, or null if it can.
 *
 * Ordered by what an operator would fix first: provenance before proof, proof
 * before expiry, because an unlicensed bed cannot be repaired by a date.
 */
function unusable(row: AudioRow): string | null {
  if (!row.active) return 'Marked inactive, so nothing will choose it.';
  if (row.provenance === 'test') {
    return 'A test fixture. It exists so the mixer can be exercised without a licence, and it is refused for anything that publishes.';
  }
  if (row.provenance !== LICENSED) {
    return `Provenance is "${row.provenance}". A post needs ${LICENSED}, which means somebody established the licence and recorded the proof.`;
  }
  if (!row.licence_proof?.trim()) {
    return 'Marked licensed with no proof recorded. The claim and the evidence have to travel together.';
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return `The licence expired on ${new Date(row.expires_at).toISOString().slice(0, 10)}.`;
  }
  return null;
}

function AudioTable({ rows, kind }: { rows: AudioRow[]; kind: 'music' | 'effect' }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing here yet. {kind === 'music' ? 'Beds' : 'Effects'} are imported with{' '}
        <code className="rounded bg-sunk px-1">scripts/import-music.ts</code>, which refuses
        anything it cannot establish a licence for.
      </p>
    );
  }

  /*
    Ten rows all unusable for the same reason printed the same sentence ten
    times, which reads as noise and buries the row where the reason differs.
    Repeats are folded: the sentence appears the first time and then only when
    it changes, so a single odd one out is the thing that stands out.
  */
  let previous: string | null = null;
  return (
    <ul className="divide-y divide-line border-t border-line">
      {rows.map((row) => {
        const why = unusable(row);
        const repeated = why !== null && why === previous;
        previous = why;
        return (
          <li key={row.id} className="py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm text-ink">{row.title}</span>
              <Badge tone={why ? 'warn' : 'good'}>{why ? 'not for posts' : 'publishable'}</Badge>
              {row.usage_count > 0 ? (
                <span className="text-[11px] text-muted">used {row.usage_count}×</span>
              ) : null}
            </div>

            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
              {kind === 'music' ? (
                <>
                  {row.mood ? <span>{row.mood}</span> : null}
                  {row.energy !== null && row.energy !== undefined ? (
                    <span>energy {Number(row.energy).toFixed(2)}</span>
                  ) : null}
                  {row.bpm ? <span>{row.bpm} bpm</span> : null}
                  {row.has_vocals ? <span>has vocals</span> : null}
                </>
              ) : (
                <>{row.role ? <span>{row.role}</span> : null}</>
              )}
              {row.duration_seconds ? <span>{Number(row.duration_seconds)}s</span> : null}
              <span>{row.provenance}</span>
              {row.attribution_required ? (
                <span className="text-warn-ink" title={row.attribution_text ?? undefined}>
                  attribution required
                </span>
              ) : null}
              {(row.prohibited_platforms ?? []).length > 0 ? (
                <span>not on {(row.prohibited_platforms ?? []).join(', ')}</span>
              ) : null}
            </div>

            {why && !repeated ? (
              <p className="mt-1 text-[11px] text-warn-ink">{why}</p>
            ) : why ? (
              <p className="mt-1 text-[11px] text-muted">Same reason as above.</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default async function AudioLibraryPage() {
  const [beds, effects] = await Promise.all([
    query<AudioRow>(
      `select m.id, m.title, m.provenance, m.licence, m.licensor, m.licence_proof,
              m.attribution_required, m.attribution_text, m.expires_at,
              m.prohibited_platforms, m.active, m.usage_count, m.duration_seconds,
              m.mood, m.energy, m.bpm, m.has_vocals
         from music_beds m
         join assets a on a.id = m.asset_id
        where a.archived_at is null
        order by m.title`,
    ),
    query<AudioRow>(
      `select s.id, s.title, s.provenance, s.licence, s.licensor, s.licence_proof,
              s.attribution_required, s.attribution_text, s.expires_at,
              s.prohibited_platforms, s.active, s.usage_count, s.duration_seconds,
              s.role
         from sound_effects s
         join assets a on a.id = s.asset_id
        where a.archived_at is null
        order by s.role, s.title`,
    ),
  ]);

  const usableBeds = beds.filter((b) => !unusable(b));
  const usableEffects = effects.filter((e) => !unusable(e));

  return (
    <>
      <PageHeader
        title="Sound"
        subtitle="Every bed and effect Halyard can reach, and whether the licence lets it go on a post. The mixer applies this rule at draft time and the publish gate applies it again to whatever actually got mixed."
      />

      {/*
        The headline number, first, because it is the one that explains a silent
        video. A library of six beds that yields zero usable ones looks full
        from every other screen in the application.
      */}
      <Card
        className={
          usableBeds.length === 0
            ? 'border-warn/40 bg-warn/5 p-5'
            : 'p-5'
        }
      >
        <p className="text-sm text-ink">
          {usableBeds.length} of {beds.length} beds and {usableEffects.length} of {effects.length}{' '}
          effects may be used on a post.
        </p>
        {usableBeds.length === 0 && beds.length > 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Nothing in the library can be published, so every video Halyard makes comes out
            silent under the narration. That is the guards working, not failing — a fixture
            reaching a real post is the thing they exist to prevent. Import a licensed bed with{' '}
            <code className="rounded bg-sunk px-1">scripts/import-music.ts</code>, which will
            refuse anything whose licence it cannot establish.
          </p>
        ) : null}
        {beds.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            There are no beds at all, so music is not something that can be chosen yet.
          </p>
        ) : null}
      </Card>

      <div className="mt-8">
        <SectionTitle>Music beds</SectionTitle>
        <AudioTable rows={beds} kind="music" />
      </div>

      <div className="mt-8">
        <SectionTitle>Sound effects</SectionTitle>
        <AudioTable rows={effects} kind="effect" />
      </div>

      {beds.length === 0 && effects.length === 0 ? (
        <EmptyState
          title="No sound at all"
          body="Halyard will narrate over silence, which is a normal short-form style and not a broken video."
          action={
            <Link href="/assets" className="text-sm text-primary underline">
              Other assets
            </Link>
          }
        />
      ) : null}
    </>
  );
}
