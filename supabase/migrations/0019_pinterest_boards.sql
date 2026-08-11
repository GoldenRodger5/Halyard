-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Pinterest boards, and routing a pin to the right one
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * The boards a Pinterest account actually has.
 *
 * Pinterest is a search index, not a feed, and the board is a large part of how
 * a pin is classified. Every pin lands on exactly one, `board_id` is required by
 * every API that publishes one, and until now Halyard had nowhere to keep them —
 * so a pin either used a single default or failed at publish time with a message
 * about a field nobody had been asked for.
 *
 * Synced from the provider rather than typed: Blotato exposes
 * `GET /v2/social/pinterest/boards?accountId=`, and the direct adapter can list
 * them too. A board deleted upstream is removed here on the next sync.
 */
create table pinterest_boards (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references social_accounts(id) on delete cascade,
  board_id    text not null,
  name        text not null,

  -- Overrides the terms derived from the name, for boards whose name is not the
  -- signal. Null means "derive from the name", which is the normal case.
  match_tags  text[],

  -- Where a pin goes when nothing matches. At most one per account, enforced
  -- below, because two defaults is the same as none.
  is_default  boolean not null default false,

  synced_at   timestamptz not null default now(),
  unique (account_id, board_id)
);

create unique index pinterest_boards_one_default
  on pinterest_boards (account_id) where is_default;

/**
 * The board a draft was routed to, and why.
 *
 * Stored on the item so the decision is visible in the queue before approval
 * rather than discovered afterwards, and so a re-run does not silently re-route
 * a post the operator has already looked at.
 */
alter table content_items add column board_id text;
alter table content_items add column board_reason text;

select public.apply_admin_rls();
