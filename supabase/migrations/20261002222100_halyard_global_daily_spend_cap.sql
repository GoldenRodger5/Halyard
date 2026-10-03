-- Emergency global paid-provider spend guard after the 2026-10-02 runaway.
-- All paid server routes reserve atomically before provider calls.
-- The effective ceiling is hard-clamped to $10/day in America/New_York even
-- if settings.daily_budget_usd is accidentally raised above $10.

create table if not exists public.halyard_spend_reservations (
  id uuid primary key default gen_random_uuid(),
  spend_day date not null,
  provider text not null,
  purpose text not null,
  idempotency_key text not null unique,
  reserved_usd numeric(12,6) not null check (reserved_usd > 0 and reserved_usd <= 10),
  settled_usd numeric(12,6),
  state text not null default 'RESERVED' check (state in ('RESERVED','SETTLED','RELEASED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  released_at timestamptz,
  check (settled_usd is null or (settled_usd >= 0 and settled_usd <= reserved_usd))
);

create index if not exists halyard_spend_reservations_day_state_idx
  on public.halyard_spend_reservations(spend_day,state,created_at);

alter table public.halyard_spend_reservations enable row level security;
revoke all on table public.halyard_spend_reservations from public, anon, authenticated;
grant select on table public.halyard_spend_reservations to service_role;

update public.settings
set daily_budget_usd=10.00,
    updated_at=now()
where id=true;

create or replace function public.halyard_spend_status()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_day date := (now() at time zone 'America/New_York')::date;
  v_start timestamptz;
  v_end timestamptz;
  v_configured numeric := 10.00;
  v_limit numeric := 10.00;
  v_legacy numeric := 0;
  v_reserved numeric := 0;
  v_settled numeric := 0;
  v_committed numeric := 0;
begin
  v_start := (v_day::timestamp at time zone 'America/New_York');
  v_end := ((v_day + 1)::timestamp at time zone 'America/New_York');

  select coalesce(daily_budget_usd,10.00)
    into v_configured
  from public.settings
  where id=true;

  v_limit := least(10.00, greatest(0, coalesce(v_configured,10.00)));

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
    'hard_cap_usd',10.00,
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
  if p_provider is null or btrim(p_provider)='' then
    raise exception 'HALYARD_SPEND_PROVIDER_REQUIRED';
  end if;
  if p_purpose is null or btrim(p_purpose)='' then
    raise exception 'HALYARD_SPEND_PURPOSE_REQUIRED';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then
    raise exception 'HALYARD_SPEND_IDEMPOTENCY_REQUIRED';
  end if;
  if p_max_usd is null or p_max_usd<=0 or p_max_usd>10 then
    raise exception 'HALYARD_SPEND_RESERVATION_INVALID';
  end if;

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
      'reason',case when v_existing.state='RELEASED'
        then 'IDEMPOTENCY_KEY_RELEASED' else null end
    );
  end if;

  v_status:=public.halyard_spend_status();
  v_limit:=(v_status->>'effective_limit_usd')::numeric;
  v_committed:=(v_status->>'committed_usd')::numeric;
  v_remaining:=greatest(0,v_limit-v_committed);

  if p_max_usd>v_remaining then
    return jsonb_build_object(
      'allowed',false,
      'idempotent',false,
      'reservation_id',null,
      'spend_day',v_day,
      'requested_usd',p_max_usd,
      'committed_usd',v_committed,
      'remaining_usd',v_remaining,
      'effective_limit_usd',v_limit,
      'reason','GLOBAL_DAILY_SPEND_CAP'
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
    'allowed',true,
    'idempotent',false,
    'reservation_id',v_id,
    'reservation_state','RESERVED',
    'reserved_usd',round(p_max_usd,6),
    'spend_day',v_day,
    'remaining_usd',(v_status->>'remaining_usd')::numeric,
    'effective_limit_usd',(v_status->>'effective_limit_usd')::numeric
  );
end
$function$;

create or replace function public.halyard_settle_spend(
  p_reservation_id uuid,
  p_actual_usd numeric,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.halyard_spend_reservations%rowtype;
begin
  if p_actual_usd is null or p_actual_usd<0 then
    raise exception 'HALYARD_SPEND_ACTUAL_INVALID';
  end if;

  select * into v_row
  from public.halyard_spend_reservations
  where id=p_reservation_id
  for update;

  if not found then
    raise exception 'HALYARD_SPEND_RESERVATION_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext('halyard-global-spend:'||v_row.spend_day::text)::bigint);

  if v_row.state='SETTLED' then
    return jsonb_build_object(
      'ok',true,'idempotent',true,'reservation_id',v_row.id,
      'settled_usd',v_row.settled_usd,'status',public.halyard_spend_status()
    );
  end if;

  if v_row.state='RELEASED' then
    raise exception 'HALYARD_SPEND_RESERVATION_RELEASED';
  end if;

  if p_actual_usd>v_row.reserved_usd then
    raise exception 'HALYARD_SPEND_ACTUAL_EXCEEDS_RESERVATION';
  end if;

  update public.halyard_spend_reservations
  set state='SETTLED',
      settled_usd=round(p_actual_usd,6),
      metadata=metadata||coalesce(p_metadata,'{}'::jsonb),
      settled_at=now()
  where id=v_row.id;

  return jsonb_build_object(
    'ok',true,'idempotent',false,'reservation_id',v_row.id,
    'settled_usd',round(p_actual_usd,6),'status',public.halyard_spend_status()
  );
end
$function$;

create or replace function public.halyard_release_spend(
  p_reservation_id uuid,
  p_reason text default 'NO_PAID_REQUEST_SENT'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.halyard_spend_reservations%rowtype;
begin
  select * into v_row
  from public.halyard_spend_reservations
  where id=p_reservation_id
  for update;

  if not found then
    raise exception 'HALYARD_SPEND_RESERVATION_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext('halyard-global-spend:'||v_row.spend_day::text)::bigint);

  if v_row.state='RELEASED' then
    return jsonb_build_object(
      'ok',true,'idempotent',true,'reservation_id',v_row.id,
      'status',public.halyard_spend_status()
    );
  end if;

  if v_row.state='SETTLED' then
    raise exception 'HALYARD_SPEND_RESERVATION_ALREADY_SETTLED';
  end if;

  update public.halyard_spend_reservations
  set state='RELEASED',
      metadata=metadata||jsonb_build_object('release_reason',coalesce(p_reason,'NO_PAID_REQUEST_SENT')),
      released_at=now()
  where id=v_row.id;

  return jsonb_build_object(
    'ok',true,'idempotent',false,'reservation_id',v_row.id,
    'status',public.halyard_spend_status()
  );
end
$function$;

revoke all on function public.halyard_spend_status() from public, anon, authenticated;
revoke all on function public.halyard_reserve_spend(text,text,numeric,text,jsonb) from public, anon, authenticated;
revoke all on function public.halyard_settle_spend(uuid,numeric,jsonb) from public, anon, authenticated;
revoke all on function public.halyard_release_spend(uuid,text) from public, anon, authenticated;

grant execute on function public.halyard_spend_status() to service_role;
grant execute on function public.halyard_reserve_spend(text,text,numeric,text,jsonb) to service_role;
grant execute on function public.halyard_settle_spend(uuid,numeric,jsonb) to service_role;
grant execute on function public.halyard_release_spend(uuid,text) to service_role;
