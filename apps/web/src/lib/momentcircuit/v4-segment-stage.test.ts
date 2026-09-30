import {describe,expect,it} from 'vitest';
import {
  V4_PRIVATE_BUCKET,assertStageEligibility,parseFfmpegDuration,
  parseV4StageRequest,signedStorageUrlAllowed,v4SegmentObjectPath
} from './v4-segment-stage';

const id='11111111-1111-4111-8111-111111111111';
const sourceId='22222222-2222-4222-8222-222222222222';
const candidateId='33333333-3333-4333-8333-333333333333';
const contractId='44444444-4444-4444-8444-444444444444';

function fixture(){
  const now=Date.now();
  return {
    now,worker:'visual:worker-1',leaseEpoch:2,
    job:{kind:'visual_verifier',status:'LEASED',lease_owner:'visual:worker-1',
      lease_epoch:2,lease_until:new Date(now+60_000).toISOString(),work_id:id},
    work:{id,work_kind:'clip',state:'MOMENTS_DISCOVERED',
      parent_source_work_id:sourceId,candidate_moment_id:candidateId,
      campaign_contract_id:contractId,source_fingerprint:'provider-asset-a',
      brief_version:'brief-1',rights_version:'rights-1'},
    source:{id:sourceId,work_kind:'source',state:'MOMENTS_DISCOVERED',
      campaign_contract_id:contractId,source_fingerprint:'provider-asset-a',
      source_sha256:'e'.repeat(64)},
    moment:{id:candidateId,source_work_id:sourceId,start_seconds:4,end_seconds:16},
    contract:{campaign_contract_id:contractId,brief_version:'brief-1',
      rights_version:'rights-1',rights_current:true,publish_allowed:true,
      budget_state:'ACCEPTING',min_video_seconds:10,max_video_seconds:60,
      valid_until:new Date(now+60_000).toISOString()},
    asset:{source_work_id:sourceId,campaign_contract_id:contractId,
      source_fingerprint:'provider-asset-a',storage_bucket:V4_PRIVATE_BUCKET,
      storage_path:`momentcircuit/sources/${'e'.repeat(64)}.mp4`,
      content_type:'video/mp4',full_source_sha256:'e'.repeat(64),
      rights_valid_until:new Date(now+60_000).toISOString()}
  };
}

describe('v4 exact source segment staging',()=>{
  it('accepts only a leased worker and exact immutable identities',()=>{
    const good=fixture();
    expect(assertStageEligibility(good)).toEqual({start:4,end:16,duration:12});
    expect(()=>assertStageEligibility({...good,leaseEpoch:3})).toThrow('VISUAL_LEASE_INVALID');
    expect(()=>assertStageEligibility({...good,asset:{...good.asset,storage_bucket:'halyard-assets'}}))
      .toThrow('SOURCE_ASSET_OR_RIGHTS_INVALID');
    expect(()=>assertStageEligibility({...good,asset:{...good.asset,full_source_sha256:'f'.repeat(64)}}))
      .toThrow('SOURCE_ASSET_OR_RIGHTS_INVALID');
    expect(()=>assertStageEligibility({...good,asset:{...good.asset,rights_valid_until:new Date(good.now-1).toISOString()}}))
      .toThrow('SOURCE_ASSET_OR_RIGHTS_INVALID');
    expect(()=>assertStageEligibility({...good,source:{...good.source,source_fingerprint:'changed'}}))
      .toThrow('SOURCE_OR_MOMENT_IDENTITY_INVALID');
  });
  it('rejects a 7.821-second native window under a 10-second minimum',()=>{
    const good=fixture();
    const short={...good,moment:{...good.moment,start_seconds:0.479,end_seconds:8.300}};
    expect(()=>assertStageEligibility(short)).toThrow('SOURCE_NATIVE_WINDOW_OUTSIDE_CAMPAIGN_SPEC');
    expect(()=>assertStageEligibility({...good,contract:{...good.contract,budget_state:'HOLD'}}))
      .toThrow('CURRENT_CONTRACT_INVALID');
  });
  it('does not accept arbitrary signed URLs or ambiguous object paths',()=>{
    expect(signedStorageUrlAllowed(
      'https://project.supabase.co/storage/v1/object/sign/momentcircuit-private/source?token=x',
      'https://project.supabase.co')).toBe(true);
    expect(signedStorageUrlAllowed(
      'https://evil.example/storage/v1/object/sign/asset?token=x',
      'https://project.supabase.co')).toBe(false);
    expect(v4SegmentObjectPath(id,'a'.repeat(64)))
      .toBe(`momentcircuit/segments/${id}/${'a'.repeat(64)}.mp4`);
    expect(()=>v4SegmentObjectPath('../x','a'.repeat(64))).toThrow('SEGMENT_IDENTITY_INVALID');
  });
  it('parses the actual encoded duration and rejects malformed dispatches',()=>{
    expect(parseFfmpegDuration('Duration: 00:00:12.04, start: 0.000'))
      .toBe(12.04);
    expect(()=>parseFfmpegDuration('no media duration')).toThrow('SEGMENT_DURATION_UNAVAILABLE');
    expect(parseV4StageRequest({job_id:id,worker:'visual:worker-1',lease_epoch:2}))
      .toEqual({jobId:id,worker:'visual:worker-1',leaseEpoch:2});
    expect(()=>parseV4StageRequest({job_id:id,worker:'x',lease_epoch:2}))
      .toThrow('STAGE_REQUEST_INVALID');
  });
});
