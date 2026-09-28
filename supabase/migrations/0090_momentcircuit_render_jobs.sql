create table if not exists public.momentcircuit_render_jobs (
  id uuid primary key default gen_random_uuid(),
  github_issue_number bigint not null unique,
  github_delivery_id text unique,
  workflow_run_id text,
  campaign_id text,
  campaign_name text,
  story_family text,
  status text not null default 'queued'
    check (status in ('queued','rendering','ready','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  sandbox_name text,
  active_cpu_ms bigint,
  network_ingress_bytes bigint,
  network_egress_bytes bigint,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists momentcircuit_render_jobs_status_created_idx
  on public.momentcircuit_render_jobs (status, created_at desc);

alter table public.momentcircuit_render_jobs enable row level security;

comment on table public.momentcircuit_render_jobs is
  'Private Halyard control-plane state for MomentCircuit cloud render jobs. Service-role only; no public RLS policies.';
