import { describe, expect, it } from 'vitest';
import {
  FIRST_FRAME_WORDS,
  MAX_SECONDS_BETWEEN_INTERRUPTS,
  OPENING_FRAMES,
  SPOKEN_ANTI_PATTERNS,
  lintSpokenScript,
  runRetentionQC,
  type RetentionProbe,
} from './retentionQC.js';

/** A 30-second video sampled twice a second, changing state throughout. */
function probe(over: Partial<RetentionProbe> = {}): RetentionProbe {
  const frames = 60;
  return {
    fps: 30,
    durationSeconds: 30,
    frameLuminance: Array.from({ length: frames }, (_, i) => 0.5 + Math.sin(i / 3) * 0.1),
    frameDelta: Array.from({ length: frames - 1 }, () => 0.05),
    firstFrameWordCount: 5,
    firstFrameContrast: 9.2,
    loopSimilarity: 0.8,
    ...over,
  };
}

describe('the 3-second rule — Part C', () => {
  it('reserves the opening window at 3 seconds of frames', () => {
    expect(OPENING_FRAMES / 30).toBe(3);
  });

  it('passes a video that opens on content', () => {
    const result = runRetentionQC(probe(), { platform: 'tiktok' });
    expect(result.passed).toBe(true);
    expect(result.timeToContentSeconds).toBeLessThanOrEqual(0.5);
  });

  it('rejects a video that opens on a bumper', () => {
    // Five seconds of an unchanging brand card before anything happens.
    const flatOpening = Array.from({ length: 60 }, (_, i) => (i < 10 ? 0.5 : 0.5 + i / 200));
    const result = runRetentionQC(
      probe({ frameLuminance: flatOpening, frameDelta: flatOpening.map((_, i) => (i < 10 ? 0 : 0.05)) }),
      { platform: 'tiktok' },
    );
    expect(result.passed).toBe(false);
    const finding = result.findings.find((f) => f.rule === 'retention.no_content_in_opening');
    expect(finding?.detail).toMatch(/80% of completion variance/);
  });

  it('warns about a merely slow open without blocking', () => {
    const slow = Array.from({ length: 60 }, (_, i) => (i < 3 ? 0.5 : 0.5 + i / 200));
    const result = runRetentionQC(
      probe({ frameLuminance: slow, frameDelta: slow.map((_, i) => (i < 3 ? 0 : 0.05)) }),
      { platform: 'tiktok' },
    );
    expect(result.passed).toBe(true);
    expect(result.findings.some((f) => f.rule === 'retention.slow_open')).toBe(true);
  });
});

describe('frame 1 is a thumbnail', () => {
  it('wants four to seven words', () => {
    expect(FIRST_FRAME_WORDS).toEqual({ min: 4, max: 7 });
    expect(
      runRetentionQC(probe({ firstFrameWordCount: 5 }), { platform: 'tiktok' }).findings.some((f) =>
        f.rule.startsWith('retention.first_frame'),
      ),
    ).toBe(false);
  });

  it('rejects an empty first frame outright', () => {
    const result = runRetentionQC(probe({ firstFrameWordCount: 0 }), { platform: 'tiktok' });
    expect(result.passed).toBe(false);
    expect(
      result.findings.find((f) => f.rule === 'retention.first_frame_empty')?.message,
    ).toMatch(/wasted impression/);
  });

  it('warns at eight words and rejects at twelve', () => {
    expect(runRetentionQC(probe({ firstFrameWordCount: 8 }), { platform: 'tiktok' }).passed).toBe(true);
    expect(runRetentionQC(probe({ firstFrameWordCount: 12 }), { platform: 'tiktok' }).passed).toBe(false);
  });

  it('rejects thumbnail text below WCAG AA, because it has to survive a small preview', () => {
    const result = runRetentionQC(probe({ firstFrameContrast: 3.1 }), { platform: 'tiktok' });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.rule === 'retention.first_frame_contrast')).toBe(true);
  });
});

describe('pattern interrupts', () => {
  it('caps a static stretch at 15 seconds', () => {
    expect(MAX_SECONDS_BETWEEN_INTERRUPTS).toBe(15);
  });

  it('rejects a 30-second video that never changes state', () => {
    const result = runRetentionQC(
      probe({
        frameLuminance: [0.4, ...Array.from({ length: 59 }, () => 0.45)],
        frameDelta: Array.from({ length: 59 }, () => 0),
      }),
      { platform: 'tiktok' },
    );
    expect(result.findings.some((f) => f.rule === 'retention.no_pattern_interrupt')).toBe(true);
    expect(result.longestStaticStretchSeconds).toBeGreaterThan(15);
  });

  it('leaves a short video alone', () => {
    const result = runRetentionQC(
      probe({
        durationSeconds: 14,
        frameLuminance: [0.4, ...Array.from({ length: 27 }, () => 0.45)],
        frameDelta: Array.from({ length: 27 }, () => 0),
      }),
      { platform: 'tiktok' },
    );
    expect(result.findings.some((f) => f.rule === 'retention.no_pattern_interrupt')).toBe(false);
  });
});

describe('loop endings', () => {
  it('warns when a loop-ready platform gets an ending that does not loop', () => {
    const result = runRetentionQC(probe({ loopSimilarity: 0.2 }), {
      platform: 'tiktok',
      loopReady: true,
    });
    expect(result.passed).toBe(true);
    const finding = result.findings.find((f) => f.rule === 'retention.not_loop_ready');
    expect(finding?.detail).toMatch(/strongest watch signal/);
  });

  it('says nothing when the platform does not reward replays', () => {
    const result = runRetentionQC(probe({ loopSimilarity: 0.2 }), { platform: 'youtube' });
    expect(result.findings.some((f) => f.rule === 'retention.not_loop_ready')).toBe(false);
  });
});

describe('spoken slop — Part H', () => {
  it.each([
    ['Hey guys, welcome back to the channel.', 'spoken.greeting'],
    ['In this video I am going to show you the fix.', 'spoken.in_this_video'],
    ['So there you have it. Thanks for watching.', 'spoken.sign_off'],
    ['Make sure to try this at home.', 'spoken.make_sure_to'],
    ['But first, some background.', 'spoken.but_first'],
  ])('rejects %s', (script, rule) => {
    const result = lintSpokenScript(script);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.rule).toBe(rule);
  });

  it('rejects a first spoken line that restates the on-screen hook', () => {
    const result = lintSpokenScript('Your bread is gummy. The starch holds water.', {
      hook: 'Your bread is gummy',
    });
    expect(result.violations[0]?.rule).toBe('spoken.restates_hook');
  });

  it('accepts a script that opens on content', () => {
    const result = lintSpokenScript(
      'Gluten-free bread goes gummy for one reason. The starch holds water that wheat would release.',
      { hook: 'Your bread is gummy' },
    );
    expect(result.passed).toBe(true);
  });

  it('covers the written and spoken tells separately', () => {
    // "so there you have it" never appears in a caption and appears in every
    // second AI voiceover, which is why this list exists at all.
    expect(SPOKEN_ANTI_PATTERNS.map((p) => p.rule)).toContain('spoken.sign_off');
  });
});
