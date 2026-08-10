-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 — Round 3: milestones 40, 42, 44, 45
--
--   · account identity, confirmed before tokens are saved
--   · routing safety, enforced by constraint rather than convention
--   · destinations and the link router
--   · campaigns, and a mix calculation that survives a launch
--   · newsletter and verified social proof
-- ═══════════════════════════════════════════════════════════════════════════

-- ── M40: identity, confirmed at connect time ───────────────────────────────
--
-- Connecting the wrong account because you were already logged in is the single
-- most common failure in this flow. The identity is fetched, shown, and
-- acknowledged before a token is written.
alter table social_accounts add column display_name text;
alter table social_accounts add column avatar_url text;
alter table social_accounts add column follower_count int;
alter table social_accounts add column identity_confirmed_at timestamptz;
alter table social_accounts add column identity_warning text;
alter table social_accounts add column last_self_test_at timestamptz;
alter table social_accounts add column last_self_test_ok boolean;
alter table social_accounts add column last_self_test_detail text;
alter table social_accounts add column last_published_at timestamptz;
-- Set deliberately when the same person is genuinely on two products.
alter table social_accounts add column duplicate_identity_ack boolean not null default false;

-- One platform identity connects once, unless the operator says otherwise.
create unique index social_accounts_identity_uniq
  on social_accounts (platform, platform_user_id)
  where platform_user_id is not null and duplicate_identity_ack = false;

/**
 * Pending connections. A token lives here, sealed, only until the operator
 * confirms the identity is the one they meant. Unconfirmed rows expire.
 */
create table pending_connections (
  id                 uuid primary key default gen_random_uuid(),
  product_id         text not null references products(id) on delete cascade,
  platform           text not null,
  persona            text not null check (persona in ('founder','brand')),
  platform_user_id   text,
  handle             text,
  display_name       text,
  avatar_url         text,
  follower_count     int,
  scopes             text[] not null default '{}',
  access_token_enc   bytea not null,
  refresh_token_enc  bytea,
  token_expires_at   timestamptz,
  token_meta         jsonb not null default '{}'::jsonb,
  -- Other identities the same token reaches (Meta Pages, YouTube brand channels).
  alternatives       jsonb not null default '[]'::jsonb,
  -- What looks wrong about this, in the operator's language.
  warnings           jsonb not null default '[]'::jsonb,
  reconnect_account_id uuid references social_accounts(id) on delete set null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '30 minutes'
);
create index pending_connections_live_idx on pending_connections (created_at desc);

-- ── M40: routing safety ────────────────────────────────────────────────────
--
-- A brand post landing on the founder account, or on another product's account,
-- is the worst non-destructive failure available. It is made structurally
-- impossible rather than carefully avoided.
--
-- The two personas have different scoping rules — a brand account belongs to
-- exactly one product, the founder account is one identity shared across all of
-- them — so neither "same product" nor "same persona" is the invariant on its
-- own. The invariant is a routing scope, computed the same way on both sides:
--
--     brand   → the product id
--     founder → the literal '*founder*'
--
-- A composite foreign key on (account_id, routing_scope) then makes every wrong
-- pairing unrepresentable. A brand item cannot reach a founder account (scopes
-- differ), a brand item cannot reach another product's account (scopes differ),
-- and a founder item cannot reach any brand account. Founder content keeps the
-- product_id of the product it serves, so it still appears on that product's
-- calendar — only the routing changes.
--
-- Asterisks cannot appear in a product id, which is what keeps '*founder*' from
-- ever colliding with a real one.
alter table products add constraint products_id_slug_check
  check (id ~ '^[a-z0-9][a-z0-9_-]*$');

alter table social_accounts
  add column routing_scope text
  generated always as (case when persona = 'founder' then '*founder*' else product_id end) stored;

alter table social_accounts
  add constraint social_accounts_routing_uniq unique (id, routing_scope);

