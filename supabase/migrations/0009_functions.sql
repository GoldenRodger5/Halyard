-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — Server-side functions: job claiming, lock reaping, mix debt
-- v1 §6, v2 G.2
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Claim exactly one job. FOR UPDATE SKIP LOCKED (v1 §6). ─────────────────
-- Two workers polling concurrently must never receive the same row. The
-- integration test in packages/db/src/__tests__/jobPoller.test.ts fires N
-- concurrent claims at M jobs and asserts zero overlap.
create or replace function public.claim_next_job(p_worker_id text, p_kinds text[] default null)
returns setof jobs
language sql
volatile
as $$
  update jobs
     set status    = 'running',
         locked_at = now(),
         locked_by = p_worker_id,
         attempts  = attempts + 1
   where id = (
     select id
       from jobs
      where status = 'queued'
        and run_after <= now()
        and (p_kinds is null or kind = any(p_kinds))
      order by priority, created_at
        for update skip locked
      limit 1
   )
  returning *;
$$;

-- ── Stale lock reaper (v1 §6): locked_at < now() - 30 min → requeue ────────
create or replace function public.reap_stale_jobs(p_timeout interval default interval '30 minutes')
returns int
language plpgsql
volatile
as $$
declare
  reaped int;
begin
  with stale as (
    update jobs
       set status     = case when attempts >= max_attempts then 'dead' else 'queued' end,
           locked_at  = null,
           locked_by  = null,
           last_error = coalesce(last_error, 'stale lock reaped')
     where status = 'running'
       and locked_at < now() - p_timeout
    returning 1
  )
  select count(*) into reaped from stale;
  return reaped;
end;
$$;

-- ── v2 G.2 — content-mix debt is the primary driver of idea selection ──────
-- Actual mix over a trailing window, per category, for one product+persona.
create or replace function public.content_mix_actual(
  p_product_id text,
  p_persona    text,
  p_days       int default 21
)
returns table (category text, published int, share numeric)
language sql
stable
as $$
  with published as (
    select ci.category
      from content_items ci
     where ci.product_id = p_product_id
       and ci.persona    = p_persona
       and ci.status     = 'published'
       and ci.published_at > now() - make_interval(days => p_days)
  ),
  total as (select greatest(count(*), 1)::numeric as n from published)
  select p.category,
         count(*)::int as published,
         round(count(*)::numeric / (select n from total), 4) as share
    from published p
   group by p.category;
$$;

-- ── v2 G.2 hard cap — never more than 15% product content in any trailing
-- 14-day window, regardless of scores. Exposed as a function so the idea engine
-- and the UI read the same number.
create or replace function public.product_content_share(
  p_product_id text,
  p_persona    text,
  p_days       int default 14
)
returns numeric
language sql
stable
as $$
  select coalesce(
    round(
      count(*) filter (where category = 'product')::numeric
      / nullif(count(*), 0), 4),
    0)
    from content_items
   where product_id = p_product_id
     and persona    = p_persona
     and status in ('published','scheduled','approved')
     and coalesce(published_at, scheduled_at, created_at) > now() - make_interval(days => p_days);
$$;

-- ── Queue depth, for the health page and the queue-depth alert ─────────────
create or replace function public.queue_health()
returns table (
  queued int, running int, failed_24h int, dead int, oldest_queued_seconds int
)
language sql
stable
as $$
  select
    count(*) filter (where status = 'queued')::int,
    count(*) filter (where status = 'running')::int,
    count(*) filter (where status = 'failed' and created_at > now() - interval '24 hours')::int,
    count(*) filter (where status = 'dead')::int,
    coalesce(extract(epoch from now() - min(created_at) filter (where status = 'queued'))::int, 0)
  from jobs;
$$;
