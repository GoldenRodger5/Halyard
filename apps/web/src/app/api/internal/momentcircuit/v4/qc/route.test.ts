import {afterEach,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from './route';

const previous=process.env.MOMENTCIRCUIT_RENDER_SECRET;
afterEach(()=>{
  if(previous===undefined) delete process.env.MOMENTCIRCUIT_RENDER_SECRET;
  else process.env.MOMENTCIRCUIT_RENDER_SECRET=previous;
});

describe('v4 exact-final QC HTTP boundary',()=>{
  it('rejects an unauthenticated tick before claiming a job',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/qc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({claim_one:true})}));
    expect(response.status).toBe(401);
  });
  it('rejects malformed lease identity before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/qc',{
      method:'POST',headers:{'content-type':'application/json',
        'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({job_id:'bad',worker:'halyard-v4-qc',lease_epoch:0})}));
    expect(response.status).toBe(400);
  });
});