-- Founder accounts belong on the personal product, so there is exactly one of
-- them per platform rather than a near-duplicate for every product launched.
--
-- The generated column is NULL for brand accounts, and a foreign key with a NULL
-- part is not checked — so this constrains founder rows only, with no trigger
-- and no default that could drift out of step with products.kind.
alter table products add constraint products_id_kind_uniq unique (id, kind);

alter table social_accounts
  add column required_product_kind text
  generated always as (case when persona = 'founder' then 'personal' end) stored;

-- Move any founder account already sitting on a product across to the personal
-- product. Its routing scope does not change, so content keeps pointing at it.
update social_accounts sa
   set product_id = (select id from products where kind = 'personal' order by created_at limit 1)
 where sa.persona = 'founder'
   and exists (select 1 from products where kind = 'personal')
   and sa.product_id is distinct from
       (select id from products where kind = 'personal' order by created_at limit 1);

alter table social_accounts
  add constraint social_accounts_founder_is_personal_fk
  -- No ON UPDATE action: Postgres rejects one on a key containing a generated
  -- column, and products.kind does not change under a live account anyway.
  foreign key (product_id, required_product_kind) references products (id, kind);

alter table content_items
  add column routing_scope text
  generated always as (case when persona = 'founder' then '*founder*' else product_id end) stored;

alter table content_items
  add constraint content_items_account_routing_fk
  foreign key (account_id, routing_scope)
  references social_accounts (id, routing_scope);

-- Bluesky has had an adapter since round 2 but was never added here, so no
-- Bluesky account could be created at all.
alter table social_accounts drop constraint social_accounts_platform_check;
alter table social_accounts add constraint social_accounts_platform_check
  check (platform in ('x','instagram','tiktok','pinterest','youtube','threads','bluesky'));

-- The handle each persona is supposed to be. One value per persona rather than
-- one per platform: people reuse a handle across platforms, and normalisation
-- tolerates the domain suffixes Bluesky adds. Its only job is to catch the case
-- where you authorised a completely different account.
alter table products add column expected_handles jsonb not null default '{}'::jsonb;
  -- {"brand": "recipefix", "founder": "isaacmineo"}

-- ── M42: destinations ──────────────────────────────────────────────────────
alter table products add column destinations jsonb not null default '{}'::jsonb;
  -- {web, app_store, play_store, universal_link_domain, deep_link_scheme,
  --  app_store_id, app_analytics_provider_token}

alter table content_items add column destination_type text
  check (destination_type in ('share_link', 'app_store', 'web', 'link_in_bio'));
alter table content_items add column destination_url text;
alter table content_items add column destination_reason text;

/**
 * Every click through the router. Device class matters: iOS with the app
 * installed behaves differently from iOS without it, and averaging them hides
 * the only decision the router makes.
 */
create table link_clicks (
  id               uuid primary key default gen_random_uuid(),
  content_item_id  uuid references content_items(id) on delete set null,
  campaign_id      uuid,
  device_class     text not null check (device_class in ('ios','android','desktop','bot','unknown')),
  platform         text,
  referrer         text,
  user_agent       text,
  destination_type text,
  destination_url  text,
  country          text,
  clicked_at       timestamptz not null default now()
);
create index link_clicks_item_idx on link_clicks (content_item_id, clicked_at desc);
create index link_clicks_campaign_idx on link_clicks (campaign_id, clicked_at desc)
  where campaign_id is not null;

/**
 * App Store conversions arrive from a different system with different
 * semantics, so they are stored separately and shown as their own column.
 * Summing them with web sessions would be a category error.
 */
create table app_store_attribution (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid references content_items(id) on delete cascade,
  campaign_id     uuid,
  campaign_token  text,
  impressions int, product_page_views int, installs int,
  first_time_downloads int, redownloads int, proceeds_usd numeric,
  collected_at    timestamptz not null default now(),
  source          text not null default 'app_store_connect'
);
create index app_store_attribution_item_idx on app_store_attribution (content_item_id, collected_at desc);

