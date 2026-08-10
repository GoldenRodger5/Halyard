-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 — Row Level Security on every table
--
-- Halyard is single-operator. The policy is uniform: an authenticated user who
-- appears in admin_users sees everything; everyone else sees nothing. The
-- worker connects with the service role, which bypasses RLS by design.
--
-- The one exception is social_accounts: even the admin must not be able to read
-- token ciphertext through PostgREST. Column-level privileges enforce that, so
-- a client SELECT * on that table errors rather than leaking bytea.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  tables text[] := array[
    'admin_users','products','brand_voices','social_accounts','assets',
    'signals','series','hooks','ideas','content_items','templates','renders',
    'jobs','publications','post_metrics','attribution','performance_scores',
    'audit_log','slots','voice_lexicon','comments','comment_replies',
    'submissions','references_swipe','compose_sessions','settings',
    'onboarding_state','calibration_reviews','worker_heartbeats','notifications'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy admin_all on public.%I for all
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

-- ── Token columns are server-only (v1 §7, v1 §10) ──────────────────────────
-- Revoke the ciphertext columns from the roles PostgREST runs as. On vanilla
-- Postgres these roles do not exist, so the grants are skipped.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.social_accounts from authenticated, anon;
    grant select (
      id, product_id, platform, persona, handle, platform_user_id,
      token_expires_at, scopes, capability_state, capability_detail,
      supported_formats, rate_limit_config, link_strategy, bio_link_url,
      last_verified_at, last_error, created_at, updated_at
    ) on public.social_accounts to authenticated;
    grant insert, update, delete on public.social_accounts to authenticated;
  end if;
end;
$$;

-- Anonymous callers get nothing anywhere.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
end;
$$;
