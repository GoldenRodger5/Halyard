-- §566. The database says which migration it was built to.
--
-- Halyard had no migration bookkeeping of any kind on the path CI and the
-- laptop use: `scripts/db-reset.ts` applies every file in order and records
-- nothing, so "which schema is this?" was answerable only by looking at the
-- columns and guessing. Production is worse rather than better — the Supabase
-- CLI keeps its own ledger in `supabase_migrations.schema_migrations`, a schema
-- the application cannot see and CI does not have — so the two environments had
-- no marker in common, and no check could compare them.
--
-- One row, in Halyard's own schema, written by the migrations themselves. It is
-- therefore true wherever the migrations ran, by whichever runner, and the web
-- tier can compare it against the migrations present in the deployed checkout.
--
-- The contract this creates: **every new migration stamps its own number as its
-- last statement.** `schemaVersion.test.ts` reads the migrations directory and
-- fails when the newest file does not, which is the only thing that keeps the
-- marker from silently going stale — the same discipline `assetKinds.test.ts`
-- applies to the kind constraints.

create table if not exists schema_version (
  id         boolean primary key default true check (id),
  version    text not null,
  applied_at timestamptz not null default now()
);

alter table schema_version enable row level security;
alter table schema_version force row level security;

-- Readable by the operator surfaces, writable only by migrations (which run as
-- the owner and bypass RLS). A release marker nobody can read is not a marker.
drop policy if exists schema_version_admin_all on schema_version;
create policy schema_version_admin_all on schema_version
  using (is_admin()) with check (is_admin());

insert into schema_version (id, version, applied_at)
values (true, '0082', now())
on conflict (id) do update
  set version = excluded.version, applied_at = excluded.applied_at;
