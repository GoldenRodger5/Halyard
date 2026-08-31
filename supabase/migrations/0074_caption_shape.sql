-- §419. What shape a caption took.
--
-- `VARIETY_BY_POST_TYPE.md` §2.3 calls this the largest gap and the least
-- obvious, "because nothing renders". A text post's look is its shape: where
-- the line breaks fall, whether it opens on a question or a claim, whether it
-- is one sentence or a short list.
--
-- The gap is wider than the three text post types. Every post has a caption,
-- under every video and every carousel, on every platform. An account whose
-- every caption is a three-line paragraph with the same rhythm reads as
-- automated within a fortnight, and no gate catches it because every individual
-- caption is fine.
--
-- This is the column that remembers, so "what has not been used lately" has an
-- answer — the same arrangement as renders.treatment (0071) and assets.shot
-- (0072), both of which exist because a recency rule with nothing to read is a
-- constant.
--
-- Nullable: a piece written before this genuinely does not know what shape it
-- took, and a backfill would be inventing history.
alter table content_items add column if not exists caption_shape text;

comment on column content_items.caption_shape is
  '§419. The shape this caption was briefed to take — single, setup_turn, '
  'list, question_open, receipt. Read back as the recency list so an account '
  'does not write every caption in the same rhythm. Null before §419.';

create index if not exists content_items_caption_shape_idx
  on content_items (product_id, created_at desc)
  where caption_shape is not null;
