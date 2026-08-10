-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 — The six systems v1 was missing
-- v2 Part J: slots, voice_lexicon, comments, submissions, swipe file, compose
-- ═══════════════════════════════════════════════════════════════════════════

-- ── v2 E.3 — named slots with wide windows, not fixed times ────────────────
-- Windows are wall-clock local to products.audience_timezone. The scheduler
-- resolves them to a UTC instant AT SCHEDULE TIME so DST is handled correctly
-- (build pack §1).
create table slots (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  platform      text not null,
  name          text not null check (name in ('morning','midday','evening','late')),
  window_start  time not null,
  window_end    time not null,
  weekdays      int[] not null default '{1,2,3,4,5,6,7}',   -- ISO: 1=Mon
  avg_score     numeric,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (product_id, platform, name)
);

alter table content_items
  add constraint content_items_slot_fk
  foreign key (slot_id) references slots(id) on delete set null;

-- ── v2 D.2 — pronunciation lexicon, applied before every synthesis ─────────
-- Grows every time the audio QC gate catches a mispronunciation.
create table voice_lexicon (
  id         uuid primary key default gen_random_uuid(),
  product_id text references products(id) on delete cascade,
  term       text not null,                        -- 'tamari', '450°F', '1¾'
  phonetic   text not null,                        -- how it should be spoken
  notes      text,
  hit_count  int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, term)
);

-- ── v2 I.1 — post-publish reply management, the biggest gap ────────────────
-- Replies are ALWAYS human-sent with an AI draft. There is no auto-reply path
-- anywhere in this system and no reply() method on the adapter interface.
create table comments (
  id                  uuid primary key default gen_random_uuid(),
  publication_id      uuid not null references publications(id) on delete cascade,
  platform_comment_id text not null,
  author_handle       text,
  author_display_name text,
  body                text not null,
  posted_at           timestamptz,
  is_support_question boolean not null default false,
  sentiment           text,                        -- positive|neutral|negative|question
  suggested_reply     text,
  reply_status        text not null default 'pending'
                      check (reply_status in ('pending','replied','ignored','routed')),
  replied_at          timestamptz,
  first_seen_at       timestamptz not null default now(),
  unique (publication_id, platform_comment_id)
);
create index comments_inbox_idx on comments (reply_status, posted_at desc);

create table comment_replies (
  id                uuid primary key default gen_random_uuid(),
  comment_id        uuid not null references comments(id) on delete cascade,
  body              text not null,
  -- The AI drafts. A human sends. `sent_by` is never 'system'.
  sent_by           text not null default 'human' check (sent_by = 'human'),
  was_ai_drafted    boolean not null default true,
  was_edited        boolean not null default false,
  platform_reply_id text,
  sent_at           timestamptz not null default now(),
  -- v2 I.1: reply latency is a controllable variable that affects reach
  latency_seconds   int
);

-- ── v2 I.5 — UGC intake ────────────────────────────────────────────────────
create table submissions (
  id                        uuid primary key default gen_random_uuid(),
  product_id                text not null references products(id) on delete cascade,
  source_platform           text,
  source_handle             text,
  source_comment_id         uuid references comments(id) on delete set null,
  content                   text not null,
  received_at               timestamptz not null default now(),
  status                    text not null default 'new'
                            check (status in ('new','selected','fulfilled','declined')),
  resulting_content_item_id uuid references content_items(id) on delete set null
);
create index submissions_triage_idx on submissions (product_id, status, received_at desc);

-- ── v2 I.7 — swipe file. Taste is transferable, but only if written down. ──
-- `references` is a reserved word in Postgres; v2 Part J names this table
-- references_swipe for that reason.
create table references_swipe (
  id                  uuid primary key default gen_random_uuid(),
  product_id          text references products(id) on delete cascade,
  url                 text,
  platform            text,
  screenshot_asset_id uuid references assets(id) on delete set null,
  transcript          text,
  why_it_works        text not null,
  tags                text[] not null default '{}',
  created_at          timestamptz not null default now()
);

-- ── v2 Part H — co-pilot conversations, because the reasoning is reusable ──
create table compose_sessions (
  id                         uuid primary key default gen_random_uuid(),
  product_id                 text not null references products(id) on delete cascade,
  title                      text,
  messages                   jsonb not null default '[]'::jsonb,
  resulting_content_item_ids uuid[] not null default '{}',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create trigger compose_sessions_touch before update on compose_sessions
  for each row execute function public.touch_updated_at();
