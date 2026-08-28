-- §233. Sound effects, with the same licence discipline as music beds.
--
-- Separate from `music_beds` rather than a `kind` column on it, because the
-- two are selected on entirely different axes. A bed is chosen by mood,
-- energy and tempo and has to cover a runtime; an effect is chosen by what
-- moment it marks and is a fraction of a second. One table with half its
-- columns null for every row is a table pretending to be two.
--
-- Ships empty, and deliberately. Inventing a licensed sound effect is the
-- same class of fabrication as inventing a licensed track or product
-- evidence -- see §221.
create table if not exists sound_effects (
  id uuid primary key default gen_random_uuid(),
  product_id text references products(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  title text not null,

  -- What moment this marks. Constrained, because an effect library with free
  -- text here becomes unsearchable at about thirty rows.
  role text not null check (role in (
    'transition',   -- between beats: a whoosh, a swipe
    'impact',       -- a cut landing: a thud, a hit
    'accent',       -- a word or number appearing: a tick, a pop
    'ui',           -- a product interaction: a tap, a toggle
    'ambience',     -- a bed of room tone under a demo
    'texture'       -- subject-matter sound: a sizzle, a pour, a knife
  )),
  duration_seconds numeric(6,3) not null check (duration_seconds > 0),
  -- Peak loudness relative to the mix, so an effect cannot be louder than the
  -- voice it is punctuating.
  peak_db numeric(5,2) not null default -18,

  -- Licence, first-class and identical in shape to `music_beds`. An effect is
  -- as capable of being unlicensed as a track.
  licence text not null,
  licensor text,
  licence_url text,
  attribution_required boolean not null default false,
  attribution_text text,
  platform_restrictions text[] not null default '{}',
  expires_at timestamptz,

  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sound_effects_role_idx on sound_effects (role, last_used_at nulls first);
create index if not exists sound_effects_product_idx on sound_effects (product_id);

-- Same shape as `music_beds` (§221). `schema.test.ts` asserts every table
-- carries this, and a table that ships without it is the defect §221 caught
-- in `learned_insights`.
alter table sound_effects enable row level security;
alter table sound_effects force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='sound_effects' and policyname='admin_all'
  ) then
    execute 'create policy admin_all on public.sound_effects for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.sound_effects from %I', r);
    end if;
  end loop;
end $$;
