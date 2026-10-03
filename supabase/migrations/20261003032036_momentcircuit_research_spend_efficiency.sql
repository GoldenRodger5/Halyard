-- Make paid trend/campaign research sparse, single-attempt, and budget-aware.
create or replace function public.momentcircuit_trend_cloud_dispatch_tick(p_limit integer default 1)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  ctl record;
  a public.momentcircuit_horizon_actions%rowtype;
  request_id bigint;
  dispatched integer:=0;
  items jsonb:='[]'::jsonb;
  spend jsonb;
  v_limit integer:=1;
begin
  if p_limit is null or p_limit<1 or p_limit>4 then raise exception 'TREND_CLOUD_DISPATCH_LIMIT_INVALID'; end if;
  v_limit:=least(p_limit,1);
  perform public.momentcircuit_trend_cloud_reconcile_tick(6);

  select generation,active_run_id,lease_expires_at into ctl
  from public.momentcircuit_pipeline_control where singleton=true;
  if ctl.active_run_id is null or ctl.lease_expires_at is null
     or ctl.lease_expires_at<=now()+interval '2 minutes' then
    return jsonb_build_object('state','NO_ACTIVE_RUN','dispatched',0,'observed_at',now());
  end if;

  spend:=public.halyard_spend_status();
  if coalesce((spend->>'remaining_usd')::numeric,0)<0.04 then
    return jsonb_build_object('state','GLOBAL_SPEND_CAP_BLOCKED','dispatched',0,
      'remaining_usd',spend->>'remaining_usd','required_reservation_usd',0.04,'observed_at',now());
  end if;

  for a in
    select * from public.momentcircuit_horizon_actions
    where action_type in ('REFRESH_MARKET_TREND_SIGNAL','REFRESH_TREND_SIGNAL')
      and state='PENDING' and generation=ctl.generation and run_id=ctl.active_run_id
      and coalesce(not_before,now())<=now()
      and coalesce(expires_at,now()+interval '1 minute')>now()
      and coalesce(nullif(payload->>'cloud_trend_attempt_count','')::integer,0)<1
      and coalesce(payload->>'cloud_trend_request_id','')=''
    order by case when action_type='REFRESH_MARKET_TREND_SIGNAL' then 0 else 1 end,
      coalesce(nullif(payload->>'market_position','')::integer,999999),created_at,id
    limit v_limit for update skip locked
  loop
    select net.http_post(
      url:='https://halyard-git-main-isaac-mineos-projects.vercel.app/api/internal/momentcircuit/v4/research-trend',
      headers:=public.momentcircuit_worker_headers(),
      body:=jsonb_build_object('action_id',a.id),timeout_milliseconds:=290000
    ) into request_id;
    update public.momentcircuit_horizon_actions
    set state='IN_PROGRESS',
        payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
          'cloud_trend_request_id',request_id,
          'cloud_trend_attempt_count',coalesce(nullif(payload->>'cloud_trend_attempt_count','')::integer,0)+1,
          'cloud_trend_worker_version','LUNA_ONE_SHOT_V4',
          'cloud_trend_requested_at',now(),
          'cloud_trend_worker','HALYARD_OPENAI_RESPONSES_WEB_SEARCH'),
        last_error=null,updated_at=now()
    where id=a.id;
    dispatched:=dispatched+1;
    items:=items||jsonb_build_array(jsonb_build_object(
      'action_id',a.id,'action_type',a.action_type,'campaign_id',a.payload->>'campaign_id',
      'campaign_name',a.payload->>'campaign_name','request_id',request_id));
  end loop;
  return jsonb_build_object('state',case when dispatched>0 then 'CLOUD_TREND_DISPATCHED'
    else 'NO_CLOUD_TREND_WORK' end,'dispatched',dispatched,'items',items,'observed_at',now());
end
$function$;

create or replace function public.momentcircuit_trend_cloud_tick()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare pr jsonb; mq jsonb; pq jsonb; r jsonb; d jsonb;
begin
  pr:=public.momentcircuit_reconcile_platform_trend_actions();
  mq:=public.momentcircuit_enqueue_market_trend_refresh_actions(4);
  pq:=public.momentcircuit_enqueue_trend_refresh_actions();
  r:=public.momentcircuit_trend_cloud_reconcile_tick(6);
  d:=public.momentcircuit_trend_cloud_dispatch_tick(1);
  return jsonb_build_object('platform_reconcile',pr,'market_queue',mq,'platform_queue',pq,
    'reconcile',r,'dispatch',d,'observed_at',now());
end
$function$;

create or replace function public.momentcircuit_campaign_deep_read_cloud_dispatch_tick(p_limit integer default 1)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  ctl record;
  a public.momentcircuit_horizon_actions%rowtype;
  request_id bigint;
  dispatched integer:=0;
  invalid_identity integer:=0;
  items jsonb:='[]'::jsonb;
  spend jsonb;
  v_limit integer:=1;
