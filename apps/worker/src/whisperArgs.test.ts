/**
 * §144. The flag that decides whether a transcript contains words.
 *
 * Found by running a real voiceover through the chain: whisper returned
 * "Your g ummy bread isn 't under cooked", the audio gate scored a 29.4% word
 * error rate against word-perfect speech, and the caption cues would have put
 * "g" and "ummy" on screen as separate cards. Nothing in the suite noticed,
 * because `transcribeWords` is mocked everywhere it is used.
 */
import { describe, expect, it } from 'vitest';
import { whisperArgs } from './video.js';

describe('whisperArgs', () => {
  const args = whisperArgs('/opt/models/ggml-base.en.bin', '/tmp/a.wav', '/tmp/out');

  it('splits segments on words, not on tokens', () => {
    expect(args).toContain('--split-on-word');
  });

  it('pairs it with the one-per-segment limit the caption cues rely on', () => {
    // --max-len 1 without --split-on-word is the bug: one *token* per segment.
    const i = args.indexOf('--max-len');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('1');
    expect(args.indexOf('--split-on-word')).toBeGreaterThan(i);
  });

  it('asks for the full JSON, which is where the offsets live', () => {
    expect(args).toContain('--output-json-full');
    expect(args.slice(args.indexOf('-m'))[1]).toBe('/opt/models/ggml-base.en.bin');
    expect(args[args.indexOf('-of') + 1]).toBe('/tmp/out');
  });
});
