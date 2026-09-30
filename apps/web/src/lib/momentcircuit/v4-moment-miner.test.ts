import {describe,expect,it} from 'vitest';
import {
  applyBoundaryRecovery,mergeMinerFrameObservations,
  normalizeMinerFrameObservations,normalizeMinerProposals,parseMinerSourceProbe,
  recoverableShortMinerProposals,selectMinerFrameEvidenceRepairTargets,stableMomentId,
  v4MinerCandidateSchemaPrompt
} from './v4-moment-miner';
import {deriveV4DurationPolicy} from './v4-duration-policy';

const workId='00000000-0000-4000-8000-000000000111';
const sha='e'.repeat(64);
const transcript=[{start:0,end:4,text:'The danger arrives'},
  {start:4,end:11.46,text:'The escape plan pays off'}];
const policy=deriveV4DurationPolicy({minVideoSeconds:10,maxVideoSeconds:null});
const base={sourceWorkId:workId,sourceSha256:sha,durationSeconds:11.46,
  minVideoSeconds:10,maxVideoSeconds:null,allowedPlatforms:['tiktok','youtube'],
  transcript,model:'gpt-5.5',durationPolicy:policy};

function proposal(start:number,end:number,family='escape_punchline'){
  return {start_seconds:start,end_seconds:end,story_family:family,
    proposed_story_claim:'A risky escape plan turns absurd',
    payoff:'The final line lands the joke',
    visual_reason:'Early danger and late reaction are visible',
    platforms:['tiktok','youtube']};
}

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

  it('normalizes only grounded frame observations and deduplicates frame times',()=>{
    const frames=[{at:0.5},{at:1.5},{at:2.5},{at:3.5}];
    expect(normalizeMinerFrameObservations([
      {at_seconds:0.49,observation:'Opening character enters frame'},
      {at_seconds:0.5,observation:'Duplicate opening observation'},
      {at_seconds:1.5,observation:'A second character reacts visibly'},
      {at_seconds:99,observation:'Invented off-source frame'},
      {at_seconds:2.5,observation:'short'}
    ],frames)).toEqual([
      {at:0.5,observation:'Duplicate opening observation'},
      {at:1.5,observation:'A second character reacts visibly'}
    ]);
  });

  it('selects only enough missing frames to repair the four-frame evidence floor',()=>{
    const frames=Array.from({length:8},(_,index)=>({at:index+0.5}));
    const existing=[{at:0.5,observation:'Opening evidence is already grounded'},
      {at:3.5,observation:'Middle evidence is already grounded'},
      {at:7.5,observation:'Ending evidence is already grounded'}];
    const targets=selectMinerFrameEvidenceRepairTargets({frames,existing,target:4});
    expect(targets).toHaveLength(1);
    expect(existing.some(row=>row.at===targets[0]?.at)).toBe(false);
    expect(selectMinerFrameEvidenceRepairTargets({frames,
      existing:[...existing,{at:4.5,observation:'Fourth grounded observation'}],target:4}))
      .toEqual([]);
  });

  it('merges repaired frame evidence without replacing already-grounded observations',()=>{
    expect(mergeMinerFrameObservations(
      [{at:0.5,observation:'Original opening observation'}],
      [{at:0.5,observation:'Repair should not replace original'},
       {at:4.5,observation:'Recovered missing visual evidence'}]
    )).toEqual([
      {at:0.5,observation:'Original opening observation'},
      {at:4.5,observation:'Recovered missing visual evidence'}
    ]);
  });

  it('states the exact candidate JSON contract upstream',()=>{
    const prompt=v4MinerCandidateSchemaPrompt(['tiktok','youtube']);
    expect(prompt).toContain('story_family');
    expect(prompt).toContain('proposed_story_claim');
    expect(prompt).toContain('payoff');
    expect(prompt).toContain('visual_reason');
    expect(prompt).toContain('start_seconds');
    expect(prompt).toContain('end_seconds');
    expect(prompt).toContain('platforms');
    expect(prompt).toContain('JSON numbers, never strings');
    expect(prompt).toContain('tiktok, youtube');
    expect(prompt).toContain('preferred minimum');
  });

  it('tolerates harmless numeric-string timestamps and a scalar eligible platform',()=>{
    const rows=normalizeMinerProposals({...base,durationSeconds:11.456,
      proposals:[{
        ...proposal(0,10.74,'awkward_affection_joke'),
        start_seconds:'0.000',end_seconds:'10.740',platforms:'tiktok'
      }]});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({platform:'tiktok',start_seconds:0,end_seconds:10.74,
      story_family:'awkward_affection_joke'});
  });

  it('recovers the inspected 10.440-second hug core to a meaningful 10.740-second reaction boundary',()=>{
    const sourceTranscript=[
      {start:0,end:2.2,text:'But I also know it still hurts.'},
      {start:2.2,end:3.3,text:'So come here.'},
      {start:3.3,end:4.2,text:'No, what are you?'},
      {start:4.2,end:5.04,text:"I don't..."},
      {start:5.92,end:6.76,text:'See?'},
      {start:6.76,end:9.6,text:'Before, you would have punched my head off for doing this.'},
      {start:9.6,end:10.44,text:'I still might.'}
    ];
    const original={
      ...proposal(0,10.44,'awkward_affection_joke'),
      start_seconds:'0.000',end_seconds:'10.440',platforms:'tiktok',
      proposed_story_claim:'A comforting hug tests whether the mustached man has softened',
      payoff:'The mustached man undercuts the hug with I still might',
      visual_reason:'The hug contrasts with his annoyed late reaction'
    };
    const short=recoverableShortMinerProposals({proposals:[original],
      durationSeconds:11.456,durationPolicy:policy,allowedPlatforms:['tiktok','youtube']});
    expect(short).toHaveLength(1);
    const recovered=applyBoundaryRecovery({
      originalProposals:[original],
      recoveredProposals:[{
        story_family:'awkward_affection_joke',start_seconds:'0.000',end_seconds:'10.740',
        added_context_reason:'The visible annoyed reaction after the final line completes the same punchline',
        added_visual_evidence_at_seconds:[10.74]
      }],
      durationSeconds:11.456,durationPolicy:policy,
      allowedPlatforms:['tiktok','youtube'],transcript:sourceTranscript,
      frameObservations:[{at:10.74,observation:'The mustached man remains in the hug with an annoyed reaction'}]
    });
    expect(recovered).toHaveLength(1);
    const rows=normalizeMinerProposals({...base,durationSeconds:11.456,
      transcript:sourceTranscript,proposals:recovered});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({platform:'tiktok',start_seconds:0,end_seconds:10.74,
      story_family:'awkward_affection_joke'});
    expect(rows[0]?.transcript_evidence).toMatchObject({
      boundary_recovery:{original_end_seconds:10.44}
    });
  });

  it('rejects the historical 7.821-second candidate under a 10-second campaign',()=>{
    expect(normalizeMinerProposals({...base,
      proposals:[proposal(0.479,8.300)]})).toEqual([]);
  });

  it('rejects a 10.01-second and 10.10-second proposal when a longer source permits the 10.5 preferred floor',()=>{
    expect(normalizeMinerProposals({...base,durationSeconds:20,
      proposals:[proposal(0,10.01)]})).toEqual([]);
    expect(normalizeMinerProposals({...base,durationSeconds:20,
      proposals:[proposal(0,10.10)]})).toEqual([]);
  });

  it('admits a 10.5-second candidate and records the duration policy evidence',()=>{
    const rows=normalizeMinerProposals({...base,durationSeconds:20,
      proposals:[proposal(0,10.5)]});
    expect(rows).toHaveLength(2);
    expect(rows[0]?.transcript_evidence).toMatchObject({
      duration_policy:{render_safe_min_seconds:10.1,preferred_min_seconds:10.5}
    });
  });

  it('permits the exact 10.1 hard-floor edge only when the source itself is that narrow',()=>{
    const narrow={...base,durationSeconds:10.1,
      transcript:[{start:0,end:10.1,text:'One complete narrow-source story'}]};
    const rows=normalizeMinerProposals({...narrow,proposals:[proposal(0,10.1)]});
    expect(rows).toHaveLength(2);
  });

  it('widens a strong 9.6-second semantic core to 10.8 using meaningful adjacent speech',()=>{
    const original=proposal(1.2,10.8);
    const sourceTranscript=[
      {start:0,end:1.2,text:'Useful setup before the core'},
      {start:1.2,end:10.8,text:'The complete core and payoff'},
      {start:10.8,end:12,text:'Reaction after the payoff'}
    ];
    const short=recoverableShortMinerProposals({proposals:[original],
      durationSeconds:12,durationPolicy:policy,allowedPlatforms:['tiktok','youtube']});
    expect(short).toHaveLength(1);
    const recovered=applyBoundaryRecovery({
      originalProposals:[original],
      recoveredProposals:[{story_family:'escape_punchline',
        start_seconds:0,end_seconds:10.8,
        added_context_reason:'The earlier spoken setup makes the same payoff understandable',
        added_visual_evidence_at_seconds:[]}],
      durationSeconds:12,durationPolicy:policy,
      allowedPlatforms:['tiktok','youtube'],transcript:sourceTranscript,
      frameObservations:[]
    });
    expect(recovered).toHaveLength(1);
    const rows=normalizeMinerProposals({...base,durationSeconds:12,
      transcript:sourceTranscript,proposals:recovered});
    expect(rows).toHaveLength(2);
    expect(rows[0]?.candidate_id).toBe(stableMomentId(workId,0,10.8,'escape_punchline'));
    expect(rows[0]?.transcript_evidence).toMatchObject({
      boundary_recovery:{original_start_seconds:1.2,original_end_seconds:10.8}
    });
  });

  it('rejects a silent-only extension that offers no speech or observed visual context',()=>{
    const original=proposal(0,9.6);
    const recovered=applyBoundaryRecovery({
      originalProposals:[original],
      recoveredProposals:[{story_family:'escape_punchline',
        start_seconds:0,end_seconds:10.8,
        added_context_reason:'Extra time after the ending only fills the duration',
        added_visual_evidence_at_seconds:[]}],
      durationSeconds:12,durationPolicy:policy,
      allowedPlatforms:['tiktok','youtube'],
      transcript:[{start:0,end:9.6,text:'The full spoken story ends here'}],
      frameObservations:[{at:5,observation:'The core scene is visible'}]
    });
    expect(recovered).toEqual([]);
  });

  it('allows visual-only boundary recovery when exact sampled visual evidence lies in the extension',()=>{
    const original=proposal(1,10.6);
    const recovered=applyBoundaryRecovery({
      originalProposals:[original],
      recoveredProposals:[{story_family:'escape_punchline',
        start_seconds:0,end_seconds:10.6,
        added_context_reason:'The opening reaction visually establishes who is confronting whom',
        added_visual_evidence_at_seconds:[0.5]}],
      durationSeconds:12,durationPolicy:policy,
      allowedPlatforms:['tiktok','youtube'],
      transcript:[{start:1,end:10.6,text:'The spoken core begins later'}],
      frameObservations:[{at:0.5,observation:'Both characters react before the first spoken line'}]
    });
    expect(recovered).toHaveLength(1);
  });

  it('does not admit anything when the entire source is below renderer-safe duration',()=>{
    const tooShort={...base,durationSeconds:10.05,
      transcript:[{start:0,end:10.05,text:'The full source'}]};
    expect(normalizeMinerProposals({...tooShort,
      proposals:[proposal(0,10.05)]})).toEqual([]);
  });

  it('enforces a narrow campaign maximum as the effective preferred floor',()=>{
    const narrowPolicy=deriveV4DurationPolicy({minVideoSeconds:10,maxVideoSeconds:10.3});
    const narrowBase={...base,durationSeconds:20,maxVideoSeconds:10.3,
      durationPolicy:narrowPolicy};
    expect(normalizeMinerProposals({...narrowBase,
      proposals:[proposal(0,10.2)]})).toEqual([]);
    expect(normalizeMinerProposals({...narrowBase,
      proposals:[proposal(0,10.3)]})).toHaveLength(2);
    expect(normalizeMinerProposals({...narrowBase,
      proposals:[proposal(0,10.4)]})).toEqual([]);
  });

  it('binds one distinct story to stable IDs and exact transcript evidence',()=>{
    const rows=normalizeMinerProposals({...base,proposals:[proposal(0,11.46)]});
    expect(rows).toHaveLength(2);
    expect(rows[0]?.candidate_id).toBe(rows[1]?.candidate_id);
    expect(rows[0]?.candidate_id).toBe(stableMomentId(workId,0,11.46,'escape_punchline'));
    expect(rows.map(x=>x.platform)).toEqual(['tiktok','youtube']);
    expect(rows[0]?.transcript_evidence).toMatchObject({source_sha256:sha,
      speech_segments:transcript});
    expect(normalizeMinerProposals({...base,proposals:[proposal(0,11.46)]})).toEqual(rows);
  });

  it('does not turn overlapping variants or unsupported platforms into reserve',()=>{
    const first={...proposal(0,11.4,'same_story'),platforms:['tiktok']};
    const proposals=[first,{...first,story_family:'variant_of_story'},
      {...first,story_family:'different_platform',platforms:['instagram']},
      {...first,story_family:'past_source',end_seconds:12}];
    expect(normalizeMinerProposals({...base,proposals})).toHaveLength(1);
  });
});
