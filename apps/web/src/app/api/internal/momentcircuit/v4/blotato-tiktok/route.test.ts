import {afterEach,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from './route';
import {
  buildSponsoredTikTokPost,
  chooseTikTokAccount,
  parseBlotatoAccounts
} from './logic';

const endpoint='http://localhost/api/internal/momentcircuit/v4/blotato-tiktok';
const previous=process.env.MOMENTCIRCUIT_RENDER_SECRET;

afterEach(()=>{
  if(previous===undefined) delete process.env.MOMENTCIRCUIT_RENDER_SECRET;
  else process.env.MOMENTCIRCUIT_RENDER_SECRET=previous;
});

describe('MomentCircuit Blotato TikTok provider',()=>{
  it('maps paid partnership fields exactly',()=>{
    const body=buildSponsoredTikTokPost({
      accountId:'acct-1',
      caption:'#ad A real clip',
      mediaUrl:'https://example.com/clip.mp4',
      scheduledAt:new Date(Date.now()+60_000).toISOString()
    });
    expect(Date.parse(body.scheduledTime)).toBeGreaterThan(Date.now());
    expect(body.post.target).toMatchObject({
      targetType:'tiktok',
      privacyLevel:'PUBLIC_TO_EVERYONE',
      isBrandedContent:true,
      isYourBrand:false,
      isAiGenerated:false
    });
  });

  it('chooses exactly one TikTok account and refuses ambiguity',()=>{
    const accounts=parseBlotatoAccounts({items:[
      {id:'tt1',platform:'tiktok',username:'momentcircuit0'},
      {id:'yt1',platform:'youtube',username:'Moment Circuit'}
    ]});
    expect(chooseTikTokAccount(accounts).id).toBe('tt1');
    expect(()=>chooseTikTokAccount([
      {id:'tt1',platform:'tiktok'},
      {id:'tt2',platform:'tiktok'}
    ])).toThrow('BLOTATO_TIKTOK_ACCOUNT_AMBIGUOUS');
  });

  it('rejects unauthenticated requests before provider access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{
      method:'POST',
      body:JSON.stringify({action:'health'})
    }));
    expect(response.status).toBe(401);
  });

  it('rejects unsponsored publish payloads before provider access',async()=>{
    process.env.MOMENTCIRCUIT_RENDER_SECRET='test-secret';
    const response=await POST(new NextRequest(endpoint,{
      method:'POST',
      headers:{'x-momentcircuit-render-secret':'test-secret'},
      body:JSON.stringify({
        action:'publish',
        action_id:'11111111-1111-4111-8111-111111111111',
        v4_ready_asset_id:'22222222-2222-4222-8222-222222222222',
        media_sha256:'a'.repeat(64),
        media_url:'https://example.com/video.mp4',
        caption:'#ad test',
        is_branded_content:false,
        is_your_brand:false
      })
    }));
    expect(response.status).toBe(400);
  });
});
