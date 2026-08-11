-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — Take the table grants away from anon and authenticated
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Found on the first hosted deploy, and invisible locally.
 *
 * Supabase grants `anon` and `authenticated` full table privileges in `public`
 * by default, and exposes every table through PostgREST. `apply_admin_rls()`
 * enabled and forced RLS on all 57 tables, which is what a local check sees and
 * calls done — but RLS is a filter on *rows*, and the grant is permission to
 * *reach the table at all*.
 *
 * The difference showed up as an HTTP status. With the anon key, 30 tables
 * answered 401 (no privilege) and 27 answered `200 []` (privilege, zero rows).
 * Among the 27: `pending_connections`, which holds sealed OAuth tokens while an
 * operator confirms an identity, and `link_clicks`, which is the attribution
 * record. Those 27 had exactly one thing standing between the public internet
 * and their contents — a single `using (public.is_admin())` policy — where they
 * were supposed to have two.
 *
 * Nothing in Halyard uses PostgREST. The web app and the worker both connect as
 * `postgres` over a pooled connection with `DATABASE_URL`, and the two public
 * surfaces (`/r` and `/l`) are server-rendered routes that use the same pool.
 * So there is no reason for `anon` to hold any privilege here at all, and
 * revoking costs nothing.
 *
 * Defence in depth is the whole argument: a policy that is wrong once should not
 * be the only thing between a stranger and a token.
 */

/**
 * Guarded on the roles existing.
 *
 * `anon` and `authenticated` are Supabase's, not Postgres's. A plain Postgres —
 * which is what local development and CI both run — has neither, and an
 * unguarded `revoke` there is a hard error that stops the whole migration. So
 * this has to be conditional, and the condition is the reason it is a DO block
 * rather than three plain statements.
 */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    revoke all on all functions in schema public from anon;
    -- And for every object created from here on, so this cannot regress.
    alter default privileges in schema public revoke all on tables from anon;
    alter default privileges in schema public revoke all on sequences from anon;
    alter default privileges in schema public revoke all on functions from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
    revoke all on all functions in schema public from authenticated;
    alter default privileges in schema public revoke all on tables from authenticated;
    alter default privileges in schema public revoke all on sequences from authenticated;
    alter default privileges in schema public revoke all on functions from authenticated;
  end if;
end;
$$;

/**
 * Fold the revoke into the helper every migration already calls.
 *
 * `apply_admin_rls()` was the thing each migration ran to make a new table safe.
 * It made the table safe in one of the two ways that matter, which is why this
 * went unnoticed through nineteen migrations.
 */
create or replace function public.apply_admin_rls()
returns int
language plpgsql
as $$
declare
  t record;
  applied int := 0;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and (c.relrowsecurity = false or c.relforcerowsecurity = false)
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('alter table public.%I force row level security', t.relname);
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t.relname and policyname = 'admin_all'
    ) then
      execute format(
        'create policy admin_all on public.%I for all
           using (public.is_admin()) with check (public.is_admin())', t.relname);
    end if;
    applied := applied + 1;
  end loop;

  -- The half that was missing. Cheap, idempotent, and it closes the gap for
  -- every table rather than for the ones somebody remembered. Guarded, because
  -- these roles exist on Supabase and not on a plain Postgres.
  for t in select rolname from pg_roles where rolname in ('anon', 'authenticated')
  loop
    execute format('revoke all on all tables in schema public from %I', t.rolname);
    execute format('revoke all on all sequences in schema public from %I', t.rolname);
  end loop;

  return applied;
end;
$$;

select public.apply_admin_rls();
