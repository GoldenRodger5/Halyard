/*
 * Technical purge capability for operational logs.
 *
 * ## What this is, and what it deliberately is not
 *
 * This is the *capability* to bound five tables that currently grow without
 * limit. It is **not** a retention policy. No schedule calls it, and it takes
 * the window as an argument rather than carrying a number of its own, because
 * how long Halyard keeps an operator's data is a product and legal decision and
 * not one the schema should quietly make.
 *
 * `platform_requests` already had both halves — a `purge_after` column and a
 * cron that enforces seven days — and is untouched here.
 *
 * ## Why these five and not others
 *
 * `jobs`, `notifications`, `agent_runs` and `capability_probes` are operational
 * exhaust: they record that the machine did something, and nothing downstream
 * reads them after the fact. Each is already scrubbed at its write, so what is
 * being bounded is volume rather than exposure.
 *
 * Only *finished* rows are eligible. A queued or running job is live state, not
 * a log, and deleting one would lose work rather than history. The same reason
 * keeps unread notifications: an operator who has not looked yet is owed the
 * message.
 *
 * ## audit_log is excluded, on purpose
 *
 * It records what a *human* decided — approvals, disconnections, accepted
 * rules. That is the one table whose retention is a compliance question rather
 * than a housekeeping one, and the answer is not the schema's to assume. It is
 * listed in the report below so its growth is visible, and never deleted.
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

  -- Read notifications only. An unread one has not done its job yet.
  return query
  with deleted as (
    delete from notifications
     where read_at is not null and created_at < cutoff
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

comment on function purge_operational_logs(interval) is
  'Technical capability only. Deletes finished operational rows older than the given interval and reports what it removed. audit_log is counted, never deleted. No schedule calls this: the retention window is a product decision.';

-- Purge predicates scan by time; without these the function table-scans.
create index if not exists jobs_purge_idx on jobs (finished_at) where status in ('done','failed','dead');
create index if not exists notifications_purge_idx on notifications (created_at) where read_at is not null;
create index if not exists agent_runs_purge_idx on agent_runs (completed_at);
create index if not exists capability_probes_purge_idx on capability_probes (completed_at);
