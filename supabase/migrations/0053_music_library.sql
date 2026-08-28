-- §221. A music library with the metadata a director needs.
--
-- The mixer, the ducking and the loudness normalisation have all existed and
-- been tested for months, against a library holding **zero beds**. So every
-- video Halyard has ever produced ships narration-only, and the selection that
-- did exist rotated least-recently-used with no idea what any track sounded
-- like: `assets.caption` held the licence as free text and there was nowhere to
-- record mood, tempo or energy.
--
-- This table is the metadata. The *bytes* stay in `assets`, because a bed is an
-- audio file like any other and two storage paths for one thing is how they
-- drift. What is here is everything a Music Director needs to choose, and
-- everything a licence audit needs to answer for.
--
-- It ships EMPTY, and deliberately so. Inventing a licensed track would be the
-- same class of fabrication as inventing product evidence.
create table if not exists music_beds (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  product_id text references products(id) on delete cascade,

  title text not null,
  artist text,

  -- What it sounds like. A director matches these against creative direction;
  -- nothing here is inferred from the audio, it is what the licensor stated.
  mood text not null check (mood in
    ('warm','bright','calm','driving','playful','tense','melancholy','confident')),
  energy numeric not null check (energy >= 0 and energy <= 1),
  bpm integer check (bpm is null or (bpm > 30 and bpm < 220)),
  genre text,
  instrumentation text[] not null default '{}',

  -- How it can be cut. A bed with no clean loop cannot back a 30s piece from a
  -- 12s file without an audible seam.
  duration_seconds numeric not null,
  loopable boolean not null default false,
  -- Seconds of usable intro before the bed establishes itself, so a director
  -- can start under a hook rather than mid-phrase.
  intro_seconds numeric,

  -- Licence, first-class rather than a caption. The same reasoning as
  -- ArtifactImage (§216): where it came from and what may be done with it are
  -- different questions, and the second is the one that gets people sued.
  licence text not null,
  licensor text,
  licence_url text,
  -- Whether attribution must be rendered, and what it must say.
  attribution_required boolean not null default false,
  attribution_text text,
  -- Platforms this licence does NOT cover. Empty means all connected ones.
  platform_restrictions text[] not null default '{}',
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists music_beds_pick_idx
  on music_beds (product_id, mood, energy);

comment on table music_beds is
  'Licensed music with the metadata a director needs. Ships empty — inventing a licensed track is the same fabrication as inventing product evidence.';
comment on column music_beds.licence is
  'Required. A bed without stated licence terms cannot be selected, because "probably fine" is not a licence.';
comment on column music_beds.platform_restrictions is
  'Platforms this licence does not cover. Checked before selection, not after publication.';

alter table music_beds enable row level security;
alter table music_beds force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='music_beds' and policyname='admin_all'
  ) then
    execute 'create policy admin_all on public.music_beds for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.music_beds from %I', r);
    end if;
  end loop;
end $$;
