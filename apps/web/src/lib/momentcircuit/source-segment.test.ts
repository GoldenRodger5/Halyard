import {describe,expect,it} from 'vitest';
import {candidateSegmentObjectPath,sourceSegmentHostAllowed,validateSourceSegment} from './source-segment';

describe('MomentCircuit durable candidate source segments',()=>{
  it('allows only approved cloud media origins',()=>{
    expect(sourceSegmentHostAllowed('https://bucket.s3-accelerate.amazonaws.com/a.mp4')).toBe(true);
    expect(sourceSegmentHostAllowed('https://x.cloudfront.net/a.mp4')).toBe(true);
    expect(sourceSegmentHostAllowed('https://project.supabase.co/storage/v1/object/public/a.mp4')).toBe(true);
    expect(sourceSegmentHostAllowed('https://example.com/a.mp4')).toBe(false);
    expect(sourceSegmentHostAllowed('http://bucket.amazonaws.com/a.mp4')).toBe(false);
  });
  it('requires bounded exact segment windows',()=>{
    expect(validateSourceSegment(.4,15.4)).toEqual({start:.4,end:15.4,duration:15});
    expect(()=>validateSourceSegment(5,5)).toThrow('SOURCE_SEGMENT_WINDOW_INVALID');
    expect(()=>validateSourceSegment(0,181)).toThrow('SOURCE_SEGMENT_WINDOW_TOO_LONG');
  });
  it('creates deterministic safe storage paths',()=>{
    expect(candidateSegmentObjectPath('campaign/one','abc-def','a'.repeat(64))).toBe('momentcircuit/source-segments/campaign_one/abc-def-aaaaaaaaaaaaaaaaaaaa.mp4');
  });
});
