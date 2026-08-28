-- §179. TikTok Direct Post: the creator's choices, and the creator_info they were made against.
--
-- TikTok requires the publishing UI to be built from a *current*
-- creator_info/query response, and requires the creator — not the integration —
-- to choose visibility, the comment/Duet/Stitch settings, any commercial-content
-- disclosure, and to give the Music Usage Confirmation. None of that could be
-- expressed before: the adapter hard-coded PUBLIC_TO_EVERYONE with every
-- interaction enabled.
--
-- Two columns rather than one. `tiktok_options` is what the person chose;
-- `tiktok_creator_info` is what TikTok said was allowed at the time they chose
-- it. Keeping the second is what lets the publisher notice that the answers were
-- given against a stale picture — a creator can flip their account to private
-- between approval and posting.
alter table content_items
  add column if not exists tiktok_options jsonb,
  add column if not exists tiktok_creator_info jsonb,
  add column if not exists tiktok_creator_info_at timestamptz;

comment on column content_items.tiktok_options is
  'TikTok Direct Post settings chosen by a human. Null means the panel was never completed, and publishing is refused.';
comment on column content_items.tiktok_creator_info is
  'The creator_info/query response the TikTok panel was rendered from, so a stale basis is detectable.';

-- Publishing a TikTok item without a completed panel is a correctness failure,
-- not a preference, so the database refuses it too. The worker and the adapter
-- both check; this is the layer that cannot be bypassed by a new caller.
alter table content_items drop constraint if exists content_items_tiktok_needs_choices;
alter table content_items add constraint content_items_tiktok_needs_choices check (
  platform <> 'tiktok'
  or status not in ('approved', 'publishing', 'published')
  or (
    tiktok_options is not null
    and tiktok_options ? 'privacyLevel'
    and tiktok_options ->> 'privacyLevel' is not null
    and tiktok_options ->> 'musicConfirmedAt' is not null
  )
);
