import { Card, PageHeader, SectionTitle } from '@halyard/ui';
import { query } from '@/lib/db';
import { addPronunciation, deletePronunciation } from './actions';

export const dynamic = 'force-dynamic';

interface LexiconRow {
  id: string;
  product_id: string | null;
  term: string;
  phonetic: string;
  notes: string | null;
  hit_count: number;
}

export default async function PronunciationPage() {
  const terms = await query<LexiconRow>(
    `select id, product_id, term, phonetic, notes, hit_count
       from voice_lexicon
      order by length(term) desc, term`,
  );

  return (
    <>
      <PageHeader
        title="Pronunciation"
        subtitle="How the voiceover should say a word. Applied to every script before synthesis, longest match first, so 450°F wins over 450."
      />

      <Card className="mb-8 p-4">
        <p className="mb-3 text-sm leading-relaxed text-muted">
          When the delivery gate reports a mispronunciation it tells you to add the term here.
          Until now there was nowhere to add it. The next voiceover picks up a change; the ones
          already rendered do not, so re-run TTS on anything you want corrected.
        </p>

        <form action={addPronunciation} className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[10rem] text-xs uppercase tracking-[0.08em] text-muted">
            Term
            <input
              name="term"
              required
              placeholder="tamari"
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
            />
          </label>
          <label className="flex-1 min-w-[10rem] text-xs uppercase tracking-[0.08em] text-muted">
            Say it as
            <input
              name="phonetic"
              required
              placeholder="tuh-MAR-ee"
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
            />
          </label>
          <label className="flex-1 min-w-[10rem] text-xs uppercase tracking-[0.08em] text-muted">
            Note
            <input
              name="notes"
              placeholder="why, if it is not obvious"
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
            />
          </label>
          <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Add
          </button>
        </form>
      </Card>

      <SectionTitle hint={`${terms.length} term${terms.length === 1 ? '' : 's'}`}>
        In the lexicon
      </SectionTitle>

      {terms.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            Nothing here yet. Every script is spoken exactly as written.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto" scrollLabel="Pronunciation lexicon">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-muted">
                <th className="p-3">Term</th>
                <th className="p-3">Say it as</th>
                <th className="p-3">Note</th>
                <th className="p-3">Used</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {terms.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="p-3 font-medium text-ink">{row.term}</td>
                  <td className="p-3 text-ink">{row.phonetic}</td>
                  <td className="p-3 text-muted">{row.notes ?? '—'}</td>
                  <td className="p-3 tabular-nums text-muted">{row.hit_count}</td>
                  <td className="p-3 text-right">
                    <form action={deletePronunciation}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:bg-sunk hover:text-ink"
                        aria-label={`Remove the pronunciation for ${row.term}`}
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
