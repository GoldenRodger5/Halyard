'use server';

/**
 * The operator surface `voice_lexicon` never had.
 *
 * The read side has always been complete: `tts` loads every term before
 * synthesis, `normaliseForSpeech` substitutes longest-first, and the delivery
 * gate tells the operator — in a finding they actually see — to *"add the term
 * to voice_lexicon with a phonetic spelling and the next synthesis gets it
 * right."* Nothing in Halyard let them. The only writer in the repository was a
 * test.
 *
 * So the gate diagnosed a mispronunciation correctly and then prescribed
 * something impossible. These are the two actions that make the prescription
 * real.
 */
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/** Longest-first substitution means an empty term would match everywhere. */
function clean(value: FormDataEntryValue | null): string {
  return String(value ?? '').trim();
}

export async function addPronunciation(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const term = clean(formData.get('term'));
  const phonetic = clean(formData.get('phonetic'));
  const notes = clean(formData.get('notes')) || null;
  const productId = clean(formData.get('productId')) || null;

  // Both are `not null` in the schema, and a blank term would substitute into
  // every script. Refused here so the constraint is never the error the
  // operator sees.
  if (!term || !phonetic) return;

  /*
   * Conflict target is the expression index, not the table constraint.
   *
   * `unique (product_id, term)` cannot catch a duplicate *global* term:
   * Postgres treats a NULL `product_id` as distinct from another NULL, so
   * `on conflict (product_id, term)` inserted a second row rather than
   * correcting the first — two spellings of one word, with the winner decided
   * by whatever order the planner happened to return. Migration 0036 adds
   * `(coalesce(product_id, ''), term)` and this names it.
   */
  await query(
    `insert into voice_lexicon (product_id, term, phonetic, notes)
     values ($1, $2, $3, $4)
     on conflict (coalesce(product_id, ''), term) do update
       set phonetic = excluded.phonetic, notes = excluded.notes`,
    [productId, term, phonetic, notes],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, detail)
     values ('human', 'pronunciation_set', 'voice_lexicon', $1)`,
    [{ term, phonetic, operator: operator.email }],
  );

  revalidatePath('/master/system/pronunciation');
}

export async function deletePronunciation(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const id = clean(formData.get('id'));
  if (!id) return;

  const removed = await query<{ term: string }>(
    'delete from voice_lexicon where id = $1 returning term',
    [id],
  );

  if (removed[0]) {
    await query(
      `insert into audit_log (actor, action, entity_type, entity_id, detail)
       values ('human', 'pronunciation_removed', 'voice_lexicon', $1, $2)`,
      [id, { term: removed[0].term, operator: operator.email }],
    );
  }

  revalidatePath('/master/system/pronunciation');
}
