import { describe, expect, it } from 'vitest';
import { parseBlurMean, parseFreezeStats } from './video.js';

describe('blur probe parsing', () => {
  it('reads FFmpeg blurdetect aggregate', () => {
    expect(
      parseBlurMean(
        'frame= 20 fps=0.0\n[Parsed_blurdetect_1 @ 0xabc] blur mean: 7.1380402\n',
      ),
    ).toBeCloseTo(7.1380402, 6);
  });

  it('takes the final aggregate when logs contain several blur lines', () => {
    expect(
      parseBlurMean('blur mean: 4.5\nnoise\nblur mean: 12.25\n'),
    ).toBe(12.25);
  });

  it('returns null when blurdetect produced no measurement', () => {
    expect(parseBlurMean('ffmpeg completed without blur output')).toBeNull();
  });
});

describe('freeze probe parsing', () => {
  it('computes frozen share from completed intervals', () => {
    const result = parseFreezeStats(
      [
        'lavfi.freezedetect.freeze_start: 0',
        'lavfi.freezedetect.freeze_duration: 2.8',
        'lavfi.freezedetect.freeze_end: 2.8',
        'lavfi.freezedetect.freeze_start: 3.2',
        'lavfi.freezedetect.freeze_duration: 4.3',
        'lavfi.freezedetect.freeze_end: 7.5',
      ].join('\n'),
      10,
    );

    expect(result).toEqual({
      freezeShare: 0.71,
      longestFreezeSeconds: 4.3,
      measuredSeconds: 10,
    });
  });

  it('counts a freeze that continues through the end of the measured window', () => {
    const result = parseFreezeStats(
      [
        'lavfi.freezedetect.freeze_start: 2',
        'lavfi.freezedetect.freeze_duration: 2',
        'lavfi.freezedetect.freeze_end: 4',
        'lavfi.freezedetect.freeze_start: 7',
      ].join('\n'),
      10,
    );

    expect(result?.freezeShare).toBe(0.5);
    expect(result?.longestFreezeSeconds).toBe(3);
  });

  it('reports zero rather than inventing motion when no freeze events were logged', () => {
    expect(parseFreezeStats('no freeze events', 10)).toEqual({
      freezeShare: 0,
      longestFreezeSeconds: 0,
      measuredSeconds: 10,
    });
  });
});
