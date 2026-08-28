-- §215. The half of the writing that does not belong in the caption.
--
-- Halyard's TikTok captions average 472 characters against roughly 90 visible
-- before "more". The writing is good — the container is wrong. The fix is a
-- budget in the brief, and a place for the remainder to go, because deleting it
-- would make the constraint a loss rather than a placement.
--
-- Where it goes is per-platform and already decided in `copy/budget.ts`: a
-- first comment on TikTok and Instagram, a reply on X and Threads, the
-- description on YouTube. Stored here so the publisher has it at post time.
alter table content_items
  add column if not exists overflow_body text,
  add column if not exists overflow_home text
    check (overflow_home is null or overflow_home in
      ('first_comment', 'reply', 'description', 'none')),
  -- Set when the overflow has actually been posted, so a retry cannot double it.
  add column if not exists overflow_posted_at timestamptz;

comment on column content_items.overflow_body is
  'The part of the writing that did not fit the caption budget. Posted as a first comment or reply — never discarded.';
comment on column content_items.overflow_home is
  'Where the overflow belongs on this platform. From copy/budget.ts.';
comment on column content_items.overflow_posted_at is
  'Idempotency for the follow-up post. Null means unposted, not absent.';
