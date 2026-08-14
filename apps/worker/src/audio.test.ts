/**
 * The mix, tested against real FFmpeg on real audio.
 *
 * No mocks and no API key: the stems are synthesised with FFmpeg itself, so
 * these assertions are about what the filter graph actually produces rather
 * than about what it was asked to produce. That matters more here than usual —
 * every bug this module can have is one you would only hear.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  audioDuration,
  DEFAULT_TAIL_SECONDS,
  measureEdgeSilence,
  measureLoudness,
  MIN_DUCK_DEPTH_DB,
  mixAudio,
  TARGET_LUFS,
} from './audio.js';

const execFileAsync = promisify(execFile);

let dir: string;
let available = true;

/**
 * Speech-shaped enough to duck against: bursts of tone separated by gaps.
 *
 * The bursts are faded in and out rather than switched. An abrupt amplitude
 * change on a sine is a step discontinuity, which is broadband — it splatters
 * energy across the whole spectrum, including whatever band the music occupies.
 * The first version switched amplitude with `volume=...:eval=frame`, and the
 * splatter put a floor under the band-pass measurement: the ducking looked like
 * 9.5 dB because that was as far down as the *measurement* could see, not as
 * far as the compressor actually pulled.
 */
async function makeNarration(file: string, seconds = 4): Promise<void> {
  const phrase = (start: number, length: number): string =>
    `sine=frequency=300:duration=${length},afade=t=in:st=0:d=0.05,afade=t=out:st=${(length - 0.05).toFixed(2)}:d=0.05,adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}`;

  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=48000:cl=mono:d=${seconds}`,
    '-filter_complex',
    [
      `${phrase(0, 1.4)}[p1]`,
      `${phrase(2.0, 1.2)}[p2]`,
      `[0:a][p1][p2]amix=inputs=3:duration=first:normalize=0[out]`,
    ].join(';'),
    '-map',
    '[out]',
    '-ar',
    '48000',
    file,
  ]);
}

async function makeMusic(file: string, seconds = 2): Promise<void> {
  // Deliberately shorter than the narration, so the loop path is exercised.
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=1150:duration=${seconds}`,
    '-ar',
    '48000',
    file,
  ]);
}

/**
 * Mean volume of a time slice, optionally through a narrow band-pass.
 *
 * The stems are deliberately at unrelated pitches — narration at 300 Hz, music
 * at 1150 Hz — so filtering the finished mix to a narrow band around the music
 * isolates the *music's* contribution to it. That is what makes it possible to
 * measure how far the bed steps back under speech, rather than measuring the
 * total level and inferring.
 */
async function meanVolumeDb(
  file: string,
  from: number,
  to: number,
  bandHz?: number,
): Promise<number> {
  const chain = [`atrim=${from}:${to}`];
  if (bandHz) chain.push(`bandpass=f=${bandHz}:width_type=h:w=60`);
  chain.push('volumedetect');

  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i',
    file,
    '-af',
    chain.join(','),
    '-f',
    'null',
    '-',
  ]);
  const match = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  if (!match) throw new Error('volumedetect produced no mean_volume');
  return Number(match[1]);
}

/**
 * The pitch of the synthesised music bed, isolated by the band-pass above.
 *
 * Deliberately **not** a harmonic of the narration's 300 Hz. The first version
 * used 440 Hz against a 220 Hz narration — exactly the second harmonic — so any
 * nonlinearity in the chain, including the MP3 encode, folded narration energy
 * straight into the band that was supposed to contain only music. The test then
 * measured the narration and called it the bed.
 */
const MUSIC_HZ = 1150;

