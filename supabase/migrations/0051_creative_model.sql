-- §218. Creative structure becomes first-class.
--
-- Everything a creative decision knows lived inside `renders.input_props`: the
-- beats, the caption treatment, the visual choices. That works exactly until
-- something other than the renderer needs to read it — an operator choosing
-- between directions, a platform variant sharing a premise, a critic asking
-- what this piece was *trying* to do, a learner correlating treatment against
-- performance. All of them had to reverse-engineer intent out of render props.
--
-- Three tables, and the separation between them is the point:
--
--   concepts          what to make, and why this rather than something else
--   creative_briefs   how to make it, for one platform
--   platform_variants what actually shipped there, and how it differed
--
-- A concept outlives any render. A brief outlives any attempt. A variant is the
-- thing a platform received.

-- ── Concepts ───────────────────────────────────────────────────────────────

create table if not exists concepts (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,

  -- Lineage backwards. All nullable: an operator can compose a concept from
  -- nothing, and a concept that came from an idea should say so.
  idea_id uuid references ideas(id) on delete set null,
  signal_id uuid references signals(id) on delete set null,
  strategy_decision_id uuid references strategy_decisions(id) on delete set null,

  title text not null,
  -- The one-sentence answer to "what is this?". Not the hook.
  premise text not null,
  -- The opening line this concept is built around. May be refined later by the
  -- hook writer; recorded here because a concept whose hook changes is a
  -- different concept.
  hook text,
  audience text,
  objective text not null check (objective in
    ('awareness','engagement','education','traffic','conversion','retention',
     'follower_growth','product_promotion')),
  -- How it should feel. Drives voice, music and motion downstream.
  emotional_angle text,

  -- The creative shape, as structure rather than prose.
  story_structure jsonb not null default '{}',
  visual_treatment jsonb not null default '{}',
  audio_direction jsonb not null default '{}',

  -- Which platforms this concept is *for*. A concept may deliberately suit one.
  platform_intent text[] not null default '{}',

  -- Why this rather than the others generated beside it. The sentence an
  -- operator reads when choosing, and the one a learner reads afterwards.
  differentiation text,

  -- What must be true or available for this to be publishable. Checked before
  -- production rather than discovered during it.
  evidence_requirements jsonb not null default '[]',
  imagery_requirements jsonb not null default '[]',
  retention_strategy text,

  -- Scoring. `score_breakdown` keeps the terms so a ranking can be argued with.
  score numeric,
  score_breakdown jsonb not null default '{}',

  status text not null default 'proposed'
    check (status in ('proposed','selected','rejected','used','expired')),
  rejected_reason text,
  selected_at timestamptz,

  -- Concepts are generated in batches and compared against each other; the
  -- batch is what makes "chosen over N others" meaningful.
  batch_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists concepts_open_idx
  on concepts (product_id, status, score desc nulls last)
  where status = 'proposed';
create index if not exists concepts_batch_idx on concepts (batch_id);

comment on table concepts is
  'A creative direction: what to make and why this rather than something else. Outlives any render.';
comment on column concepts.differentiation is
  'Why this concept rather than the others generated beside it. Read by the operator choosing, and by the learner afterwards.';
comment on column concepts.evidence_requirements is
  'What must be available for this to be publishable — a capture, a verified fact. Checked before production, not during.';

-- ── Creative briefs ────────────────────────────────────────────────────────

create table if not exists creative_briefs (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  account_id uuid references social_accounts(id) on delete set null,
  platform text not null,

  -- The creative type chosen for this platform. A concept can be told as a
  -- how-to on one surface and a myth/fact on another.
  treatment text not null,
  -- 'editorial' | 'punch' (§211). Stored because it decides typography, fill
  -- and motion, and a critic needs to know which register was intended.
  presentation_mode text not null default 'punch'
    check (presentation_mode in ('editorial','punch')),
  target_seconds numeric,
  aspect_ratio text,

  -- The storyboard. Beats as the plan produced them, before timing.
  beats jsonb not null default '[]',
  visual_direction jsonb not null default '{}',
  audio_direction jsonb not null default '{}',
  caption_direction jsonb not null default '{}',

  -- Everything this brief rests on, for the lineage §12 requires.
  evidence text[] not null default '{}',
  rationale text,

  created_at timestamptz not null default now()
);

create index if not exists creative_briefs_concept_idx on creative_briefs (concept_id, platform);

comment on table creative_briefs is
  'How to make one concept, for one platform. The storyboard, before it becomes render props.';

-- ── Platform variants ──────────────────────────────────────────────────────

create table if not exists platform_variants (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts(id) on delete cascade,
  brief_id uuid references creative_briefs(id) on delete set null,
  -- The item that actually carries this to the platform.
  content_item_id uuid references content_items(id) on delete cascade,
  platform text not null,

  -- What differs here. The whole reason variants are first-class: TikTok,
  -- Reels and Shorts shared one render file because nothing could express that
  -- they should not.
  aspect_ratio text,
  target_seconds numeric,
  pacing text,
  text_density text,
  hook_treatment text,
  cta text,
  audio_treatment text,

  -- The render this variant produced, when it has one.
  render_id uuid references renders(id) on delete set null,

  -- Whether this platform should receive the piece at all. A concept that does
  -- not suit Pinterest should say so rather than producing a weak pin.
  decision text not null default 'produce'
    check (decision in ('produce','reuse','defer','skip')),
  decision_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One variant per platform per concept. A second is a revision, not a sibling.
create unique index if not exists platform_variants_unique_idx
  on platform_variants (concept_id, platform);

comment on table platform_variants is
  'What one platform received, and how it differed. Isolated: one platform failing must not corrupt another.';
comment on column platform_variants.decision is
  'skip is a real answer. A concept that does not suit a platform should say so rather than producing a weak post.';

-- ── RLS, matching every other table ────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['concepts', 'creative_briefs', 'platform_variants'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = 'admin_all'
    ) then
      execute format(
        'create policy admin_all on public.%I for all using (public.is_admin()) with check (public.is_admin())',
        t);
    end if;
  end loop;
end $$;

do $$
declare r text; t text;
begin
  foreach t in array array['concepts', 'creative_briefs', 'platform_variants'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on public.%I from %I', t, r);
      end if;
    end loop;
  end loop;
end $$;

-- Content items point back at the concept they came from, closing the loop:
-- signal → idea → strategy → concept → brief → variant → content_item.
alter table content_items
  add column if not exists concept_id uuid references concepts(id) on delete set null,
  add column if not exists brief_id uuid references creative_briefs(id) on delete set null;

comment on column content_items.concept_id is
  'The creative direction this post came from. Null for items composed before concepts existed.';
