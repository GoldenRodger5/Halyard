-- §402. How a generated picture was actually shot.
--
-- `heroPrompt` chose a mood by visual language; `generate.ts` passed
-- `visualLanguage: undefined`; the lookup fell to DEFAULT_MOOD every time. So
-- every hero image Halyard has ever made carries the same styling clause, and
-- two pieces on the same subject were two near-identical photographs.
--
-- Nothing could have done better, because nothing remembered — the same reason
-- §394 added `renders.treatment`. `assets` has no column that says how an image
-- was taken, so no recency list could exist and no rotation was possible.
--
-- This is that column. Written where the shot is chosen, read back as the
-- recency list for the next picture.
--
-- Nullable on purpose: an asset made before this genuinely does not know how it
-- was shot, and null says so. A backfill would be inventing history — and every
-- pre-§402 image really was the same shot, so a guess would also be wrong.
alter table assets add column if not exists shot text;

comment on column assets.shot is
  '§402. framing/light/surface for a generated image. Read back as the recency '
  'list so consecutive pictures for a product are framed, lit and set '
  'differently. Null for assets made before §402, and for anything not '
  'generated (captures, uploads).';

-- The only query it serves: the last N shots for a product.
create index if not exists assets_shot_recency_idx
  on assets (product_id, created_at desc)
  where shot is not null;