begin
  if p_limit is null or p_limit<1 or p_limit>4 then raise exception 'CAMPAIGN_DEEP_READ_CLOUD_DISPATCH_LIMIT_INVALID'; end if;
  v_limit:=least(p_limit,1);
  perform public.momentcircuit_campaign_deep_read_cloud_reconcile_tick(6);
  perform public.momentcircuit_enqueue_campaign_rotation_actions(3);

  select generation,active_run_id,lease_expires_at into ctl
  from public.momentcircuit_pipeline_control where singleton=true;
  if ctl.active_run_id is null or ctl.lease_expires_at is null
     or ctl.lease_expires_at<=now()+interval '2 minutes' then
    return jsonb_build_object('state','NO_ACTIVE_RUN','dispatched',0,'observed_at',now());
  end if;

  spend:=public.halyard_spend_status();
  if coalesce((spend->>'remaining_usd')::numeric,0)<0.06 then
    return jsonb_build_object('state','GLOBAL_SPEND_CAP_BLOCKED','dispatched',0,
      'remaining_usd',spend->>'remaining_usd','required_reservation_usd',0.06,'observed_at',now());
  end if;

  update public.momentcircuit_horizon_actions
  set state='BLOCKED',last_error='CAMPAIGN_DEEP_READ_CANONICAL_ID_MISSING',
      payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
        'cloud_deep_read_blocked_at',now(),
        'cloud_deep_read_blocker','CAMPAIGN_DEEP_READ_CANONICAL_ID_MISSING',
        'rule','Deep-read requires canonical Content Rewards campaign identity.'),
      updated_at=now()
  where action_type='DEEP_READ_CAMPAIGN_CANDIDATE' and generation=ctl.generation
    and state='PENDING' and coalesce(not_before,now())<=now()
    and nullif(payload->>'campaign_id','') is null;
  get diagnostics invalid_identity=row_count;

  for a in
    select * from public.momentcircuit_horizon_actions
    where action_type='DEEP_READ_CAMPAIGN_CANDIDATE'
      and state='PENDING' and generation=ctl.generation and run_id=ctl.active_run_id
      and coalesce(not_before,now())<=now()
      and coalesce(expires_at,now()+interval '1 minute')>now()
      and nullif(payload->>'campaign_id','') is not null
      and coalesce(nullif(payload->>'cloud_deep_read_attempt_count','')::integer,0)<1
      and coalesce(payload->>'cloud_deep_read_request_id','')=''
    order by coalesce(nullif(payload->>'intelligence_score','')::numeric,0) desc,created_at,id
    limit v_limit for update skip locked
  loop
    select net.http_post(
      url:='https://halyard-git-main-isaac-mineos-projects.vercel.app/api/internal/momentcircuit/v4/deep-read-campaign',
      headers:=public.momentcircuit_worker_headers(),
      body:=jsonb_build_object('action_id',a.id),timeout_milliseconds:=290000
    ) into request_id;
    update public.momentcircuit_horizon_actions
    set state='IN_PROGRESS',
        payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
          'cloud_deep_read_request_id',request_id,'cloud_deep_read_requested_at',now(),
          'cloud_deep_read_attempt_count',coalesce(nullif(payload->>'cloud_deep_read_attempt_count','')::integer,0)+1,
          'cloud_deep_read_worker','HALYARD_CAMPAIGN_DEEP_READ',
          'cloud_deep_read_worker_version','LUNA_BOUNDED_V4'),
        last_error=null,updated_at=now()
    where id=a.id;
    dispatched:=dispatched+1;
    items:=items||jsonb_build_array(jsonb_build_object(
      'action_id',a.id,'campaign_id',a.payload->>'campaign_id',
      'campaign_name',a.payload->>'campaign_name',
      'market_candidate_id',a.payload->>'market_candidate_id',
      'intelligence_score',a.payload->>'intelligence_score','request_id',request_id));
  end loop;

  return jsonb_build_object('state',case when dispatched>0 then 'CLOUD_CAMPAIGN_DEEP_READ_DISPATCHED'
    else 'NO_CLOUD_CAMPAIGN_DEEP_READ_WORK' end,'dispatched',dispatched,
    'invalid_identity_blocked',invalid_identity,'items',items,'observed_at',now());
end
$function$;

create or replace function public.momentcircuit_campaign_deep_read_cloud_tick()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare r jsonb; d jsonb;
begin
  r:=public.momentcircuit_campaign_deep_read_cloud_reconcile_tick(6);
  d:=public.momentcircuit_campaign_deep_read_cloud_dispatch_tick(1);
  return jsonb_build_object('reconcile',r,'dispatch',d,
    'portfolio',public.momentcircuit_campaign_portfolio_health(),'observed_at',now());
end
$function$;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='momentcircuit-trend-cloud'),
  schedule := '*/15 * * * *',
  active := false
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='momentcircuit-campaign-deep-read-cloud'),
  schedule := '*/10 * * * *',
  active := false
);
