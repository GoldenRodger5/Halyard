import {describe,expect,it} from 'vitest';
import {candidateSourceWindow} from './source-window';

describe('MomentCircuit candidate source window',()=>{
  it('keeps the verified nonzero source offset authoritative',()=>{
    expect(candidateSourceWindow(27.079,45.979)).toEqual({start:27.079,duration:18.9,end:45.979});
  });
  it('supports a source-relative zero window',()=>{
    expect(candidateSourceWindow(0,11.39)).toEqual({start:0,duration:11.39,end:11.39});
  });
  it('fails invalid or reversed candidate windows',()=>{
    expect(()=>candidateSourceWindow(-1,4)).toThrow('CANDIDATE_SOURCE_START_INVALID');
    expect(()=>candidateSourceWindow(5,5)).toThrow('CANDIDATE_SOURCE_END_INVALID');
    expect(()=>candidateSourceWindow(6,5)).toThrow('CANDIDATE_SOURCE_END_INVALID');
  });
});
