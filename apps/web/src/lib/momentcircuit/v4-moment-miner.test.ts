import {describe,expect,it} from 'vitest';
import {normalizeMinerProposals,parseMinerSourceProbe,stableMomentId}
  from './v4-moment-miner';

const workId='00000000-0000-4000-8000-000000000111';
const sha='e'.repeat(64);
const transcript=[{start:0,end:4,text:'The danger arrives'},
  {start:4,end:11.46,text:'The escape plan pays off'}];
const base={sourceWorkId:workId,sourceSha256:sha,durationSeconds:11.46,
  minVideoSeconds:10,maxVideoSeconds:null,allowedPlatforms:['tiktok','youtube'],
  transcript,model:'gpt-5.5'};

describe('v4 source-local moment mining',()=>{
  it('parses real local runtime and dimensions from the exact media probe',()=>{
    const probe=parseMinerSourceProbe('Duration: 00:00:11.46, start: 0.0\n'
      +'Stream #0:0: Video: h264 (High), yuv420p, 1080x1920\n'
      +'Stream #0:1: Audio: aac, 44100 Hz');
    expect(probe).toEqual({durationSeconds:11.46,videoCodec:'h264',
      width:1080,height:1920,audioPresent:true});
    expect(()=>parseMinerSourceProbe('Duration: 00:00:11.46\nAudio: aac'))
      .toThrow('MINER_SOURCE_PROBE_INVALID');
  });

  it('rejects a 7.821-second proposal under a 10-second campaign minimum',()=>{
    const proposals=[{start_seconds:0.479,end_seconds:8.300,
      story_family:'escape_punchline',proposed_story_claim:'The plan goes wrong',
      payoff:'The punchline lands',visual_reason:'Frames show the payoff',
      platforms:['tiktok']}];
    expect(normalizeMinerProposals({...base,proposals})).toEqual([]);
  });

  it('binds one distinct story to stable IDs and exact transcript evidence',()=>{
    const proposals=[{start_seconds:0,end_seconds:11.46,
      story_family:'Escape Punchline',
      proposed_story_claim:'A risky escape plan turns absurd',
      payoff:'The final line lands the joke',
      visual_reason:'Early danger and late reaction are visible',
      platforms:['tiktok','youtube']}];
    const rows=normalizeMinerProposals({...base,proposals});
    expect(rows).toHaveLength(2);
    expect(rows[0]?.candidate_id).toBe(rows[1]?.candidate_id);
    expect(rows[0]?.candidate_id).toBe(stableMomentId(workId,0,11.46,'escape_punchline'));
    expect(rows.map(x=>x.platform)).toEqual(['tiktok','youtube']);
    expect(rows[0]?.transcript_evidence).toMatchObject({source_sha256:sha,
      speech_segments:transcript});
    expect(normalizeMinerProposals({...base,proposals})).toEqual(rows);
  });

  it('does not turn overlapping variants or unsupported platforms into reserve',()=>{
    const first={start_seconds:0,end_seconds:11.4,
      story_family:'same_story',proposed_story_claim:'The same complete story',
      payoff:'The complete final payoff',visual_reason:'The payoff is visible',
      platforms:['tiktok']};
    const proposals=[first,{...first,story_family:'variant_of_story'},
      {...first,story_family:'different_platform',platforms:['instagram']},
      {...first,story_family:'past_source',end_seconds:12}];
    expect(normalizeMinerProposals({...base,proposals})).toHaveLength(1);
  });
});
