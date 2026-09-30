import {afterEach,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from './route';

const previous=process.env.MOMENTCIRCUIT_RENDER_SECRET;
afterEach(()=>{
  if(previous===undefined) delete process.env.MOMENTCIRCUIT_RENDER_SECRET;
  else process.env.MOMENTCIRCUIT_RENDER_SECRET=previous;
});

describe('v4 miner HTTP boundary',()=>{
  it('rejects unauthenticated ticks before opening a database connection',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const request=new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/mine-moments',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({claim_one:true})});
    const response=await POST(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:'UNAUTHORIZED'});
  });

  it('rejects malformed leased requests before a side effect',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const request=new NextRequest('https://halyard.example/api/internal/momentcircuit/v4/mine-moments',{
      method:'POST',headers:{'content-type':'application/json',
        'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({job_id:'wrong',worker:'miner',lease_epoch:0})});
    const response=await POST(request);
    expect(response.status).toBe(400);
  });
});
