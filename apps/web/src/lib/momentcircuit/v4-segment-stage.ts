export const V4_PRIVATE_BUCKET='momentcircuit-private';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;

export function parseV4StageRequest(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('STAGE_REQUEST_INVALID');
  const body=value as Record<string,unknown>;
  const jobId=body.job_id,worker=body.worker,leaseEpoch=body.lease_epoch;
  if(typeof jobId!=='string'||!UUID.test(jobId)
    ||typeof worker!=='string'||!/^[a-zA-Z0-9:_-]{3,120}$/.test(worker)
    ||!Number.isSafeInteger(leaseEpoch)||Number(leaseEpoch)<1){
    throw new Error('STAGE_REQUEST_INVALID');
  }
  return {jobId,worker,leaseEpoch:Number(leaseEpoch)};
}

export function v4SegmentObjectPath(workId:string,sha256:string){
  if(!UUID.test(workId)||!SHA.test(sha256)) throw new Error('SEGMENT_IDENTITY_INVALID');
  return `momentcircuit/segments/${workId}/${sha256}.mp4`;
}

export function signedStorageUrlAllowed(signedUrl:string,supabaseUrl:string){
  try{
    const signed=new URL(signedUrl),supabase=new URL(supabaseUrl);
    return signed.protocol==='https:'&&signed.origin===supabase.origin
      &&signed.pathname.startsWith(`/storage/v1/object/sign/${V4_PRIVATE_BUCKET}/`);
  }catch{return false;}
}

export function parseFfmpegDuration(stderr:string){
  const match=stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if(!match) throw new Error('SEGMENT_DURATION_UNAVAILABLE');
  const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  if(!Number.isFinite(seconds)||seconds<=0||seconds>180.5) throw new Error('SEGMENT_DURATION_INVALID');
  return Number(seconds.toFixed(3));
}

export function assertStageEligibility(input:{
  job:{kind:string;status:string;lease_owner:string|null;lease_epoch:number;lease_until:string;work_id:string};
  work:{id:string;work_kind:string;state:string;parent_source_work_id:string;candidate_moment_id:string;campaign_contract_id:string;source_fingerprint:string;brief_version:string;rights_version:string};
  source:{id:string;work_kind:string;state:string;campaign_contract_id:string;source_fingerprint:string;source_sha256:string};
  moment:{id:string;source_work_id:string;start_seconds:number;end_seconds:number};
  contract:{campaign_contract_id:string;brief_version:string;rights_version:string;rights_current:boolean;publish_allowed:boolean;budget_state:string;min_video_seconds:number;max_video_seconds:number|null;valid_until:string};
  asset:{source_work_id:string;campaign_contract_id:string;source_fingerprint:string;storage_bucket:string;storage_path:string;content_type:string;full_source_sha256:string;rights_valid_until:string};
  worker:string;leaseEpoch:number;now:number;
}){
  const {job,work,source,moment,contract,asset,worker,leaseEpoch,now}=input;
  const leaseUntil=Date.parse(job.lease_until);
  const rightsUntil=Date.parse(asset.rights_valid_until);
  const contractUntil=Date.parse(contract.valid_until);
  if(job.kind!=='visual_verifier'||job.status!=='LEASED'||job.lease_owner!==worker
    ||Number(job.lease_epoch)!==leaseEpoch||!Number.isFinite(leaseUntil)||leaseUntil<=now
    ||job.work_id!==work.id) throw new Error('VISUAL_LEASE_INVALID');
  if(work.work_kind!=='clip'||work.state!=='MOMENTS_DISCOVERED'
    ||source.id!==work.parent_source_work_id||source.work_kind!=='source'
    ||source.state!=='MOMENTS_DISCOVERED'
    ||source.campaign_contract_id!==work.campaign_contract_id
    ||source.source_fingerprint!==work.source_fingerprint
    ||moment.id!==work.candidate_moment_id||moment.source_work_id!==source.id){
    throw new Error('SOURCE_OR_MOMENT_IDENTITY_INVALID');
  }
  if(asset.source_work_id!==source.id||asset.campaign_contract_id!==work.campaign_contract_id
    ||asset.source_fingerprint!==work.source_fingerprint
    ||asset.storage_bucket!==V4_PRIVATE_BUCKET
    ||!SHA.test(asset.full_source_sha256)
    ||source.source_sha256!==asset.full_source_sha256
    ||!['video/mp4','video/quicktime'].includes(asset.content_type)
    ||!/^momentcircuit\/sources\/[A-Za-z0-9_./-]+$/.test(asset.storage_path)
    ||asset.storage_path.split('/').includes('..')
    ||!asset.storage_path.endsWith(`/${asset.full_source_sha256}.${asset.content_type==='video/mp4'?'mp4':'mov'}`)
    ||!Number.isFinite(rightsUntil)||rightsUntil<=now){
    throw new Error('SOURCE_ASSET_OR_RIGHTS_INVALID');
  }
  if(contract.campaign_contract_id!==work.campaign_contract_id
    ||contract.brief_version!==work.brief_version
    ||contract.rights_version!==work.rights_version
    ||!contract.rights_current||!contract.publish_allowed
    ||contract.budget_state!=='ACCEPTING'
    ||!Number.isFinite(contractUntil)||contractUntil<=now){
    throw new Error('CURRENT_CONTRACT_INVALID');
  }
  const start=Number(moment.start_seconds),end=Number(moment.end_seconds);
  const duration=Number((end-start).toFixed(3));
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||duration<=0
    ||duration>180||duration<Number(contract.min_video_seconds)
    ||(contract.max_video_seconds!==null&&duration>Number(contract.max_video_seconds))){
    throw new Error('SOURCE_NATIVE_WINDOW_OUTSIDE_CAMPAIGN_SPEC');
  }
  return {start,end,duration};
}
