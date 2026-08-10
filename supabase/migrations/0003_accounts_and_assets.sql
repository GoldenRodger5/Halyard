-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 — Social accounts (capability gating) and the asset library
-- v1 §2, v1 §0 (capability_state), v1 §7 (token storage)
-- ═══════════════════════════════════════════════════════════════════════════

create table social_accounts (
  id                   uuid primary key default gen_random_uuid(),
  product_id           text not null references products(id) on delete cascade,
  platform             text not null
                       check (platform in ('x','instagram','tiktok','pinterest','youtube','threads')),
  persona              text not null check (persona in ('founder','brand')),
  handle               text not null,
  platform_user_id     text,

  -- OAuth material. AES-256-GCM sealed application-side with TOKEN_ENCRYPTION_KEY
  -- before it ever reaches Postgres, and never selected into a client payload.
  -- (See packages/core/src/crypto/tokenCrypto.ts and note in docs/DECISIONS.md
  --  on why this is app-level rather than pgsodium.)
  access_token_enc     bytea,
  refresh_token_enc    bytea,
  token_expires_at     timestamptz,
  scopes               text[] not null default '{}',

  -- Capability gating — this is what makes "connect everything now" work.
  --   pending_auth → draft_only → live
  capability_state     text not null default 'pending_auth'
                       check (capability_state in
                         ('pending_auth','draft_only','live','error','disabled')),
  capability_detail    text,                        -- 'awaiting TikTok audit'
  supported_formats    text[] not null default '{}',-- text|image|carousel|video|story|pin
  rate_limit_config    jsonb not null default '{}'::jsonb,

  -- v2 I.2 — link placement differs per platform and getting it wrong is costly.
  link_strategy        text not null default 'in_body'
                       check (link_strategy in
                         ('in_body','first_reply','bio_only','pin_destination','description')),
  bio_link_url         text,

  last_verified_at     timestamptz,
  last_error           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (product_id, platform, persona)
);

create trigger social_accounts_touch before update on social_accounts
  for each row execute function public.touch_updated_at();

create table assets (
  id                uuid primary key default gen_random_uuid(),
  product_id        text references products(id) on delete cascade,
  kind              text not null
                    check (kind in ('screenshot','logo','broll','font','photo',
                                    'generated','capture','audio','video')),
  storage_path      text not null,
  mime_type         text not null,
  width             int,
  height            int,
  duration_seconds  numeric,
  bytes             bigint,
  tags              text[] not null default '{}',   -- ['cook-mode','result-card','timer']
  caption           text,
  source            text,                            -- manual_upload|playwright_capture|render|tts
  usable_for        text[] not null default '{}',
  -- Public URLs are required by Meta (v2 A.3: "Meta cURLs it") — signed short-lived
  -- URLs do not work for Instagram/Threads publishing.
  public_url        text,
  created_at        timestamptz not null default now()
);

create index assets_product_kind_idx on assets (product_id, kind, created_at desc);
