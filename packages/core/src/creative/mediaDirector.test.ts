/**
 * §296. Which kind of picture a beat gets.
 *
 * The decision a viewer notices first, and the one missing from
 * `CREATIVE_SYSTEM.md`'s table. Most of what is asserted here is the rule that
 * outranks every preference: a beat whose job is to show the product doing
 * something may only carry evidence.
 */
import { describe, expect, it } from 'vitest';
import { MEDIA_SOURCES, MEDIA_SOURCE_INFO, chooseMediaSource } from './mediaDirector.js';
import { EVIDENTIAL_ROLES } from '../imagery/types.js';

const everything = { appCaptures: 3, realFootage: 2, stockFootage: false, productStills: 4, canGenerate: true };
const nothing = { appCaptures: 0, realFootage: 0, stockFootage: false, productStills: 0, canGenerate: false };

describe('choosing a media source', () => {
  it('never puts a generated picture in a beat that must prove something', () => {
    /*
     * The rule that outranks preference. A generated photograph in a `proof`
     * beat is a claim about software nobody observed — §268's fabrication case.
     */
    for (const role of EVIDENTIAL_ROLES) {
      const { source } = chooseMediaSource({ role, inventory: everything });
      expect(MEDIA_SOURCE_INFO[source].canEvidence, `${role} -> ${source}`).toBe(true);
    }
  });

  it('falls back to type rather than to a picture that cannot back the claim', () => {
    /* Nothing evidential available: say nothing rather than imply something. */
    const { source, reason } = chooseMediaSource({
      role: 'proof',
      inventory: { ...nothing, canGenerate: true },
    });
    expect(source).toBe('typographic');
    expect(reason).toContain('evidence');
  });

  it('reaches for the product moving when the beat is a demo', () => {
    expect(chooseMediaSource({ role: 'demo', inventory: everything }).source).toBe('app_capture');
  });

  it('lets a hook take the most arresting thing, evidence or not', () => {
    /* A hook proves nothing, so beauty outranks provenance there. */
    const { source } = chooseMediaSource({ role: 'hook', inventory: everything });
    expect(['real_footage', 'generated_still']).toContain(source);
  });

  it('prefers a moving source where motion is the medium', () => {
    const still = chooseMediaSource({ role: 'context', inventory: everything });
    const moving = chooseMediaSource({ role: 'context', inventory: everything, needsMotion: true });
    expect(MEDIA_SOURCE_INFO[moving.source].motion).toBe(true);
    expect(moving.source).not.toBe(still.source);
  });

  it('honours an operator pick that is available and honest', () => {
    const { source, reason } = chooseMediaSource({
      role: 'context',
      inventory: everything,
      requested: 'app_capture',
    });
    expect(source).toBe('app_capture');
    expect(reason).toContain('operator');
  });

  it('refuses an operator pick that cannot evidence an evidential beat', () => {
    /*
     * Not a preference being overridden. No operator choice makes an
     * unobserved product claim true.
     */
    const { source, reason } = chooseMediaSource({
      role: 'proof',
      inventory: everything,
      requested: 'generated_still',
    });
    expect(source).toBe('typographic');
    expect(reason).toContain('cannot evidence');
  });

  it('falls through when the operator asks for something the account does not have', () => {
    const { source, reason } = chooseMediaSource({
      role: 'context',
      inventory: { ...nothing, canGenerate: true },
      requested: 'real_footage',
    });
    expect(source).toBe('generated_still');
    expect(reason).toContain('not available');
  });

  it('always has an answer, because type is the floor and not a failure', () => {
    const { source } = chooseMediaSource({ role: 'anything', inventory: nothing });
    expect(source).toBe('typographic');
  });

  it('explains itself, like every other creative decision here', () => {
    const { reason, alternatives } = chooseMediaSource({ role: 'demo', inventory: everything });
    expect(reason.length).toBeGreaterThan(25);
    expect(alternatives.length).toBeGreaterThan(0);
  });

  it('describes every source it can return', () => {
    for (const source of MEDIA_SOURCES) {
      expect(MEDIA_SOURCE_INFO[source].label.length, source).toBeGreaterThan(5);
    }
  });
});

describe('§478 stock footage', () => {
  const stocked = { appCaptures: 0, realFootage: 0, stockFootage: true, productStills: 0, canGenerate: true };

  it('is available only when a source is configured', () => {
    const possible = (c: { source: string; alternatives: string[] }) => [c.source, ...c.alternatives];
    const without = chooseMediaSource({ role: 'context', inventory: { ...stocked, stockFootage: false } });
    expect(possible(without)).not.toContain('stock_footage');
    const withIt = chooseMediaSource({ role: 'context', inventory: stocked });
    expect(possible(withIt)).toContain('stock_footage');
  });

  it('wins an explanatory beat that needs motion, over a generated still', () => {
    const choice = chooseMediaSource({ role: 'context', inventory: stocked, needsMotion: true });
    expect(choice.source).toBe('stock_footage');
  });

  it('never carries a demo or proof beat, because it cannot evidence anything', () => {
    for (const role of ['demo', 'proof', 'before', 'after', 'change']) {
      const choice = chooseMediaSource({ role, inventory: { ...stocked, canGenerate: false } });
      expect(choice.source, role).not.toBe('stock_footage');
    }
  });
});
