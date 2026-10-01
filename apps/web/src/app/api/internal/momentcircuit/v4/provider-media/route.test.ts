import {afterEach,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from './route';

const endpoint='http://localhost/api/internal/momentcircuit/v4/provider-media';
const previous=process.env.MOMENTCIRCUIT_RENDER_SECRET;

afterEach(()=>{
  if(previous===undefined) delete process.env.MOMENTCIRCUIT_RENDER_SECRET;
  else process.env.MOMENTCIRCUIT_RENDER_SECRET=previous;
});

describe('v4 provider media HTTP boundary',()=>{
  it('rejects unauthenticated signing requests before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{method:'POST',
      body:JSON.stringify({
        v4_ready_asset_id:'7781c42b-963d-484d-8a66-c7b48b62187f',
        scheduled_at:new Date(Date.now()+60_000).toISOString()
      })}));
    expect(response.status).toBe(401);
  });

  it('rejects malformed authenticated requests before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{method:'POST',
      headers:{'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({v4_ready_asset_id:'bad',scheduled_at:'nope'})
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({error:'PROVIDER_MEDIA_REQUEST_INVALID'});
  });

  it('rejects past slots before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{method:'POST',
      headers:{'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({
        v4_ready_asset_id:'7781c42b-963d-484d-8a66-c7b48b62187f',
        scheduled_at:new Date(Date.now()-60_000).toISOString()
      })
    }));
    expect(response.status).toBe(400);
  });
});
