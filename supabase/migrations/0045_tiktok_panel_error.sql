-- §190. Somewhere to put what went wrong on the TikTok panel.
--
-- §179 wrote `content_items.last_error` from three places. That column does not
-- exist — `last_error` is on `social_accounts`, and the name was carried across
-- by assumption. Every write threw, and so did the read on the item detail page,
-- which returned a 500 for any TikTok item.
--
-- Nothing caught it because there had never been a TikTok item to open. The
-- query only runs when `platform = 'tiktok'`, so the whole path was unreachable
-- until an account was connected and content existed.
--
-- Named for what it is rather than reusing `reject_reason` or `regen_notes`:
-- those are decisions a human made about the content, and a failed creator_info
-- query is neither.
alter table content_items
  add column if not exists tiktok_last_error text;

comment on column content_items.tiktok_last_error is
  'Why the TikTok panel could not do what was asked — a failed creator_info query, or settings that do not validate. Cleared on success.';
