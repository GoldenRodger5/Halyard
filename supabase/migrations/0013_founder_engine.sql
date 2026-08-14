-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 — Milestones 23 and 28: the founder account
--
-- The founder posts about AI, tools and industry news, not about a product.
-- `brand_voices` was scoped to products, so there was nowhere for that content
-- to live. `products.kind = 'personal'` (added in 0011) plus RSS sources and the
-- Daily Take loop give it a home.
--
-- The Daily Take is the canonical **input-gated** workflow: the system cannot
-- proceed without an opinion, because it does not have one, and generating a
-- take unprompted would be fabrication.
-- ═══════════════════════════════════════════════════════════════════════════

create table rss_sources (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  name          text not null,
  feed_url      text not null,
  why           text,
  weight        numeric not null default 1.0,
  enabled       boolean not null default true,
  last_polled_at timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  unique (product_id, feed_url)
);

create table rss_items (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references rss_sources(id) on delete cascade,
  product_id     text not null references products(id) on delete cascade,
  guid           text not null,
  url            text not null,
  title          text not null,
  summary        text,
  author         text,
  published_at   timestamptz,
  fetched_at     timestamptz not null default now(),
  -- The same story arrives from five feeds; convergence is signal, duplication
  -- is noise. Items are grouped rather than deleted so the count survives.
  cluster_key    text,
  feed_count     int not null default 1,
  -- News decays. A take on a four-day-old story is dead on arrival.
  expires_at     timestamptz not null default now() + interval '72 hours',
  relevance      numeric,
  contested      text,
  rank_reason    text,
  status         text not null default 'new'
                 check (status in ('new','surfaced','used','skipped','expired')),
  unique (product_id, guid)
);
create index rss_items_ranked_idx on rss_items (product_id, status, relevance desc nulls last);
create index rss_items_cluster_idx on rss_items (product_id, cluster_key);

/**
 * One Daily Take. The raw input is stored alongside the draft on purpose: the
 * diff between what the founder said and what was published is voice training
 * data, and it is the only honest record of whether the draft preserved the
 * opinion.
 */
