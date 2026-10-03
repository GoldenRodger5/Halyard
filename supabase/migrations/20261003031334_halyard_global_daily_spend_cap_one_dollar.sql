-- Tighten the emergency global Halyard paid-provider ceiling from $10 to $1/day.
update public.settings
set daily_budget_usd=1.00,
    updated_at=now()
where id=true;

alter table public.halyard_spend_reservations
  drop constraint if exists halyard_spend_reservations_reserved_usd_check;
alter table public.halyard_spend_reservations
  add constraint halyard_spend_reservations_reserved_usd_check
  check (reserved_usd > 0 and reserved_usd <= 1.00);

create or replace function public.halyard_spend_status()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_day date := (now() at time zone 'America/New_York')::date;
  v_start timestamptz := (v_day::timestamp at time zone 'America/New_York');
  v_end timestamptz := ((v_day + 1)::timestamp at time zone 'America/New_York');
  v_configured numeric := 1.00;
  v_limit numeric := 1.00;
  v_legacy numeric := 0;
  v_reserved numeric := 0;
  v_settled numeric := 0;
  v_committed numeric := 0;
begin
  select coalesce(daily_budget_usd,1.00)
    into v_configured
  from public.settings where id=true;

  v_limit := least(1.00, greatest(0, coalesce(v_configured,1.00)));

  select coalesce(sum(cost_usd),0)
    into v_legacy
  from public.agent_runs
  where started_at >= v_start
    and started_at < v_end
    and cost_usd is not null
    and cost_usd > 0;

  select
    coalesce(sum(reserved_usd) filter (where state='RESERVED'),0),
    coalesce(sum(settled_usd) filter (where state='SETTLED'),0)
  into v_reserved, v_settled
  from public.halyard_spend_reservations
  where spend_day=v_day;

  v_committed := v_legacy + v_reserved + v_settled;

  return jsonb_build_object(
    'spend_day',v_day,
    'timezone','America/New_York',
    'hard_cap_usd',1.00,
    'configured_daily_budget_usd',v_configured,
    'effective_limit_usd',v_limit,
    'legacy_recorded_usd',round(v_legacy,6),
    'reserved_usd',round(v_reserved,6),
    'settled_usd',round(v_settled,6),
    'committed_usd',round(v_committed,6),
    'remaining_usd',round(greatest(0,v_limit-v_committed),6),
    'cap_reached',v_committed>=v_limit
  );
end
$function$;

create or replace function public.halyard_reserve_spend(
  p_provider text,
  p_purpose text,
  p_max_usd numeric,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_day date := (now() at time zone 'America/New_York')::date;
  v_status jsonb;
  v_existing public.halyard_spend_reservations%rowtype;
  v_id uuid;
  v_limit numeric;
  v_committed numeric;
  v_remaining numeric;
begin
  if p_provider is null or btrim(p_provider)='' then raise exception 'HALYARD_SPEND_PROVIDER_REQUIRED'; end if;
  if p_purpose is null or btrim(p_purpose)='' then raise exception 'HALYARD_SPEND_PURPOSE_REQUIRED'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'HALYARD_SPEND_IDEMPOTENCY_REQUIRED'; end if;
  if p_max_usd is null or p_max_usd<=0 or p_max_usd>1 then raise exception 'HALYARD_SPEND_RESERVATION_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtext('halyard-global-spend:'||v_day::text)::bigint);

  select * into v_existing
  from public.halyard_spend_reservations
  where idempotency_key=p_idempotency_key
  limit 1;

  if found then
    v_status:=public.halyard_spend_status();
    return jsonb_build_object(
      'allowed',v_existing.state in ('RESERVED','SETTLED'),
      'idempotent',true,
      'reservation_id',v_existing.id,
      'reservation_state',v_existing.state,
      'reserved_usd',v_existing.reserved_usd,
      'spend_day',v_existing.spend_day,
      'remaining_usd',(v_status->>'remaining_usd')::numeric,
      'effective_limit_usd',(v_status->>'effective_limit_usd')::numeric,
      'reason',case when v_existing.state='RELEASED' then 'IDEMPOTENCY_KEY_RELEASED' else null end
    );
  end if;

  v_status:=public.halyard_spend_status();
  v_limit:=(v_status->>'effective_limit_usd')::numeric;
  v_committed:=(v_status->>'committed_usd')::numeric;
  v_remaining:=greatest(0,v_limit-v_committed);

  if p_max_usd>v_remaining then
    return jsonb_build_object(
      'allowed',false,'idempotent',false,'reservation_id',null,
      'spend_day',v_day,'requested_usd',p_max_usd,
      'committed_usd',v_committed,'remaining_usd',v_remaining,
      'effective_limit_usd',v_limit,'reason','GLOBAL_DAILY_SPEND_CAP'
    );
  end if;

  insert into public.halyard_spend_reservations(
    spend_day,provider,purpose,idempotency_key,reserved_usd,metadata
  ) values (
    v_day,btrim(p_provider),btrim(p_purpose),btrim(p_idempotency_key),
    round(p_max_usd,6),coalesce(p_metadata,'{}'::jsonb)
  )
  returning id into v_id;

  v_status:=public.halyard_spend_status();
  return jsonb_build_object(
    'allowed',true,'idempotent',false,'reservation_id',v_id,
    'reservation_state','RESERVED','reserved_usd',round(p_max_usd,6),
    'spend_day',v_day,'remaining_usd',(v_status->>'remaining_usd')::numeric,
    'effective_limit_usd',(v_status->>'effective_limit_usd')::numeric
  );
end
$function$;
