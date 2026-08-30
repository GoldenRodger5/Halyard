-- §356. What a job is doing, while it is doing it.
--
-- `ctx.log` writes JSON to stdout. That is right for a worker and useless for
-- an operator: the UI cannot read the container's stdout, so pressing Generate
-- shows nothing until a render appears in the queue several minutes later.
--
-- `agent_runs` is not this. It records a row *after* an agent finishes, with
-- its cost and duration — an audit trail, not a progress feed. The wizard's
-- agent view needs to know what is happening *now*, and specifically what each
-- agent decided and why, which every director already returns and only the log
-- currently carries.
--
-- Deliberately narrow: a job id, a message, a detail blob, a time. No levels,
-- no categories, no structure to maintain. The messages are already written and
-- already good — "post format chosen", "research", "annotations planned" — and
-- inventing a taxonomy over them would be a second thing to keep in step.
create table job_events (
  id          bigserial primary key,
  job_id      uuid not null references jobs(id) on delete cascade,
  -- The message as the worker wrote it.
  message     text not null,
  -- Everything the worker passed alongside it, verbatim.
  detail      jsonb,
  at          timestamptz not null default now()
);

-- The only query this table serves: everything for one job, in order.
create index job_events_job_idx on job_events (job_id, id);

comment on table job_events is
  '§356. A job''s progress, written as it happens, so an operator can watch a '
  'run instead of waiting for its output. agent_runs is the audit trail; this '
  'is the feed.';
