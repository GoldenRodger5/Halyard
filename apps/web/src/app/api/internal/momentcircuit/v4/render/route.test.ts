import {afterEach,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from './route';

const previous=process.env.MOMENTCIRCUIT_RENDER_SECRET;
afterEach(()=>{
  if(previous===undefined) delete process.env.MOMENTCIRCUIT_RENDER_SECRET;
  else process.env.MOMENTCIRCUIT_RENDER_SECRET=previous;
});

describe('v4 render HTTP boundary',()=>{
  it('rejects an unauthenticated tick before claiming a job',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/render',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({claim_one:true})}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:'UNAUTHORIZED'});
  });
  it('rejects a malformed leased request before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/render',{
      method:'POST',headers:{'content-type':'application/json',
        'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({job_id:'bad',worker:'renderer',lease_epoch:0})}));
    expect(response.status).toBe(400);
  });
});
