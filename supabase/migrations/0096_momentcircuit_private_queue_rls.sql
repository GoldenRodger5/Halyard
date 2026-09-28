-- Integration hardening for the MomentCircuit private cloud queues.
--
-- Both tables are service-side queues. Enabling RLS without FORCE leaves the
-- table owner able to bypass policies, while Halyard's schema contract requires
-- every RLS table to enforce the same boundary for its owner too.

alter table if exists public.momentcircuit_render_jobs force row level security;
alter table if exists public.momentcircuit_submission_jobs force row level security;

insert into schema_version (id, version, applied_at)
values (true, '0096', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
