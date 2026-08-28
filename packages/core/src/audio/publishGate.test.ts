import { describe, expect, it } from 'vitest';
import { audioIsPublishable } from './publishGate.js';

describe('audioIsPublishable', () => {
  /*
   * §244. The check §242 claimed existed and did not.
   *
   * The TTS handler mixes with `forPublication: false`, so a fixture bed is
   * legitimately in a draft mix. Without this gate that fixture would travel
   * all the way to a real post and the whole provenance apparatus would be
   * decoration.
   */
  it('publishes silence, because narration alone is a normal style', () => {
    expect(audioIsPublishable({ musicProvenance: [], sfxProvenance: [] }).publishable).toBe(true);
  });

  it('publishes a licensed mix', () => {
    const r = audioIsPublishable({
      musicProvenance: [{ title: 'Warm Counter', provenance: 'licensed_production' }],
      sfxProvenance: [{ title: 'Whoosh', provenance: 'licensed_production' }],
    });
    expect(r.publishable).toBe(true);
    expect(r.problems).toEqual([]);
  });

  it('refuses a test fixture and says what to do', () => {
    const r = audioIsPublishable({
      musicProvenance: [{ title: '[TEST] Warm Counter', provenance: 'test' }],
      sfxProvenance: [],
    });
    expect(r.publishable).toBe(false);
    expect(r.problems[0]).toContain('[TEST] Warm Counter');
    expect(r.problems[0]).toContain('publish it silent');
  });

  it('refuses an unverified bed differently from a fixture', () => {
    // They need different actions: one needs proof recorded, the other needs
    // replacing. A single message would send the operator to the wrong fix.
    const r = audioIsPublishable({
      musicProvenance: [{ title: 'Some Track', provenance: 'unverified' }],
      sfxProvenance: [],
    });
    expect(r.problems[0]).toContain('licence has not been verified');
  });

  it('refuses on an effect even when the music is fine', () => {
    const r = audioIsPublishable({
      musicProvenance: [{ title: 'Warm Counter', provenance: 'licensed_production' }],
      sfxProvenance: [{ title: '[TEST] Whoosh', provenance: 'test' }],
    });
    expect(r.publishable).toBe(false);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toContain('[TEST] Whoosh');
  });

  it('names every problem, not only the first', () => {
    const r = audioIsPublishable({
      musicProvenance: [
        { title: 'A', provenance: 'test' },
        { title: 'B', provenance: 'unverified' },
      ],
      sfxProvenance: [{ title: 'C', provenance: 'test' }],
    });
    expect(r.problems).toHaveLength(3);
  });
});