-- ── M44: campaigns ─────────────────────────────────────────────────────────
create table campaigns (
  id                   uuid primary key default gen_random_uuid(),
  product_id           text not null references products(id) on delete cascade,
  name                 text not null,
  kind                 text not null default 'launch'
                       check (kind in ('launch','feature','seasonal','experiment','other')),
  brief                text,
  goal                 text,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  destination_override text,
  -- The product ceiling lifts for the window and reverts at ends_at.
  product_mix_ceiling  numeric not null default 0.60,
  status               text not null default 'planning'
                       check (status in ('planning','staged','running','complete','abandoned')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at > starts_at)
);
create trigger campaigns_touch before update on campaigns
  for each row execute function public.touch_updated_at();

alter table content_items add column campaign_id uuid references campaigns(id) on delete set null;
create index content_items_campaign_idx on content_items (campaign_id) where campaign_id is not null;

alter table link_clicks add constraint link_clicks_campaign_fk
  foreign key (campaign_id) references campaigns(id) on delete set null;
alter table app_store_attribution add constraint app_store_attribution_campaign_fk
  foreign key (campaign_id) references campaigns(id) on delete set null;

/**
 * The trailing-21-day mix must EXCLUDE campaign days, or a three-day launch
 * distorts normal cadence for three weeks afterwards and the idea engine spends
 * that time over-correcting.
 */
create or replace function public.content_mix_actual(
  p_product_id text,
  p_persona    text,
  p_days       int default 21
)
returns table (category text, published int, share numeric)
language sql
stable
as $$
  with published as (
    select ci.category
      from content_items ci
     where ci.product_id = p_product_id
       and ci.persona    = p_persona
       and ci.status     = 'published'
       and ci.published_at > now() - make_interval(days => p_days)
       -- Campaign days are their own regime and are measured separately.
       and ci.campaign_id is null
  ),
  total as (select greatest(count(*), 1)::numeric as n from published)
  select p.category,
         count(*)::int as published,
         round(count(*)::numeric / (select n from total), 4) as share
    from published p
   group by p.category;
$$;

create or replace function public.product_content_share(
  p_product_id text,
  p_persona    text,
  p_days       int default 14
)
returns numeric
language sql
stable
as $$
  select coalesce(
    round(
      count(*) filter (where category = 'product')::numeric
      / nullif(count(*), 0), 4),
    0)
    from content_items
   where product_id = p_product_id
     and persona    = p_persona
     and status in ('published','scheduled','approved')
     and campaign_id is null
     and coalesce(published_at, scheduled_at, created_at) > now() - make_interval(days => p_days);
$$;

