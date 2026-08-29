-- §281. Which editorial shape a piece is, recorded so it can be varied.
--
-- The format family (§277) only works if the choice is persisted: `selectFormat`
-- breaks ties by what the account used least recently, and recency it cannot
-- read is recency it cannot honour. Exactly the failure §265 found for
-- typography, where the director chose well and the output could not show it.
--
-- Deliberately NOT constrained to a fixed list in Postgres. `jobs_kind_check`
-- is the standing lesson (gotcha 1): a check constraint listing the same values
-- as a TypeScript union is the same list written twice, and adding to one
-- typechecks cleanly then fails at the first insert. The catalogue in
-- `packages/core/src/formats/catalog.ts` is the single source, and a test
-- asserts every renderer matches it.
--
-- Nullable, because every row that exists predates the family and no backfill
-- could honestly say what shape they were.
alter table content_items
  add column if not exists post_format text;

comment on column content_items.post_format is
  'Editorial shape (quiz, history, tips, recipe, …) from POST_FORMAT_CATALOG. '
  'Distinct from `format`, which is the media type, and from `format_subtype`, '
  'which is the platform variant. Null for anything made before §281.';

-- The one query that matters: the last few formats on one account, newest
-- first, which is what the recency rule reads on every generation.
create index if not exists content_items_account_format_idx
  on content_items (account_id, created_at desc)
  where post_format is not null;
