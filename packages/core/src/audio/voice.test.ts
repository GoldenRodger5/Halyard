import { describe, expect, it } from 'vitest';
import { directVoice, type VoiceEnergy } from './voice.js';

/**
 * §480. The read this voice gives at 1.0 is ~127 words a minute against a
 * 140–175 gate. Speed is a real lever now (verified live: 5.02s → 4.21s at
 * 1.2), so every energy directs one, and none is left at the default.
 */
describe('§480 directVoice speed', () => {
  const inputs: Array<Parameters<typeof directVoice>[0]> = [
    { platform: 'tiktok', visualLanguage: null, emotionalAngle: null, targetSeconds: 30 },
    { platform: 'youtube', visualLanguage: null, emotionalAngle: null, targetSeconds: 240 },
    { platform: 'instagram', visualLanguage: 'energetic_short', emotionalAngle: null, targetSeconds: 15 },
  ];

  it('always directs a speed inside the range ElevenLabs accepts, and above the default', () => {
    for (const input of inputs) {
      const voice = directVoice(input);
      expect(voice.speed).toBeGreaterThan(1);
      expect(voice.speed).toBeLessThanOrEqual(1.2);
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
