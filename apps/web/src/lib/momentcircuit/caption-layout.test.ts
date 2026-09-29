import { describe, expect, it } from 'vitest';
import { captionAnchorForCue, captionTopForAnchor, shotForCaptionCue } from './caption-layout';
import type { ShotPlan } from './edit-plan';

const shots: ShotPlan[] = [
  { start: 0, end: 2, focus_x: 0.45, layout: 'SINGLE_SPEAKER' },
  { start: 2, end: 5, focus_x: 0.5, layout: 'SPLIT_SCREEN' },
];

describe('MomentCircuit layout-aware caption placement', () => {
  it('uses the verified shot active at the cue midpoint', () => {
    expect(shotForCaptionCue(shots,{start:0.4,end:1.4,text:'single speaker'})?.layout).toBe('SINGLE_SPEAKER');
    expect(shotForCaptionCue(shots,{start:2.2,end:3.2,text:'split screen'})?.layout).toBe('SPLIT_SCREEN');
  });

  it('moves stacked split-screen captions to the inter-panel seam', () => {
    expect(captionAnchorForCue(shots,{start:2.1,end:3,text:'reaction payoff'})).toBe('SPLIT_SEAM');
    expect(captionTopForAnchor('SPLIT_SEAM',1)).toBe(914);
    expect(captionTopForAnchor('SPLIT_SEAM',2)).toBe(844);
    expect(captionTopForAnchor('LOWER_MIDDLE',1)).toBe(1320);
  });

  it('keeps a cue spanning a cut attached to the shot containing its midpoint', () => {
    expect(captionAnchorForCue(shots,{start:1.8,end:2.6,text:'crosses cut'})).toBe('SPLIT_SEAM');
  });
});