create table takes (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null references products(id) on delete cascade,
  rss_item_id     uuid references rss_items(id) on delete set null,
  -- Verbatim. Messy is fine; this is the raw material.
  raw_input       text not null,
  input_method    text not null default 'typed' check (input_method in ('typed','spoken')),
  audience        text,

  -- Step 1 and 2, which run BEFORE drafting so the founder can revise.
  fact_check      jsonb not null default '[]'::jsonb,
  fact_check_ok   boolean,
  story_verified  boolean,

  -- Step 3 and 4.
  supporting      jsonb not null default '[]'::jsonb,
  strongest_counter text,
  risk_flags      jsonb not null default '[]'::jsonb,

  -- Step 5 to 7.
  draft           text,
  likely_pushback jsonb not null default '[]'::jsonb,

  status          text not null default 'awaiting_input'
                  check (status in ('awaiting_input','checking','needs_revision',
                                    'drafted','approved','discarded')),
  content_item_id uuid references content_items(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger takes_touch before update on takes
  for each row execute function public.touch_updated_at();

/** v2 I.5's sibling: tools and finds, captured from anywhere. */
create table finds (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null references products(id) on delete cascade,
  url            text not null,
  title          text,
  summary        text,
  suggested_angle text,
  -- The one line only the founder can write. Without it, nothing is generated.
  why_useful     text,
  source         text not null default 'paste'
                 check (source in ('paste','bookmarklet','shortcut','rss')),
  status         text not null default 'new'
                 check (status in ('new','drafted','used','discarded')),
  content_item_id uuid references content_items(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (product_id, url)
);

select public.apply_admin_rls();

-- ── The founder product ────────────────────────────────────────────────────
insert into products (id, name, tagline, kind, connector_type, status,
                      brand_tokens, content_rules, audience_timezone, operator_timezone,
                      brief_summary)
values (
  'founder', 'Isaac', 'Building RecipeFix and Kinolog in public', 'personal', 'none', 'active',
  jsonb_build_object('primary', '#3C6E71', 'background', 'hsl(50 20% 97%)',
                     'ink', '#2A2320', 'muted', '#7A6E66', 'accent', '#C4714A',
                     'heading_font', 'Instrument Serif', 'body_font', 'Inter'),
  jsonb_build_object('forbidden_claims', jsonb_build_array('medical or allergy-safety guarantee'),
                     'banned_phrases', jsonb_build_array('hot take', 'unpopular opinion', 'thread 🧵')),
  'America/New_York', 'America/New_York',
  'A solo founder building RecipeFix, a recipe adaptation app, and Kinolog, a movie diary. Posts about AI, developer tools, consumer apps and what it is actually like to ship them.'
) on conflict (id) do nothing;

insert into onboarding_state (product_id) values ('founder')
  on conflict (product_id) do nothing;

-- 70% non-promotional, 20% building and operating, 10% direct promotion.
-- The 10% is a ceiling, enforced the same way the brand product ceiling is.
insert into brand_voices (product_id, persona, display_name, description, do_rules, dont_rules, mix_targets)
values (
  'founder', 'founder', 'Isaac',
  'A person building something in public who reads a lot and has opinions about what he reads. Specific over clever. Says what went wrong before what went right.',
  array[
    'Lead with the thing that surprised you',
    'Name the trade-off, not just the win',
    'Short sentences. Fragments are fine',
    'If it is a take, commit to it'
  ],
  array[
    'Never post an opinion you did not actually express',
    'No growth-hacking voice',
    'No thread-bait numbering',
    'Never criticise a named person without meaning it'
  ],
  jsonb_build_object('founder_insight', 0.70, 'education', 0.20, 'product', 0.10)
) on conflict (product_id, persona) do nothing;

insert into format_cadence (product_id, format, weekly_floor, weekly_ceiling, reason)
values
  ('founder', 'text', 3, 14, 'The founder account lives on text. The ceiling stops it becoming a feed of noise.'),
  ('founder', 'image', 0, 4, null),
  ('founder', 'video', 0, 2, 'Founder video is expensive and rarely the right format for a take.')
on conflict (product_id, format) do nothing;

-- ── Seeded RSS sources ─────────────────────────────────────────────────────
--
-- RSS rather than a paid news API: free, and higher signal for this use case.
-- The Hacker News points filter is the single biggest noise reduction available.
insert into rss_sources (product_id, name, feed_url, why, weight) values
  ('founder', 'Hacker News, 100+ points', 'https://hnrss.org/frontpage?points=100',
   'Community-filtered. Dramatically less noise than the raw front page.', 1.4),
  -- Anthropic publish no official RSS feed. This is a community mirror, and it
  -- is the one source here that can disappear without warning — the seeded URL
  -- (anthropic.com/news/rss.xml) 404'd from the day it was written, which the
  -- feed-error column now surfaces on /settings/health instead of hiding.
  ('founder', 'Anthropic news', 'https://rsshub.bestblogs.dev/anthropic/news',
   'Primary source for model and policy announcements.', 1.3),
  ('founder', 'OpenAI news', 'https://openai.com/news/rss.xml',
   'Primary source.', 1.3),
  ('founder', 'Hugging Face blog', 'https://huggingface.co/blog/feed.xml',
   'Model and tooling releases, usually before the mainstream picks them up.', 1.0),
  ('founder', 'arXiv cs.AI', 'https://rss.arxiv.org/rss/cs.AI',
   'Primary research. High volume, so weighted down.', 0.6),
  ('founder', 'MIT Technology Review AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed',
   'Editorial analysis rather than announcement.', 1.0),
  ('founder', 'The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
   'Mainstream framing. Useful for knowing what non-technical people will have read.', 0.9),
  ('founder', 'TLDR AI', 'https://tldr.tech/api/rss/ai',
   'Compressed daily digest. Good for catching what everything else missed.', 0.8)
on conflict (product_id, feed_url) do nothing;
