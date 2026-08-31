-- §394. Which treatment a render actually drew.
--
-- §302 gave the quiz five treatments and chose between them by "what has not
-- been used lately" — but the recency list was seeded empty for every piece, so
-- it only ever varied *within* one video. Across two quizzes briefed the same
-- way, question one always got the same treatment, and the two videos were
-- identical.
--
-- Nothing could have done better, because nothing remembered. This is the
-- column that remembers. It is written where the composition is chosen and read
-- back as the recency list for the next piece.
--
-- Nullable on purpose: a render made before this existed genuinely does not
-- know what it drew, and `null` says so rather than guessing. A backfill would
-- be inventing history.
alter table renders add column if not exists treatment text;

comment on column renders.treatment is
  '§394. The treatment this render drew — a quiz template, a narrative '
  'treatment. Read back as the recency list so the same format briefed the same '
  'way does not repeat a look. Null for renders made before §394.';

-- The only query it serves: the last N treatments for a product and format.
create index if not exists renders_treatment_recency_idx
  on renders (template_id, created_at desc)
  where treatment is not null;
