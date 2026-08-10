-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — Products, brand voices, content rules
-- v1 §2 "Products & configuration" + build pack §1 (timezone columns)
-- ═══════════════════════════════════════════════════════════════════════════

create table products (
  id                text primary key,               -- 'recipefix' | 'kinolog'
  name              text not null,
  tagline           text,
  website_url       text,
  app_store_url     text,
  status            text not null default 'active'
                    check (status in ('active', 'paused', 'archived')),

  -- The overview doc, chunked. Injected into generation prompts.
  brief_markdown    text,
  brief_summary     text,                           -- compressed, always in context
  brief_updated_at  timestamptz,

  -- Live product access
  connector_type    text not null default 'none'
                    check (connector_type in ('mcp', 'rest', 'none')),
  connector_config  jsonb not null default '{}'::jsonb,   -- {url, auth_ref}

  -- Brand tokens for rendering
  brand_tokens      jsonb not null default '{}'::jsonb,
  -- {primary:'#C4714A', background:'hsl(50 20% 97%)',
  --  heading_font:'Instrument Serif', body_font:'Inter', logo_asset_id:'...'}

  -- Hard content rules, enforced in the copywriter prompt AND in the slop filter
  content_rules     jsonb not null default '{}'::jsonb,
  -- {forbidden_claims:[...], required_disclaimers:[], banned_phrases:[...]}

  -- ── build pack §1 ─────────────────────────────────────────────────────────
  -- Three separate timezone concepts. Never let these collapse into one field.
  --   storage            → always UTC (timestamptz everywhere)
  --   audience_timezone  → what the scheduler resolves slots against
  --   operator_timezone  → what the UI renders in
  audience_timezone text not null default 'America/New_York',
  operator_timezone text not null default 'America/New_York',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger products_touch before update on products
  for each row execute function public.touch_updated_at();

create table brand_voices (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  persona       text not null check (persona in ('founder', 'brand')),
  display_name  text not null,
  description   text not null default '',           -- prose voice description
  do_rules      text[] not null default '{}',
  dont_rules    text[] not null default '{}',
  examples      jsonb not null default '[]'::jsonb, -- [{platform, text, why_good}]
  -- Negative examples harvested from calibration rejections (build pack §2 step 3)
  anti_examples jsonb not null default '[]'::jsonb, -- [{text, why_bad}]
  mix_targets   jsonb not null default '{}'::jsonb, -- {transformation:0.4, product:0.15, ...}
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (product_id, persona)
);

create trigger brand_voices_touch before update on brand_voices
  for each row execute function public.touch_updated_at();
