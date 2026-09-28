create or replace function public.invoke_momentcircuit_render_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_secret text;
  vercel_bypass text;
  request_id bigint;
begin
  if new.status <> 'queued' then
    return new;
  end if;

  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'momentcircuit_render_worker_secret'
  limit 1;

  select decrypted_secret into vercel_bypass
  from vault.decrypted_secrets
  where name = 'vercel_halyard_automation_bypass'
  limit 1;

  if worker_secret is null or worker_secret = '' then
    raise exception 'momentcircuit render worker secret missing';
  end if;
  if vercel_bypass is null or vercel_bypass = '' then
    raise exception 'vercel automation bypass missing';
  end if;

  select net.http_post(
    url := 'https://halyard-isaac-mineos-projects.vercel.app/api/internal/momentcircuit/render',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vercel-protection-bypass', vercel_bypass,
      'x-momentcircuit-render-secret', worker_secret
    ),
    body := jsonb_build_object('id', new.id::text),
    timeout_milliseconds := 2000
  ) into request_id;

  update public.momentcircuit_render_jobs
    set workflow_run_id = 'pgnet:' || request_id::text,
        updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists momentcircuit_render_job_insert on public.momentcircuit_render_jobs;
create trigger momentcircuit_render_job_insert
after insert on public.momentcircuit_render_jobs
for each row
when (new.status = 'queued')
execute function public.invoke_momentcircuit_render_job();

drop trigger if exists momentcircuit_render_job_retry on public.momentcircuit_render_jobs;
create trigger momentcircuit_render_job_retry
after update of status on public.momentcircuit_render_jobs
for each row
when (new.status = 'queued' and old.status is distinct from new.status)
execute function public.invoke_momentcircuit_render_job();
