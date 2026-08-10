-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — Extensions, compatibility shims, shared helpers
--
-- Every migration in this directory must apply cleanly to BOTH:
--   • a Supabase project (where schema `auth` and `auth.uid()` already exist)
--   • a vanilla Postgres 17 instance (used by CI and the integration tests)
-- Nothing here may CREATE OR REPLACE anything inside Supabase's `auth` schema.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────────────────────────────────────────────────────────────────────
-- Admin identity.
--
-- Halyard is single-operator. `admin_users` is the allow-list; a Supabase Auth
-- user id must appear here to see anything at all.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists admin_users (
  user_id     uuid primary key,
  email       text,
  created_at  timestamptz not null default now()
);

-- `auth.uid()` exists on Supabase and does not exist on vanilla Postgres.
-- Calling it dynamically keeps this file portable: on vanilla PG the EXECUTE
-- raises, we swallow it, and every RLS policy evaluates to false — which is the
-- correct posture for a database with no authenticated session.
create or replace function public.current_admin_id()
returns uuid
language plpgsql
stable
as $$
declare
  uid uuid;
begin
  begin
    execute 'select auth.uid()' into uid;
  exception when others then
    return null;
  end;
  return uid;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = public.current_admin_id()
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- updated_at maintenance
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
