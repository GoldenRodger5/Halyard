import { describe, expect, it } from 'vitest';
import { ARTICULATION_WPM_AT_1, directVoice, speedForWpm, type VoiceEnergy } from './voice.js';
import { MAX_WPM, MIN_WPM } from '../qc/audioQC.js';

/**
 * §480 / §490. Speed is a real lever (verified live: 5.02s → 4.21s at 1.2),
 * and this voice reads ~180 wpm at 1.0 over clip durations — the top of the
 * band — so the slower energies direct a speed *under* 1.0 and nothing goes
 * past 1.05.
 */
describe('§490 directVoice speed', () => {
  const inputs: Array<Parameters<typeof directVoice>[0]> = [
    { platform: 'tiktok', visualLanguage: null, emotionalAngle: null, targetSeconds: 30 },
    { platform: 'youtube', visualLanguage: null, emotionalAngle: null, targetSeconds: 240 },
    { platform: 'instagram', visualLanguage: 'energetic_short', emotionalAngle: null, targetSeconds: 15 },
  ];

  it('always directs a speed inside the range ElevenLabs accepts', () => {
    for (const input of inputs) {
      const voice = directVoice(input);
      expect(voice.speed).toBeGreaterThanOrEqual(0.7);
      expect(voice.speed).toBeLessThanOrEqual(1.2);
    }
  });

  it('§496: every energy lands inside the pacing gate at the measured articulation', () => {
    for (const input of inputs) {
      const voice = directVoice(input);
      const predicted = voice.speed * ARTICULATION_WPM_AT_1;
      expect(predicted, `${voice.energy} predicts ${predicted.toFixed(0)} wpm`).toBeGreaterThanOrEqual(MIN_WPM);
      expect(predicted, `${voice.energy} predicts ${predicted.toFixed(0)} wpm`).toBeLessThanOrEqual(MAX_WPM);
    }
  });

  it('§496: the speed is a ratio of target to measured rate, clamped', () => {
    expect(speedForWpm(160, 194)).toBe(0.82);
    expect(speedForWpm(300, 194)).toBe(1.2);
    expect(speedForWpm(60, 194)).toBe(0.7);
  });

  it('reads faster as the energy rises', () => {
    const byEnergy = new Map<VoiceEnergy, number>();
    for (const input of inputs) {
      const voice = directVoice(input);
      byEnergy.set(voice.energy, voice.speed);
    }
    const order: VoiceEnergy[] = ['calm', 'warm', 'bright', 'urgent'];
    const seen = order.filter((e) => byEnergy.has(e));
    for (let i = 1; i < seen.length; i += 1) {
      expect(byEnergy.get(seen[i]!)!).toBeGreaterThanOrEqual(byEnergy.get(seen[i - 1]!)!);
    }
  });
});
