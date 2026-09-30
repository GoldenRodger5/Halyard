import {afterEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from './route';

const databaseMock=vi.hoisted(()=>({createClient:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:databaseMock.createClient}));

const previous=process.env.MOMENTCIRCUIT_RENDER_SECRET;
const previousUrl=process.env.SUPABASE_URL;
const previousKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
afterEach(()=>{
  if(previous===undefined) delete process.env.MOMENTCIRCUIT_RENDER_SECRET;
  else process.env.MOMENTCIRCUIT_RENDER_SECRET=previous;
  if(previousUrl===undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=previousUrl;
  if(previousKey===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY=previousKey;
  vi.clearAllMocks();
});

describe('v4 repair HTTP boundary',()=>{
  it('rejects an unauthenticated tick before queue claim',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/repair',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({claim_one:true})}));
    expect(response.status).toBe(401);
  });
  it('rejects malformed lease identity before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/repair',{
      method:'POST',headers:{'content-type':'application/json',
        'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({job_id:'bad',worker:'halyard-v4-repair',lease_epoch:0})}));
    expect(response.status).toBe(400);
  });
  it('adopts the sealed revision after a worker restart without resealing it',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    process.env.SUPABASE_URL='https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
    const jobId='00000000-0000-4000-8000-000000000011';
    const workId='00000000-0000-4000-8000-000000000012';
    const artifactId='00000000-0000-4000-8000-000000000013';
    const qcId='00000000-0000-4000-8000-000000000014';
    const planId='00000000-0000-4000-8000-000000000015';
    const values:Record<string,Record<string,unknown>>={
      momentcircuit_v4_jobs:{id:jobId,work_id:workId,kind:'repair_planner',
        status:'LEASED',lease_owner:'halyard-v4-repair',lease_epoch:2,
        lease_until:new Date(Date.now()+60_000).toISOString()},
      momentcircuit_v4_work:{id:workId,work_kind:'clip',
        state:'REPAIR_REQUIRED',current_artifact_id:artifactId,latest_qc_id:qcId},
      momentcircuit_v4_exact_final_qc:{qc_verdict_id:qcId,
        artifact_id:artifactId,verdict:'LOCAL_FAIL',critic_model:'test-critic'},
    };
    const rpc=vi.fn(async(name:string)=>({data:name==='momentcircuit_v4_complete_job'
      ?{state:'EDITORIAL_READY'}:true,error:null}));
    const from=vi.fn((table:string)=>{
      let revision=0;
      const query={select:()=>query,eq:(field:string,value:unknown)=>{
        if(field==='revision') revision=Number(value);
        return query;
      },maybeSingle:async()=>({error:null,data:table==='momentcircuit_v4_edit_plans'
        ?revision===1?{id:'first-plan',segment_sha256:'a'.repeat(64)}
          :{id:planId,registered_by_job_id:jobId,
            segment_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),
            planner_release:'sealed-old-release'}
        :values[table]??null})};
      return query;
    });
    databaseMock.createClient.mockReturnValue({from,rpc});
    const response=await POST(new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/repair',{
      method:'POST',headers:{'content-type':'application/json',
        'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({job_id:jobId,worker:'halyard-v4-repair',lease_epoch:2})}));
    expect(response.status).toBe(200);
    expect((await response.json()).plan_id).toBe(planId);
    expect(rpc).not.toHaveBeenCalledWith('momentcircuit_v4_register_repair_plan',
      expect.anything());
    expect(rpc).toHaveBeenCalledWith('momentcircuit_v4_complete_job',
      expect.objectContaining({p_event:'REVISION_READY',p_evidence:
        expect.objectContaining({plan_id:planId,
          planner_release:'sealed-old-release'})}));
  });
});
