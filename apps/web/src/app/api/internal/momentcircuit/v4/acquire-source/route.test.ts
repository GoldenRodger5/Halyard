import {afterEach,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from './route';

const endpoint='http://localhost/api/internal/momentcircuit/v4/acquire-source';
const previous=process.env.MOMENTCIRCUIT_RENDER_SECRET;
afterEach(()=>{
  if(previous===undefined) delete process.env.MOMENTCIRCUIT_RENDER_SECRET;
  else process.env.MOMENTCIRCUIT_RENDER_SECRET=previous;
});

describe('v4 source HTTP boundary',()=>{
  it('rejects unauthenticated source ticks before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{method:'POST',
      body:JSON.stringify({claim_one:true})}));
    expect(response.status).toBe(401);
  });

  it('rejects malformed authenticated work without opening the database',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{method:'POST',
      headers:{'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({job_id:'bad',worker:'source',lease_epoch:1})}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({error:'SOURCE_REQUEST_INVALID'});
  });
});
