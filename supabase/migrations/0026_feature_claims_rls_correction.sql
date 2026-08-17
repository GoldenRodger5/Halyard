/*
 * Correct the `feature_claims` authorisation boundary.
 *
 * ## The defect
 *
 * Migration 0023 created:
 *
 *     create policy feature_claims_admin on feature_claims
 *       for all to authenticated using (true) with check (true);
 *     grant select, insert, update, delete on feature_claims to authenticated;
 *
 * `using (true)` is not a policy, it is the absence of one wearing a policy's
 * clothes. Combined with the grant, every authenticated Supabase user could
 * read and write the feature inventory through PostgREST — the one table in the
 * database holding what Halyard believes a product can do, and the input to
 * every marketing claim it will eventually make.
 *
 * This is live in production. It was found while correcting the identical
 * defect in 0025 before that one shipped, and it is fixed here rather than
 * documented because a known `using (true)` policy left in place is not a note,
 * it is an open door.
 *
 * ## Why it was invisible
 *
 * Both were written inside `if exists (select 1 from pg_roles where rolname =
 * 'authenticated')`. A plain Postgres has no such role, so the block never ran
 * locally and no test could see it. The policy existed only on Supabase.
 *
 * The lesson is in 0025's comments: **a policy must be created
 * unconditionally**, because it does not depend on a role existing. Only grants
 * are role-specific and belong inside that guard.
 *
 * ## What this restores
 *
 * The model from 0010 and 0020, which every other table already follows: RLS
 * enabled and forced, one `admin_all` policy gated on `public.is_admin()`, and
 * no privileges for `anon` or `authenticated`. The worker is unaffected — it
 * connects as a role with `rolbypassrls`, which bypasses RLS regardless of
 * FORCE.
 */

-- Remove the permissive policy. `if exists` so this is safe on a database where
-- 0023 ran without the role present and therefore created nothing.
drop policy if exists feature_claims_admin on public.feature_claims;

alter table public.feature_claims enable row level security;
alter table public.feature_claims force row level security;

-- Unconditional, for the reason above.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'feature_claims' and policyname = 'admin_all'
  ) then
    execute 'create policy admin_all on public.feature_claims for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

-- Grants are role-specific, so this is guarded.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.feature_claims from %I', r);
    end if;
  end loop;
end $$;
