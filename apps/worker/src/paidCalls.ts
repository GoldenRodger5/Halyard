/**
 * §494. Every paid call lands in the ledger, in the same table as model calls.
 *
 * `agent_runs.cost_usd` was the only record of spend, and it only saw the
 * LLM clients — images, the frame describer, the critic and the voice were
 * paid for and written nowhere. The operator learned the real number from a
 * billing page: twenty dollars in twelve hours against a recorded $2.29.
 *
 * One table rather than a second one, because the question is always the
 * same — *what did this piece cost, what did today cost* — and a sum over
 * one column answers it. The row is a completed run of a named agent
 * (`image-generator`, `vision-describer`, `creative-critic`,
 * `voice-synthesis`) with the units in `output_ref`, so a reader can tell
 * "$0.06 for one medium image" from "$0.06 for eleven thousand tokens".
 */
import type pg from 'pg';

export interface PaidCall {
  agentId: string;
  team?: string;
  /** The job that paid, so `content_item_costs` can attribute it to a piece. */
  jobId: string | undefined;
  model: string;
  costUsd: number;
  /** What was bought: images, tokens, characters. Free-form and small. */
  units: Record<string, number | string>;
  /** True when the price is a list-price estimate rather than a billed figure. */
  estimate?: boolean;
}

export async function recordPaidCall(pool: pg.Pool, call: PaidCall): Promise<void> {
  await pool
    .query(
      `insert into agent_runs
         (agent_id, agent_version, team, trigger, trigger_ref, input_ref, output_ref,
          status, cost_usd, started_at, completed_at, duration_ms)
       values ($1, 'paid-call', $2, 'job', $3, '{}'::jsonb, $4::jsonb,
               'succeeded', $5, now(), now(), 0)`,
      [
        call.agentId,
        call.team ?? 'content',
        call.jobId ?? null,
        JSON.stringify({ model: call.model, ...call.units, ...(call.estimate ? { estimate: true } : {}) }),
        Number(call.costUsd.toFixed(6)),
      ],
    )
    /* The ledger must never fail the work it records. It is logged by the caller. */
    .catch(() => undefined);
}

/** Today's paid calls in USD, for the budget guard and the home page. */
export async function spentTodayUsd(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ usd: string | null }>(
    `select sum(cost_usd)::text as usd from agent_runs
      where started_at >= date_trunc('day', now()) and cost_usd is not null`,
  );
  return Number(rows[0]?.usd ?? 0);
}


export interface WorkerSpendReservation {
  id:string;
  reservedUsd:number;
  idempotencyKey:string;
}

type WorkerReserveResult={
  allowed?:boolean;
  idempotent?:boolean;
  reservation_id?:string|null;
  reservation_state?:string|null;
  reserved_usd?:number|string;
  remaining_usd?:number|string;
  effective_limit_usd?:number|string;
  reason?:string|null;
};

/**
 * Atomic global preflight for legacy worker jobs.
 *
 * The old poller read the ledger and then spent, leaving a race between workers.
 * This function competes for the same Postgres reservation pool as the web/cloud
 * routes, so concurrent jobs cannot collectively cross the hard daily ceiling.
 */
export async function reserveWorkerSpend(
  pool:pg.Pool,
  args:{jobId:string;kind:string;maxUsd:number},
):Promise<{reservation:WorkerSpendReservation|null;reason:string|null}>{
  if(!Number.isFinite(args.maxUsd)||args.maxUsd<=0||args.maxUsd>1){
    return {reservation:null,reason:`WORKER_SPEND_ESTIMATE_OUTSIDE_ONE_DOLLAR_CAP:${args.maxUsd}`};
  }
  const idempotencyKey=`halyard-worker:${args.jobId}:v1`;
  const {rows}=await pool.query<{result:WorkerReserveResult}>(
    `select public.halyard_reserve_spend($1,$2,$3,$4,$5::jsonb) as result`,
    ['halyard-worker',args.kind,args.maxUsd,idempotencyKey,
      JSON.stringify({job_id:args.jobId,kind:args.kind})],
  );
  const result=rows[0]?.result??{};
  if(result.allowed!==true||!result.reservation_id){
    return {reservation:null,reason:
      `GLOBAL_DAILY_SPEND_CAP:${result.reason??'DENIED'}:`+
      `remaining=${String(result.remaining_usd??'unknown')}:`+
      `limit=${String(result.effective_limit_usd??'1')}`};
  }
  if(result.idempotent===true){
    return {reservation:null,reason:
      `GLOBAL_SPEND_DUPLICATE_PAID_JOB_BLOCKED:${result.reservation_state??'UNKNOWN'}`};
  }
  return {
    reservation:{
      id:String(result.reservation_id),
      reservedUsd:Number(result.reserved_usd??args.maxUsd),
      idempotencyKey,
    },
    reason:null,
  };
}

/**
 * Convert a worker reservation into durable accounting.
 *
 * If the handler recorded real provider spend in agent_runs, release the
 * reservation so spend is counted once. If it did not, conservatively settle
 * the full reservation; an unrecorded or network-uncertain paid call must never
 * create free retry capacity.
 */
export async function finalizeWorkerSpend(
  pool:pg.Pool,
  reservation:WorkerSpendReservation,
  jobId:string,
  startedAtMs:number,
):Promise<void>{
  const startedAt=new Date(startedAtMs).toISOString();
  const {rows}=await pool.query<{usd:string|null}>(
    `select sum(cost_usd)::text as usd
       from agent_runs
      where trigger='job' and trigger_ref=$1
        and started_at >= $2::timestamptz
        and cost_usd is not null and cost_usd>0`,
    [jobId,startedAt],
  );
  const actual=Number(rows[0]?.usd??0);
  if(actual>0){
    await pool.query(
      `select public.halyard_release_spend($1::uuid,$2) as result`,
      [reservation.id,`ACTUAL_AGENT_RUN_COST_RECORDED:${actual.toFixed(6)}`],
    );
    return;
  }
  await pool.query(
    `select public.halyard_settle_spend($1::uuid,$2,$3::jsonb) as result`,
    [reservation.id,reservation.reservedUsd,
      JSON.stringify({accounting_mode:'CONSERVATIVE_WORKER_RESERVATION',
        job_id:jobId,actual_agent_run_cost_usd:0})],
  );
}
