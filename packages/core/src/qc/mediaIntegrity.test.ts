/**
 * §317. Each case here is a defect that actually shipped on 2026-08-29 and was
 * found by a person, not by a gate. The numbers are the measured ones.
 */
import { describe, it, expect } from 'vitest';
import { runMediaIntegrity } from './mediaIntegrity.js';

const ok = {
  durationSeconds: 42.6,
  width: 1080,
  height: 1920,
  blurMean: 7.1,
  meanVolumeDb: -19.1,
  hasNarration: true,
  requiredSeconds: 42.5,
};

describe('runMediaIntegrity', () => {
  it('passes a narrated piece that actually makes sound', () => {
    expect(runMediaIntegrity(ok).passed).toBe(true);
  });

  it('blocks a final video below the 720px short-edge floor', () => {
    const result = runMediaIntegrity({ ...ok, width: 480, height: 854 });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('media.low_resolution');
  });

  it('warns on noticeable softness without rejecting shallow-focus footage', () => {
    const result = runMediaIntegrity({ ...ok, blurMean: 10.5 });
    expect(result.passed).toBe(true);
    expect(result.findings.map((f) => f.rule)).toContain('media.soft_focus');
  });

  it('blocks severe blur calibrated against a deliberately destroyed render', () => {
    const result = runMediaIntegrity({ ...ok, blurMean: 23.98 });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('media.severe_blur');
  });

  it('blocks a motion-first video that is frozen for most of its runtime', () => {
    const result = runMediaIntegrity({
      ...ok,
      expectedMotion: true,
      freezeShare: 0.91,
      longestFreezeSeconds: 4.27,
    });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('media.motion_mostly_frozen');
  });

  it('warns when a motion-first video has too many held stretches but is not a slideshow', () => {
    const result = runMediaIntegrity({
      ...ok,
      expectedMotion: true,
      freezeShare: 0.66,
      longestFreezeSeconds: 4.0,
    });
    expect(result.passed).toBe(true);
    expect(result.findings.map((f) => f.rule)).toContain('media.motion_too_sparse');
  });

  it('does not apply the motion promise rule to a deliberately still-led execution', () => {
    const result = runMediaIntegrity({
      ...ok,
      expectedMotion: false,
      freezeShare: 0.9,
      longestFreezeSeconds: 6,
    });
    expect(result.passed).toBe(true);
    expect(result.findings.map((f) => f.rule)).not.toContain('media.motion_mostly_frozen');
  });

  it('catches the silent audio track', () => {
    /* Four rendered files carried a -91 dB stream, so players showed audio. */
    const result = runMediaIntegrity({ ...ok, meanVolumeDb: -91 });
    expect(result.passed).toBe(false);
    expect(result.findings[0]!.rule).toBe('media.silent_audio');
  });

  it('catches a narrated piece with no audio stream at all', () => {
    const result = runMediaIntegrity({ ...ok, meanVolumeDb: null });
    expect(result.findings.map((f) => f.rule)).toContain('media.no_audio_stream');
  });

  it('allows a caption-led cut with no narration to be silent', () => {
    /* A silent short is a normal style. Only a *narrated* silent one is broken. */
    expect(
      runMediaIntegrity({ ...ok, hasNarration: false, meanVolumeDb: null }).passed,
    ).toBe(true);
  });

  it('catches the quiz that ended on "Question 3 of 4"', () => {
    /* Sized for three questions, given four: 23.4s of file for 30.6s of content. */
    const result = runMediaIntegrity({ ...ok, durationSeconds: 23.4, requiredSeconds: 30.6 });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('media.truncated');
  });

  it('tolerates frame rounding rather than failing on it', () => {
    expect(runMediaIntegrity({ ...ok, durationSeconds: 30.656, requiredSeconds: 30.6 }).passed).toBe(
      true,
    );
  });

  it('warns rather than fails when a file runs past its last beat', () => {
    const result = runMediaIntegrity({ ...ok, durationSeconds: 50, requiredSeconds: 42.5 });
    expect(result.passed).toBe(true);
    expect(result.findings.map((f) => f.rule)).toContain('media.dead_tail');
  });

  it('catches the aside still being spoken over the next question', () => {
    /* Measured: the aside clip was 3.84s and the next line began 1.9s later. */
    const result = runMediaIntegrity({
      ...ok,
      narration: [
        { atSeconds: 7.3, durationSeconds: 3.84, text: 'Beccari separated wheat into starch…' },
        { atSeconds: 9.15, durationSeconds: 2.2, text: 'Which flour needs the most liquid?' },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('media.narration_overrun');
  });

  it('treats a breath between lines as a breath', () => {
    const result = runMediaIntegrity({
      ...ok,
      narration: [
        { atSeconds: 0, durationSeconds: 2.0, text: 'One' },
        { atSeconds: 2.05, durationSeconds: 2.0, text: 'Two' },
      ],
    });
    expect(result.passed).toBe(true);
  });
});

describe('§320. the container, not the audio', () => {
  it('catches an index that sits after the media data', () => {
    /*
     * The mix measured -19 dB and played correctly in ffmpeg while an operator
     * heard nothing. Extracting the same audio to an MP3 played fine, which is
     * what pointed at the container. No level measurement can see this.
     */
    const result = runMediaIntegrity({
      durationSeconds: 42.6,
      meanVolumeDb: -19.1,
      hasNarration: true,
      moovBeforeMdat: false,
    });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('media.no_faststart');
  });

  it('passes a file whose index is at the front', () => {
    expect(
      runMediaIntegrity({
        durationSeconds: 42.6,
        meanVolumeDb: -19.1,
        hasNarration: true,
        moovBeforeMdat: true,
      }).passed,
    ).toBe(true);
  });

  it('does not fail a file it could not inspect', () => {
    /* Unknown is not broken — gotcha 9's rule, applied to a container. */
    expect(
      runMediaIntegrity({
        durationSeconds: 42.6,
        meanVolumeDb: -19.1,
        hasNarration: true,
        moovBeforeMdat: null,
      }).passed,
    ).toBe(true);
  });
});
