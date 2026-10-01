import {afterEach,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from './route';

const endpoint='http://localhost/api/internal/momentcircuit/v4/verify-candidate-visual';
const previous=process.env.MOMENTCIRCUIT_RENDER_SECRET;

afterEach(()=>{
  if(previous===undefined) delete process.env.MOMENTCIRCUIT_RENDER_SECRET;
  else process.env.MOMENTCIRCUIT_RENDER_SECRET=previous;
});

describe('candidate visual verifier HTTP boundary',()=>{
  it('rejects unauthenticated requests before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{method:'POST',
      body:JSON.stringify({action_id:'11111111-1111-4111-8111-111111111111'})}));
    expect(response.status).toBe(401);
  });

  it('rejects malformed authenticated action ids before database access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{method:'POST',
      headers:{'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({action_id:'bad'})}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({error:'CANDIDATE_VISUAL_REQUEST_INVALID'});
  });
});
