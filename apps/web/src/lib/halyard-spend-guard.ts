import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';

export type HalyardSpendReservation={
  id:string;
  reservedUsd:number;
};

type ReserveResult={
  allowed?:boolean;
  reservation_id?:string|null;
  reserved_usd?:number|string;
  remaining_usd?:number|string;
  effective_limit_usd?:number|string;
  reason?:string|null;
};

export async function reserveHalyardSpend(
  client:SupabaseClient,
  args:{
    provider:string;
    purpose:string;
    maxUsd:number;
    metadata?:Record<string,unknown>;
  },
):Promise<HalyardSpendReservation>{
  const idempotencyKey=`${args.provider}:${args.purpose}:${crypto.randomUUID()}`;
  const {data,error}=await client.rpc('halyard_reserve_spend',{
    p_provider:args.provider,
    p_purpose:args.purpose,
    p_max_usd:args.maxUsd,
    p_idempotency_key:idempotencyKey,
    p_metadata:args.metadata??{},
  });
  if(error) throw new Error(`GLOBAL_SPEND_GUARD_UNAVAILABLE:${error.message}`);
  const result=(data??{}) as ReserveResult;
  if(result.allowed!==true||!result.reservation_id){
    throw new Error(
      `GLOBAL_DAILY_SPEND_CAP:${result.reason??'DENIED'}:`+
      `remaining=${String(result.remaining_usd??'unknown')}:`+
      `limit=${String(result.effective_limit_usd??'10')}`,
    );
  }
  return {
    id:String(result.reservation_id),
    reservedUsd:Number(result.reserved_usd??args.maxUsd),
  };
}

export async function settleHalyardSpend(
  client:SupabaseClient,
  reservation:HalyardSpendReservation,
  metadata?:Record<string,unknown>,
):Promise<void>{
  const {error}=await client.rpc('halyard_settle_spend',{
    p_reservation_id:reservation.id,
    p_actual_usd:reservation.reservedUsd,
    p_metadata:{
      accounting_mode:'CONSERVATIVE_MAX_RESERVATION',
      ...(metadata??{}),
    },
  });
  if(error) throw new Error(`GLOBAL_SPEND_SETTLE_FAILED:${error.message}`);
}

export async function releaseHalyardSpend(
  client:SupabaseClient,
  reservation:HalyardSpendReservation,
  reason:string,
):Promise<void>{
  const {error}=await client.rpc('halyard_release_spend',{
    p_reservation_id:reservation.id,
    p_reason:reason,
  });
  if(error) throw new Error(`GLOBAL_SPEND_RELEASE_FAILED:${error.message}`);
}

export function halyardSpendClient():SupabaseClient{
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('GLOBAL_SPEND_GUARD_DATABASE_NOT_CONFIGURED');
  return createClient(url,key,{auth:{persistSession:false}});
}
