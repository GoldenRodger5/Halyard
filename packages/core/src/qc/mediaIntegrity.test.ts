/**
 * §317. Each case here is a defect that actually shipped on 2026-08-29 and was
 * found by a person, not by a gate. The numbers are the measured ones.
 */
import { describe, it, expect } from 'vitest';
import { runMediaIntegrity } from './mediaIntegrity.js';

const ok = {
  durationSeconds: 42.6,
  meanVolumeDb: -19.1,
  hasNarration: true,
  requiredSeconds: 42.5,
};

describe('runMediaIntegrity', () => {
  it('passes a narrated piece that actually makes sound', () => {
    expect(runMediaIntegrity(ok).passed).toBe(true);
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