-- ── M45: owned audience and social proof ───────────────────────────────────
create table newsletters (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null references products(id) on delete cascade,
  subject         text not null,
  preheader       text,
  body_markdown   text not null,
  body_html       text,
  status          text not null default 'draft'
                  check (status in ('draft','pending_approval','approved','sending','sent','failed')),
  period_start    timestamptz,
  period_end      timestamptz,
  source_item_ids uuid[] not null default '{}',
  recipient_count int,
  sent_at         timestamptz,
  provider_id     text,
  error           text,
  opens int, clicks int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger newsletters_touch before update on newsletters
  for each row execute function public.touch_updated_at();

create table subscribers (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  email         text not null,
  source        text not null default 'link_in_bio',
  lead_magnet   text,
  confirmed_at  timestamptz,
  unsubscribed_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (product_id, email)
);

/**
 * Social proof, and the row it came from.
 *
 * Fabricated social proof is the one unrecoverable content failure, so a
 * testimonial is verified the way a claim is: it resolves to a stored row, or it
 * does not go out.
 */
create table social_proof (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null references products(id) on delete cascade,
  source          text not null
                  check (source in ('app_store','play_store','user_feedback','beta_feedback','comment','email')),
  source_id       text not null,
  source_url      text,
  author_display  text,
  rating          int,
  title           text,
  -- Verbatim. Never edited beyond a marked trim.
  body            text not null,
  posted_at       timestamptz,
  -- Consent is required before a full name or a photo is ever shown.
  consent_state   text not null default 'not_asked'
                  check (consent_state in ('not_asked','granted','declined','public_by_default')),
  status          text not null default 'new'
                  check (status in ('new','used','declined')),
  content_item_id uuid references content_items(id) on delete set null,
  fetched_at      timestamptz not null default now(),
  unique (product_id, source, source_id)
);
create index social_proof_triage_idx on social_proof (product_id, status, posted_at desc);

-- ── M43: watch terms ───────────────────────────────────────────────────────
--
-- Discovery only. No engagement, no replies, no DMs, and X is deliberately
-- absent because reads are $0.005 each and the economics do not work.
create table watch_terms (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  term          text not null,
  sources       text[] not null default '{reddit,rss,pinterest}',
  enabled       boolean not null default true,
  last_run_at   timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  unique (product_id, term)
);

create table watch_hits (
  id            uuid primary key default gen_random_uuid(),
  watch_term_id uuid not null references watch_terms(id) on delete cascade,
  product_id    text not null references products(id) on delete cascade,
  source        text not null,
  url           text not null,
  title         text not null,
  excerpt       text,
  author        text,
  engagement    int,
  posted_at     timestamptz,
  -- A recurring question is an idea; a one-off is noise.
  question      boolean not null default false,
  signal_id     uuid references signals(id) on delete set null,
  seen_at       timestamptz not null default now(),
  unique (watch_term_id, url)
);
create index watch_hits_recent_idx on watch_hits (product_id, seen_at desc);

-- ── M43: rejection clusters get a lifecycle ────────────────────────────────
alter table rejection_clusters add column dismissed_until timestamptz;

-- ── Notifications that repeat ──────────────────────────────────────────────
-- A token-expiry warning is worth seeing once a day and no more often. Warning
-- hourly about the same account trains the operator to ignore exactly the thing
-- they most need to act on.
alter table notifications add column dedupe_key text unique;

-- ── M32: request log, redacted, seven-day retention ────────────────────────
create table platform_requests (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references social_accounts(id) on delete set null,
  platform      text not null,
  method        text not null,
  url           text not null,
  request_body  jsonb,
  status        int,
  response_body jsonb,
  duration_ms   int,
  dry_run       boolean not null default false,
  error         text,
  created_at    timestamptz not null default now(),
  purge_after   timestamptz not null default now() + interval '7 days'
);
create index platform_requests_recent_idx on platform_requests (platform, created_at desc);
create index platform_requests_purge_idx on platform_requests (purge_after);

select public.apply_admin_rls();

-- ── Seeds ──────────────────────────────────────────────────────────────────

-- RecipeFix destinations. `applinks:recipefix.app` is already configured, so the
-- default is the web URL rather than the App Store: an installed app opens via
-- universal links and an uninstalled one still lands somewhere useful.
update products
   set expected_handles = jsonb_build_object('brand', 'recipefix')
 where id = 'recipefix';
update products
   set expected_handles = jsonb_build_object('founder', 'isaacmineo')
 where kind = 'personal';

update products
   set destinations = jsonb_build_object(
     'web', 'https://recipefix.app',
     'app_store', 'https://apps.apple.com/app/id6759676502',
     'app_store_id', '6759676502',
     'universal_link_domain', 'recipefix.app',
     'deep_link_scheme', 'recipefix',
     'share_path', '/r'
   )
 where id = 'recipefix';

insert into watch_terms (product_id, term, sources)
select 'recipefix', v.term, v.sources
  from (values
    ('gluten free bread gummy', array['reddit','rss']),
    ('dairy free substitute', array['reddit','pinterest']),
    ('recipe scaling', array['reddit']),
    ('egg replacer baking', array['reddit','pinterest']),
    ('why did my bread', array['reddit'])
  ) as v(term, sources)
 where exists (select 1 from products where id = 'recipefix')
on conflict (product_id, term) do nothing;
