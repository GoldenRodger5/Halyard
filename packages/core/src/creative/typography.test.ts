import { describe, expect, it } from 'vitest';
import { VISUAL_LANGUAGES } from './motion.js';
import {
  AVAILABLE_FAMILIES,
  TYPOGRAPHY_FOR_LANGUAGE,
  TYPOGRAPHY_SYSTEMS,
  selectTypography,
  typographyById,
} from './typography.js';

describe('the systems are buildable from what is on disk', () => {
  it('names only bundled families', () => {
    /*
     * §226. The failure this prevents is silent: a system naming a face that
     * is not bundled renders in a fallback and loses its identity, exactly the
     * way §224's 700-weight serif quietly became a 400. `BUNDLED_FACES` in the
     * render package is the other half of this pair.
     */
    for (const system of TYPOGRAPHY_SYSTEMS) {
      for (const role of ['display', 'heading', 'body', 'label'] as const) {
        expect(AVAILABLE_FAMILIES, `${system.id}.${role}`).toContain(system[role].family);
      }
    }
  });

  it('gives every system a distinct display face or weight', () => {
    // Two systems that resolve to the same display type are one system with
    // two names, and the variety they promise is theatre.
    const displays = TYPOGRAPHY_SYSTEMS.map((s) => `${s.display.family}/${s.display.weight}`);
    expect(new Set(displays).size).toBe(TYPOGRAPHY_SYSTEMS.length);
  });

  it('keeps a readable hierarchy in every system', () => {
    for (const s of TYPOGRAPHY_SYSTEMS) {
      expect(s.display.scale, s.id).toBeGreaterThan(s.heading.scale);
      expect(s.heading.scale, s.id).toBeGreaterThan(s.body.scale);
      expect(s.body.scale, s.id).toBeGreaterThan(s.label.scale);
    }
  });

  it('gives every visual language at least three systems to rotate through', () => {
    /*
     * §227. Not arbitrary. Two systems alternate, and a viewer reads an
     * alternation as a pattern; three or more rotate. The first version of
     * this module left six of the thirteen languages with exactly one
     * compatible system, which meant typography never varied for them at all
     * — the appearance of variety with none delivered.
     */
    for (const [language, systems] of Object.entries(TYPOGRAPHY_FOR_LANGUAGE)) {
      expect(systems.length, `${language} can only use ${systems.join(', ')}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('covers every visual language the motion grammar can produce', () => {
    // A language with no entry falls through to the whole set, which is a
    // silent loss of the compatibility rule rather than an error.
    for (const language of VISUAL_LANGUAGES) {
      expect(TYPOGRAPHY_FOR_LANGUAGE[language], `no typography for ${language}`).toBeDefined();
    }
  });

  it('names only real systems', () => {
    const ids = new Set(TYPOGRAPHY_SYSTEMS.map((s) => s.id));
    for (const [language, systems] of Object.entries(TYPOGRAPHY_FOR_LANGUAGE)) {
      for (const id of systems) expect(ids, `${language} -> ${id}`).toContain(id);
    }
  });
});

describe('selectTypography', () => {
  it('picks a system compatible with the language', () => {
    const { system } = selectTypography({ visualLanguage: 'product_led' });
    expect(TYPOGRAPHY_FOR_LANGUAGE['product_led']).toContain(system.id);
  });

  it('avoids what the account just used', () => {
    /*
     * The whole mechanism. With six systems and no memory the same one wins
     * every time and the variety is theatre — which is exactly what happened
     * with one font pairing for every video ever made.
     */
    const first = selectTypography({ visualLanguage: 'kinetic' }).system.id;
    const second = selectTypography({
      visualLanguage: 'kinetic',
      recentSystemIds: [first],
    }).system.id;
    expect(second).not.toBe(first);
  });

  it('rotates rather than alternating between two', () => {
    const language = 'documentary';
    const used: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      used.unshift(selectTypography({ visualLanguage: language, recentSystemIds: used }).system.id);
    }
    // Three consecutive picks must not repeat while unused systems remain.
    expect(new Set(used).size).toBe(used.length);
  });

  it('honours an operator pin over recency', () => {
    const pinned = selectTypography({
      visualLanguage: 'kinetic',
      recentSystemIds: ['grotesque_punch'],
      pinned: 'grotesque_punch',
    });
    expect(pinned.system.id).toBe('grotesque_punch');
    expect(pinned.reason).toContain('Pinned');
  });

  it('falls back across all systems for an unknown language, not to a default', () => {
    // A default here would mean a new visual language silently inherits the
    // editorial serif and looks like everything else.
    const r = selectTypography({ visualLanguage: 'not_a_language' });
    expect(r.reason).toContain('No system declares');
    expect(r.alternatives.length).toBe(TYPOGRAPHY_SYSTEMS.length - 1);
  });

  it('says what it did not pick', () => {
    const r = selectTypography({ visualLanguage: 'kinetic' });
    expect(r.alternatives.length).toBeGreaterThan(0);
    expect(r.alternatives).not.toContain(r.system.id);
  });

  it('resolves a system by id', () => {
    expect(typographyById('grotesque_punch')?.display.family).toBe('Archivo');
    expect(typographyById('nope')).toBeNull();
  });
});
