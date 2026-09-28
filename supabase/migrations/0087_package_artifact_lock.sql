-- 0087 — one normalized product artifact per CreativePackage.
--
-- A package may have many platform variants, but they must not independently
-- sample different product output and still claim to be the same creative idea.
-- The first evidence-bearing variant locks the real artifact; siblings reuse it.
alter table product_artifacts
  add column if not exists concept_id uuid references concepts(id) on delete set null,
  add column if not exists imagery jsonb not null default '[]'::jsonb;

create unique index if not exists product_artifacts_concept_unique_idx
  on product_artifacts (product_id, concept_id)
  where concept_id is not null;

comment on column product_artifacts.concept_id is
  'CreativePackage whose platform variants share this normalized product artifact.';
comment on column product_artifacts.imagery is
  'Normalized product-supplied imagery with provenance/licence metadata; never generated proof.';

select public.apply_admin_rls();

insert into schema_version (id, version, applied_at)
values (true, '0087', now())
on conflict (id) do update
  set version = excluded.version, applied_at = excluded.applied_at;
