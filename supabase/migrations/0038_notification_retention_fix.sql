/*
 * The notification purge could never delete anything.
 *
 * 0035 made only *read* notifications eligible, reasoning that an operator who
 * has not looked yet is owed the message. The reasoning is sound and the
 * predicate is inert: **nothing in Halyard ever sets `read_at`**. There is no
 * dismiss control, no mark-as-read, and no code that writes the column — the
 * health page simply renders the twenty most recent. So `read_at is not null`
 * matched no row, and notification retention was a setting that did nothing.
 *
 * A protection that cannot fire is worse than none, because it reads as
 * coverage. Two ways out:
 *
 *  · give `read_at` a meaning by marking notifications read when displayed —
 *    which would make "read" mean "was briefly in a list of twenty", and would
 *    invent an inbox this product does not have; or
 *  · purge by age alone, and let the operator's window be the protection.
 *
 * The second is honest about what the product is. An operator's guard against
 * losing a notification they have not seen is the *length* of the window they
 * chose, which is a real control on /settings, rather than a flag nothing sets.
 *
 * `audit_log` is still never purged, and live rows in every other table are
 * still protected: a queued job is not eligible at any age.
 */
create or replace function purge_operational_logs(older_than interval)
returns table (table_name text, purged bigint)
language plpgsql
as $$
declare
  cutoff timestamptz := now() - older_than;
begin
  -- Finished jobs only. `queued` and `running` are live state.
  return query
  with deleted as (
    delete from jobs
     where status in ('done', 'failed', 'dead')
       and coalesce(finished_at, created_at) < cutoff
    returning 1
  )
  select 'jobs'::text, count(*)::bigint from deleted;

  /*
   * By age, not by read state. See the header: nothing sets `read_at`, so the
   * previous predicate deleted nothing at any window.
   */
  return query
  with deleted as (
    delete from notifications where created_at < cutoff
    returning 1
  )
  select 'notifications'::text, count(*)::bigint from deleted;

  return query
  with deleted as (
    delete from agent_runs
     where completed_at is not null and completed_at < cutoff
    returning 1
  )
  select 'agent_runs'::text, count(*)::bigint from deleted;

  return query
  with deleted as (
    delete from capability_probes
     where completed_at is not null and completed_at < cutoff
    returning 1
  )
  select 'capability_probes'::text, count(*)::bigint from deleted;

  -- Never deleted. Reported so its growth is visible rather than forgotten.
  return query
  select 'audit_log (retained, never purged)'::text, count(*)::bigint
    from audit_log where created_at < cutoff;
end;
$$;

-- The old partial index matched the old predicate and can no longer help.
drop index if exists notifications_purge_idx;
create index if not exists notifications_purge_age_idx on notifications (created_at);
