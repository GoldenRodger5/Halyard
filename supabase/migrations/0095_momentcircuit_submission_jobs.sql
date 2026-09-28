create table if not exists public.momentcircuit_submission_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  campaign_name text,
  story_family text,
  platform text not null check (platform in ('tiktok','instagram','youtube','facebook','x')),
  public_url text not null,
  published_at timestamptz not null,
  submission_deadline_minutes integer not null default 30 check (submission_deadline_minutes between 1 and 1440),
  status text not null default 'queued' check (status in ('queued','submitting','submitted','failed','expired','auth_required')),
  result jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, platform, public_url)
);

alter table public.momentcircuit_submission_jobs enable row level security;

revoke all on public.momentcircuit_submission_jobs from public, anon, authenticated;
grant all on public.momentcircuit_submission_jobs to service_role;

create or replace function public.set_momentcircuit_cr_session(session_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;

  select id into existing_id
  from vault.decrypted_secrets
  where name = 'momentcircuit_content_rewards_session'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(
      session_value,
      'momentcircuit_content_rewards_session',
      'Content Rewards authenticated app session for MomentCircuit cloud submissions',
      null
    );
  else
    perform vault.update_secret(
      existing_id,
      session_value,
      'momentcircuit_content_rewards_session',
      'Content Rewards authenticated app session for MomentCircuit cloud submissions',
      null
    );
  end if;
end;
$$;

revoke all on function public.set_momentcircuit_cr_session(text) from public, anon, authenticated;
grant execute on function public.set_momentcircuit_cr_session(text) to service_role;

create or replace function public.get_momentcircuit_cr_session()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  value text;
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;

  select decrypted_secret into value
  from vault.decrypted_secrets
  where name = 'momentcircuit_content_rewards_session'
  limit 1;

  return value;
end;
$$;

revoke all on function public.get_momentcircuit_cr_session() from public, anon, authenticated;
grant execute on function public.get_momentcircuit_cr_session() to service_role;

create or replace function public.invoke_momentcircuit_submission_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_secret text;
  request_id bigint;
begin
  if new.status <> 'queued' then
    return new;
  end if;

  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'momentcircuit_render_worker_secret'
  limit 1;

  if worker_secret is null or worker_secret = '' then
    raise exception 'momentcircuit worker secret missing';
  end if;

  select net.http_post(
    url := 'https://halyard-ten.vercel.app/api/internal/momentcircuit/content-rewards/submit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-momentcircuit-render-secret', worker_secret
    ),
    body := jsonb_build_object('id', new.id::text),
    timeout_milliseconds := 2000
  ) into request_id;

  update public.momentcircuit_submission_jobs
    set result = coalesce(result, '{}'::jsonb) || jsonb_build_object('pg_net_request_id', request_id),
        updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists momentcircuit_submission_job_insert on public.momentcircuit_submission_jobs;
create trigger momentcircuit_submission_job_insert
after insert on public.momentcircuit_submission_jobs
for each row
when (new.status = 'queued')
execute function public.invoke_momentcircuit_submission_job();

drop trigger if exists momentcircuit_submission_job_retry on public.momentcircuit_submission_jobs;
create trigger momentcircuit_submission_job_retry
after update of status on public.momentcircuit_submission_jobs
for each row
when (new.status = 'queued' and old.status is distinct from new.status)
execute function public.invoke_momentcircuit_submission_job();
