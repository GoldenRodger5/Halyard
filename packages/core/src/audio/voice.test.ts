import { describe, expect, it } from 'vitest';
import { directVoice, type VoiceEnergy } from './voice.js';

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

  it('always directs a speed inside the range ElevenLabs accepts, and never far above 1.0', () => {
    for (const input of inputs) {
      const voice = directVoice(input);
      expect(voice.speed).toBeGreaterThanOrEqual(0.85);
      expect(voice.speed).toBeLessThanOrEqual(1.05);
    }
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
