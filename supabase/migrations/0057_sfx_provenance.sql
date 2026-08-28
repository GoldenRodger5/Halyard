-- §240. The same provenance discipline for sound effects.
--
-- An effect is as capable of being unlicensed as a track, and a fixture whoosh
-- is as dangerous as a fixture bed once it is in the table and nothing can
-- tell them apart.
alter table sound_effects
  add column if not exists provenance music_provenance not null default 'unverified',
  add column if not exists source text,
  add column if not exists licence_proof text,
  add column if not exists prohibited_platforms text[] not null default '{}',
  add column if not exists active boolean not null default true,
  add column if not exists usage_count integer not null default 0;

alter table sound_effects drop constraint if exists sound_effects_production_needs_proof;
alter table sound_effects add constraint sound_effects_production_needs_proof
  check (provenance <> 'licensed_production' or (licence_proof is not null and length(trim(licence_proof)) > 0));

create index if not exists sound_effects_selectable_idx
  on sound_effects (provenance, active, role, last_used_at nulls first);

comment on column sound_effects.provenance is
  'Same three classes as music_beds. Only licensed_production may reach a published post.';
