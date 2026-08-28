import { describe, expect, it } from 'vitest';
import { IMPORTABLE_MOODS, validateBedImport, type BedImport } from './import.js';

const sound: BedImport = {
  title: 'A New Town',
  source: 'https://opengameart.org/content/a-new-town-rpg-theme',
  licence: 'CC0 1.0 Universal',
  licensor: 'cynicmusic',
  licenceProof: 'https://creativecommons.org/publicdomain/zero/1.0/',
  mood: 'warm',
  energy: 0.4,
  bpm: 96,
  durationSeconds: 120,
  loopable: true,
};

describe('validateBedImport', () => {
  it('admits a properly evidenced bed as production', () => {
    const v = validateBedImport(sound);
    expect(v.provenance).toBe('licensed_production');
    expect(v.errors).toEqual([]);
  });

  it('will not infer a licence from a free download', () => {
    /*
     * §248. The whole point. There is no path from "this was free to
     * download" to publishable that does not pass through a person writing
     * down where the grant is.
     */
    const v = validateBedImport({ ...sound, licenceProof: null });
    expect(v.provenance).toBe('unverified');
    expect(v.warnings.join(' ')).toContain('stated but not evidenced');
  });

  it('treats an unrecognised licence as unverified rather than guessing', () => {
    const v = validateBedImport({ ...sound, licence: 'Bloggs Media Terms v3' });
    expect(v.provenance).toBe('unverified');
    expect(v.warnings.join(' ')).toContain('not a licence this importer recognises');
  });

  it('still imports an unverified bed, because losing it is worse', () => {
    // Unverified keeps it out of posts; discarding it means downloading it
    // again later and re-deciding the same question.
    const v = validateBedImport({ ...sound, licence: '' });
    expect(v.provenance).toBe('unverified');
    expect(v.errors).toEqual([]);
  });

  it('refuses attribution that cannot be rendered', () => {
    const v = validateBedImport({ ...sound, attributionRequired: true, attributionText: '  ' });
    expect(v.errors.join(' ')).toContain('cannot credit a licensor it was not told about');
  });

  it('refuses a mood the director cannot score', () => {
    /*
     * A bed with an unreachable mood sits in the library and is never
     * selected — present, paid for, and invisible.
     */
    const v = validateBedImport({ ...sound, mood: 'melancholy' });
    expect(v.errors.join(' ')).toContain('never selected');
    for (const mood of IMPORTABLE_MOODS) {
      expect(validateBedImport({ ...sound, mood }).errors).toEqual([]);
    }
  });

  it('refuses an unmeasured duration', () => {
    expect(validateBedImport({ ...sound, durationSeconds: 0 }).errors.join(' ')).toContain('measured from the file');
  });

  it('warns about a short bed that cannot loop', () => {
    const v = validateBedImport({ ...sound, durationSeconds: 12, loopable: false });
    expect(v.warnings.join(' ')).toContain('can only cover pieces shorter than itself');
  });

  it('warns that vocals will rarely be chosen', () => {
    expect(validateBedImport({ ...sound, hasVocals: true }).warnings.join(' ')).toContain('rarely be chosen');
  });

  it('refuses an out-of-range energy, which is not a volume', () => {
    expect(validateBedImport({ ...sound, energy: 40 }).errors.join(' ')).toContain('0..1');
  });
});