beforeAll(async () => {
  try {
    await execFileAsync('ffmpeg', ['-version']);
  } catch {
    available = false;
    return;
  }
  dir = await mkdtemp(path.join(tmpdir(), 'halyard-audio-test-'));
}, 60_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const d = available ? describe : describe.skip;

d('mixAudio', () => {
  it('normalises narration alone to the platform target', async () => {
    const narration = path.join(dir, 'vo1.wav');
    const out = path.join(dir, 'mix1.mp3');
    await makeNarration(narration);

    const result = await mixAudio({ narrationPath: narration, outputPath: out });

    expect(result.hadMusic).toBe(false);
    // Within a dB of target is what two-pass loudnorm delivers in practice.
    expect(Math.abs(result.lufs - TARGET_LUFS)).toBeLessThan(1.5);
    // The true-peak ceiling exists to survive lossy encoding.
    expect(result.truePeakDb).toBeLessThan(0);
  }, 120_000);

  it('holds a tail after the last word rather than cutting on a syllable', async () => {
    const narration = path.join(dir, 'vo2.wav');
    const out = path.join(dir, 'mix2.mp3');
    await makeNarration(narration, 3);

    const result = await mixAudio({ narrationPath: narration, outputPath: out });

    const source = await audioDuration(narration);
    expect(result.durationSeconds).toBeGreaterThan(source);
    expect(result.durationSeconds).toBeCloseTo(source + DEFAULT_TAIL_SECONDS, 0);
  }, 120_000);

  it('ducks the music while someone is speaking and lets it back in the gap', async () => {
    /**
     * The assertion that justifies the module. A static bed at a fixed level is
     * what makes a video sound like a template; the ducking is most of what
     * makes it sound produced. A filter graph that silently failed to
     * side-chain would still emit a perfectly valid file at the right loudness,
     * so loudness alone cannot tell us it worked.
     */
    const narration = path.join(dir, 'vo3.wav');
    const music = path.join(dir, 'music3.wav');
    const out = path.join(dir, 'mix3.mp3');
    await makeNarration(narration);
    await makeMusic(music);

    const result = await mixAudio({ narrationPath: narration, musicPath: music, outputPath: out });
    expect(result.hadMusic).toBe(true);

    // Isolate the bed's own frequency band, so this measures the music rather
    // than the total. Comparing total level would pass even if the sidechain
    // had silently failed, because speech is louder than a bed either way.
    const bedUnderSpeech = await meanVolumeDb(out, 0.3, 1.2, MUSIC_HZ);
    const bedInGap = await meanVolumeDb(out, 1.6, 1.9, MUSIC_HZ);

    // The bed has to actually be there in the gap. A permanently clamped
    // sidechain, or a loop that failed and left the back half dry, reads as
    // near-silence here.
    expect(bedInGap).toBeGreaterThan(-70);

    // And it has to genuinely step back under speech, by the depth the module
    // documents. This is the assertion that makes MIN_DUCK_DEPTH_DB a fact
    // rather than a comment: measured against this material the graph delivers
    // about 11 dB, and the floor fails loudly if the side-chain comes adrift.
    expect(bedInGap - bedUnderSpeech).toBeGreaterThan(MIN_DUCK_DEPTH_DB);
  }, 180_000);

  it('loops a bed shorter than the narration instead of leaving the end dry', async () => {
    const narration = path.join(dir, 'vo4.wav');
    const music = path.join(dir, 'music4.wav');
    const out = path.join(dir, 'mix4.mp3');
    await makeNarration(narration, 5);
    await makeMusic(music, 1.5);

    await mixAudio({ narrationPath: narration, musicPath: music, outputPath: out });

    // Well past the end of a single pass of the bed, in the bed's own band.
    const late = await meanVolumeDb(out, 4.2, 4.8, MUSIC_HZ);
    expect(late).toBeGreaterThan(-70);
  }, 180_000);

  it('reaches the target with music present, not just with narration alone', async () => {
    const narration = path.join(dir, 'vo5.wav');
    const music = path.join(dir, 'music5.wav');
    const out = path.join(dir, 'mix5.mp3');
    await makeNarration(narration);
    await makeMusic(music);

    const result = await mixAudio({ narrationPath: narration, musicPath: music, outputPath: out });
    expect(Math.abs(result.lufs - TARGET_LUFS)).toBeLessThan(1.5);
  }, 180_000);
});

d('measureLoudness', () => {
  it('reports silence as infinitely quiet rather than as NaN', async () => {
    /**
     * FFmpeg prints `-inf` for digital silence, and JSON has no -Infinity, so
     * it arrives as the string "-inf". `Number("-inf")` is NaN, and every
     * comparison against NaN is false — so a silent track would have passed
     * every loudness threshold by failing to be a number at all.
     */
    const silent = path.join(dir, 'silent.wav');
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-nostats',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=stereo:d=2',
      silent,
    ]);

    const measured = await measureLoudness(silent);
    expect(Number.isNaN(measured.lufs)).toBe(false);
    expect(measured.lufs).toBeLessThan(TARGET_LUFS);
  }, 120_000);
});

d('measureEdgeSilence', () => {
  it('finds silence held at the end of a file', async () => {
    const file = path.join(dir, 'trailing.wav');
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-nostats',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=300:duration=3',
      '-af',
      `volume='if(lt(t,1.5),1,0.00001)':eval=frame`,
      file,
    ]);

    const { trailingMs } = await measureEdgeSilence(file);
    expect(trailingMs).toBeGreaterThan(1000);
  }, 120_000);

  it('reports no leading silence when the file opens on sound', async () => {
    const file = path.join(dir, 'immediate.wav');
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-nostats',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=300:duration=2',
      file,
    ]);

    const { leadingMs } = await measureEdgeSilence(file);
    expect(leadingMs).toBe(0);
  }, 120_000);
});
