import { describe, expect, it } from 'vitest';
import {
  FIRST_FRAME_WORDS,
  MAX_SECONDS_BETWEEN_INTERRUPTS,
  OPENING_FRAMES,
  SPOKEN_ANTI_PATTERNS,
  lintSpokenScript,
  runRetentionQC,
  STATIC_DELTA_THRESHOLD,
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

/**
 * What the gate could not look at.
 *
 * `runRetentionQC` had no production caller at all — 310 lines reachable only
 * from this file. Wiring it into `review_media` gave it the two inputs that job
 * already probes (per-frame luminance and duration) and not the two it does not
 * (frame-1 OCR, first-to-last similarity). Without naming the difference, a
 * clean `passed` over two rules that never ran reads exactly like a full sweep.
 */
describe('rules that could not run are named, not omitted', () => {
  // Seven samples over twelve seconds is one every two seconds, which can
  // resolve the three-second opening window. Coarser sampling is its own case,
  // asserted at the bottom of this block.
  const minimal = {
    fps: 30,
    durationSeconds: 12,
    frameLuminance: [0.1, 0.4, 0.7, 0.3, 0.6, 0.2, 0.5],
  };

  it('names the thumbnail rules when frame 1 was never read', () => {
    const result = runRetentionQC(minimal, { platform: 'youtube' });
    expect(result.unmeasured).toContain('retention.first_frame_words');
    expect(result.unmeasured).toContain('retention.first_frame_contrast');
  });

  it('names the loop rule only where a loop is expected', () => {
    // On YouTube a loop ending is not the goal, so its absence is irrelevant
    // rather than unmeasured — reporting it everywhere would be noise.
    expect(runRetentionQC(minimal, { platform: 'youtube' }).unmeasured).not.toContain(
      'retention.not_loop_ready',
    );
    expect(
      runRetentionQC(minimal, { platform: 'tiktok', loopReady: true }).unmeasured,
    ).toContain('retention.not_loop_ready');
  });

  it('says so in the summary rather than reading as a clean sweep', () => {
    const result = runRetentionQC(minimal, { platform: 'youtube' });
    expect(result.passed).toBe(true);
    expect(result.summary).toMatch(/not measured/);
  });

  it('reports nothing unmeasured once every input is present', () => {
    const result = runRetentionQC(
      {
        ...minimal,
        firstFrameWordCount: 5,
        firstFrameContrast: 7,
        loopSimilarity: 0.8,
      },
      { platform: 'tiktok', loopReady: true },
    );
    expect(result.unmeasured).toEqual([]);
    expect(result.summary).not.toMatch(/not measured/);
  });

  it('will not answer the 3-second rule from sampling that cannot see it', () => {
    /**
     * `review_media` samples twelve frames per sixty seconds. On a 32-second
     * render that is one sample every 6.4 seconds, and a rule about the first
     * *three* seconds cannot be answered from it — every longer video would be
     * reported as opening late on the sampling artefact alone.
     *
     * A gate that fails everything is worse than one that passes everything,
     * because the first is the one that gets switched off.
     */
    const coarse = { fps: 30, durationSeconds: 32, frameLuminance: [0.96, 0.96, 0.95, 0.95, 0.96, 0.96] };
    const result = runRetentionQC(coarse, { platform: 'youtube' });

    expect(result.unmeasured).toContain('retention.no_content_in_opening');
    expect(result.findings.map((f) => f.rule)).not.toContain('retention.no_content_in_opening');
    expect(result.findings.map((f) => f.rule)).not.toContain('retention.slow_open');
    expect(result.summary).toMatch(/opening not resolvable/);
  });

  it('still answers it when the sampling is dense enough', () => {
    // Same static footage, sampled every second. Now the verdict is a real one.
    const dense = {
      fps: 30,
      durationSeconds: 12,
      frameLuminance: Array.from({ length: 13 }, () => 0.96),
    };
    const result = runRetentionQC(dense, { platform: 'youtube' });
    expect(result.unmeasured).not.toContain('retention.no_content_in_opening');
    expect(result.findings.map((f) => f.rule)).toContain('retention.no_content_in_opening');
  });

  it('keeps passed meaning "nothing that ran failed"', () => {
    // Deliberately unchanged. `passed` is about errors among the rules that
    // ran; the caller decides what an unmeasured rule does to the gate status,
    // and `review_media` drops it to a warning.
    const result = runRetentionQC(minimal, { platform: 'tiktok', loopReady: true });
    expect(result.passed).toBe(true);
    expect(result.unmeasured.length).toBeGreaterThan(0);
  });
});

/**
 * The signal, measured against Halyard's own renders.
 *
 * Every number below came out of `probeVideo` on the fixture videos in
 * `.render-output/video/`, through the same sampling production uses. An
 * earlier version of this block used a *different* ffmpeg invocation — the
 * first six seconds at 2fps — and presented it as the whole-video series. The
 * conclusion drawn from it ("every render over twenty seconds was about to be
 * rejected") was false, and it took re-measuring through `probeVideo` itself to
 * see that. Measuring the right thing is not the same as measuring.
 */
describe('the motion signal, against real renders', () => {
  const deltas = (series: number[]) => series.slice(1).map((v, i) => Math.abs(v - series[i]!));

  /** SubstitutionExplainer.mp4 — 32.0s, six samples, via `probeVideo`. */
  const SUBSTITUTION = {
    durationSeconds: 32.042667,
    mean: [0.9694, 0.9714, 0.9506, 0.9506, 0.9657, 0.9656],
    range: [0.9333, 0.6392, 0.6314, 0.6275, 0.9922, 0.9725],
  };

  it('detects the same scene changes with thirty times the margin', () => {
    /**
     * Both signals reach the same verdict on this render, and that is the
     * point: the mean reaches it by 0.0208 and 0.0151 against a 0.01 threshold,
     * so a slightly different card would tip it the wrong way. The range
     * reaches it by 0.294 and 0.365. One is a measurement; the other is luck.
     */
    const meanD = deltas(SUBSTITUTION.mean);
    const rangeD = deltas(SUBSTITUTION.range);

    const meanMargin = Math.max(...meanD) - STATIC_DELTA_THRESHOLD;
    const rangeMargin = Math.max(...rangeD) - STATIC_DELTA_THRESHOLD;
    expect(meanMargin).toBeLessThan(0.015);
    expect(rangeMargin).toBeGreaterThan(0.3);
  });

  it('reaches the same clean verdict either way on this render', () => {
    const base = {
      fps: 30,
      durationSeconds: SUBSTITUTION.durationSeconds,
      frameLuminance: SUBSTITUTION.mean,
    };
    const target = { platform: 'instagram', loopReady: true };

    const meanOnly = runRetentionQC(base, target);
    const withRange = runRetentionQC({ ...base, frameDelta: deltas(SUBSTITUTION.range) }, target);

    expect(meanOnly.findings.map((f) => f.rule)).not.toContain('retention.no_pattern_interrupt');
    expect(withRange.findings.map((f) => f.rule)).not.toContain('retention.no_pattern_interrupt');
  });

  it('fires on a template that really is static, under either signal', () => {
    /**
     * ScalingMath.mp4 — 24s, five samples. Range deltas
     * `[0.0000 0.0039 0.0000 0.0000]`: this card genuinely does not change for
     * twenty-four seconds, and the rule says so. That is the gate working, not
     * a signal problem — which is why `review_media` records the finding and
     * leaves the *severity* decision to a person rather than failing the item.
     */
    const result = runRetentionQC(
      {
        fps: 30,
        durationSeconds: 24.0,
        frameLuminance: [0.9682, 0.9671, 0.9671, 0.9671, 0.9671],
        frameDelta: [0.0, 0.0039, 0.0, 0.0],
      },
      { platform: 'instagram', loopReady: true },
    );
    expect(result.findings.map((f) => f.rule)).toContain('retention.no_pattern_interrupt');
    expect(result.passed).toBe(false);
  });
});
