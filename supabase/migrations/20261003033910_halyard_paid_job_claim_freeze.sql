-- Emergency defense-in-depth for stale worker releases.
--
-- Paid legacy jobs may only be claimed while generation is explicitly enabled.
-- During an incident freeze this blocks paid work in Postgres itself, before an
-- older worker can reach its non-atomic preflight code.

create or replace function public.claim_next_job(
  p_worker_id text,
  p_kinds text[] default null::text[]
)
returns setof public.jobs
language sql
set search_path=''
as $function$
  update public.jobs
     set status    = 'running',
         locked_at = now(),
         locked_by = p_worker_id,
         attempts  = attempts + 1
   where id = (
     select j.id
       from public.jobs j
      where j.status = 'queued'
        and j.run_after <= now()
        and (p_kinds is null or j.kind = any(p_kinds))
        and (
          j.kind not in (
            'generate','generate_concepts','correct_content','review_media','tts',
            'build_product_brain','explore_product','generate_external_visual'
          )
          or coalesce(
            (select s.generation_enabled from public.settings s where s.id=true),
            false
          ) = true
        )
      order by j.priority, j.created_at
      for update skip locked
      limit 1
   )
  returning *;
$function$;
