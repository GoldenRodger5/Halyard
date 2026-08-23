/*
 * A global pronunciation could be defined twice, with different answers.
 *
 * `voice_lexicon` carries `unique (product_id, term)` and `product_id` is
 * nullable, because a term can be global — "450°F" is spoken the same way
 * whatever the product. In Postgres a UNIQUE constraint treats NULLs as
 * distinct, so `(null, 'tamari')` does not conflict with `(null, 'tamari')`.
 * The constraint that looks like it prevents duplicates prevents them only for
 * product-scoped rows.
 *
 * That matters because `tts` loads the whole table and substitutes
 * longest-match-first. Two rows for one term are the same length, so which
 * spelling wins is whatever order the planner returned — the voiceover would
 * say one thing today and the other tomorrow, with nothing to explain it.
 *
 * Found by an `on conflict (product_id, term) do update` that silently inserted
 * a second row instead of correcting the first.
 */

-- Collapse any duplicate global terms first, keeping the most recent answer.
delete from voice_lexicon a
 using voice_lexicon b
 where a.product_id is null
   and b.product_id is null
   and a.term = b.term
   and a.created_at < b.created_at;

/*
 * `coalesce` rather than `nulls not distinct`: the latter needs Postgres 15 and
 * this expresses the same rule in a form that reads at the call site — a global
 * term and a product term are different keys, two global terms are not.
 */
create unique index voice_lexicon_scope_term_key
  on voice_lexicon (coalesce(product_id, ''), term);

comment on index voice_lexicon_scope_term_key is
  'One pronunciation per term per scope. The table constraint cannot enforce this for global terms because unique() treats NULL product_id as distinct.';
