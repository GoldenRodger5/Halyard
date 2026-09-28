create or replace function public.set_momentcircuit_vercel_bypass(secret_value text)
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

  select id
  into existing_id
  from vault.decrypted_secrets
  where name = 'vercel_halyard_automation_bypass'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(
      secret_value,
      'vercel_halyard_automation_bypass',
      'Vercel protection bypass for MomentCircuit Supabase webhook',
      null
    );
  else
    perform vault.update_secret(
      existing_id,
      secret_value,
      'vercel_halyard_automation_bypass',
      'Vercel protection bypass for MomentCircuit Supabase webhook',
      null
    );
  end if;
end;
$$;

revoke all on function public.set_momentcircuit_vercel_bypass(text) from public, anon, authenticated;
grant execute on function public.set_momentcircuit_vercel_bypass(text) to service_role;
