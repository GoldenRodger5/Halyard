import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {parseRequest} from './request';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const PRIVATE_BUCKET='momentcircuit-private';
const RENDER_PREFIX='momentcircuit/renders/';
function authorize(request:NextRequest){
  const expected=process.env.MOMENTCIRCUIT_RENDER_SECRET??'';
  const actual=request.headers.get('x-momentcircuit-render-secret')??'';
  const a=Buffer.from(actual),b=Buffer.from(expected);
  if(!actual||!expected||a.length!==b.length||!crypto.timingSafeEqual(a,b)){
    throw new Error('UNAUTHORIZED');
  }
}

function database(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url,key,{auth:{persistSession:false}});
}

export async function POST(request:NextRequest){
  try{
    authorize(request);
  }catch{
    return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  }

  let parsed:{readyId:string;scheduledAt:string;expiresInSeconds:number};
  try{
    parsed=parseRequest(await request.json());
  }catch{
    return NextResponse.json({error:'PROVIDER_MEDIA_REQUEST_INVALID'},{status:400});
  }

  try{
    const client=database();
    const {data:decision,error:decisionError}=await client.rpc(
      'momentcircuit_v4_early_arm_schedulability',{
        p_v4_ready_asset_id:parsed.readyId,
        p_slot_at:parsed.scheduledAt
      }
    );
    if(decisionError){
      console.error('V4 provider media schedulability failed',{
        error:decisionError.message,readyId:parsed.readyId
      });
      return NextResponse.json({error:'PROVIDER_MEDIA_SCHEDULABILITY_FAILED'},{status:502});
    }
    if(!decision||decision.allow!==true){
      return NextResponse.json({
        error:'PROVIDER_MEDIA_NOT_SCHEDULABLE',
        reasons:Array.isArray(decision?.reasons)?decision.reasons:[]
      },{status:409});
    }

    const {data:ready,error:readyError}=await client
      .from('momentcircuit_v4_qualified_ready')
      .select('id,work_id,platform,campaign_contract_id,candidate_moment_id,rendered_media_id,artifact_id,media_sha256,post_caption,content_class,storage_bucket,storage_path')
      .eq('id',parsed.readyId)
      .maybeSingle();
    if(readyError||!ready){
      return NextResponse.json({error:'V4_READY_ASSET_NOT_QUALIFIED'},{status:409});
    }
    if(ready.storage_bucket!==PRIVATE_BUCKET
       ||typeof ready.storage_path!=='string'
       ||!ready.storage_path.startsWith(RENDER_PREFIX)
       ||ready.storage_path.includes('..')){
      return NextResponse.json({error:'V4_PROVIDER_MEDIA_PATH_INVALID'},{status:409});
    }

    const {data:signed,error:signedError}=await client.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrl(ready.storage_path,parsed.expiresInSeconds);
    if(signedError||!signed?.signedUrl){
      console.error('V4 provider media signing failed',{
        error:signedError?.message,readyId:parsed.readyId
      });
      return NextResponse.json({error:'V4_PROVIDER_MEDIA_SIGN_FAILED'},{status:502});
    }

    return NextResponse.json({
      ok:true,
      v4_ready_asset_id:ready.id,
      work_id:ready.work_id,
      platform:ready.platform,
      campaign_contract_id:ready.campaign_contract_id,
      candidate_moment_id:ready.candidate_moment_id,
      rendered_media_id:ready.rendered_media_id,
      artifact_id:ready.artifact_id,
      media_sha256:ready.media_sha256,
      post_caption:ready.post_caption,
      content_class:ready.content_class,
      signed_url:signed.signedUrl,
      expires_at:new Date(Date.now()+parsed.expiresInSeconds*1000).toISOString(),
      scheduled_at:parsed.scheduledAt,
      schedulability:decision
    });
  }catch(error){
    console.error('V4 provider media endpoint failed',{error:String(error)});
    return NextResponse.json({error:'V4_PROVIDER_MEDIA_INTERNAL_ERROR'},{status:500});
  }
}
