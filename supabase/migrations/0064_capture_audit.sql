-- §329. An audit trail for automation nobody is watching.
--
-- Three capture failures on 2026-08-29 had three completely different causes
-- and produced one identical message: `"wait for the adaptation" failed.
-- Selector button:has-text("SWAPPED") did not resolve.` A person diagnosed each
-- by reading step timings out of `capture_runs` and calling the product's API by
-- hand. That worked because someone was watching, and nobody will be.
--
-- `capture_runs` already records what happened. This records what was *made of
-- it*: the failure kind, the finding in a sentence, what was tried next, and
-- whether that worked. A run that failed three times with three different
-- diagnoses is a story an operator can follow; three identical error strings
-- are not.
create table capture_audit (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  flow_id       text not null,
  capture_run_id uuid references capture_runs(id) on delete set null,

  -- The structural classification, not the message. See `FAILURE_KINDS`.
  kind          text not null,
  -- One sentence naming the evidence, written for a person.
  finding       text not null,
  -- What the diagnosis said to do. See `RECOVERIES`.
  recovery      text not null,
  -- Whether the worker acted on it without asking.
  acted         boolean not null default false,
  -- What it changed, when it acted: the step and the value it substituted.
  action_taken  jsonb,
  -- Set when a later run of the same flow succeeded, so a fix is visible.
  resolved_at   timestamptz,

  created_at    timestamptz not null default now()
);

create index capture_audit_recent_idx on capture_audit (product_id, flow_id, created_at desc);
create index capture_audit_unresolved_idx on capture_audit (created_at desc) where resolved_at is null;

comment on table capture_audit is
  '§329. Why a capture failed and what was tried next. capture_runs records what '
  'happened; this records the diagnosis, so automation nobody is watching still '
  'explains itself.';
