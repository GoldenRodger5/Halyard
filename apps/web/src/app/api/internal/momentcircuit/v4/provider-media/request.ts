const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRequest(body:unknown){
  if(!body||typeof body!=='object') throw new Error('PROVIDER_MEDIA_REQUEST_INVALID');
  const row=body as Record<string,unknown>;
  const readyId=String(row.v4_ready_asset_id??'').toLowerCase();
  const scheduledAt=String(row.scheduled_at??'');
  const expiresRaw=Number(row.expires_in_seconds??7200);
  const scheduledMs=Date.parse(scheduledAt);
  if(!UUID.test(readyId)
     ||!Number.isFinite(scheduledMs)
     ||scheduledMs<=Date.now()
     ||scheduledMs>Date.now()+6*60*60_000
     ||!Number.isInteger(expiresRaw)
     ||expiresRaw<300||expiresRaw>14400){
    throw new Error('PROVIDER_MEDIA_REQUEST_INVALID');
  }
  return {readyId,scheduledAt,expiresInSeconds:expiresRaw};
}
