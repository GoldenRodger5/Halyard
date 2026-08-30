/**
 * §311. Every mood the director can want must be a mood a bed can have.
 *
 * `moodFor` returned `driving` for a kinetic piece and `confident` for an
 * editorial cut, and `IMPORTABLE_MOODS` excluded both — so no bed of either
 * mood could exist and every such piece scored a mood mismatch against the
 * entire library. Two settings on the music director that nothing could satisfy.
 *
 * Two lists in two files that must agree, which is gotcha 1's shape, so it gets
 * a test rather than a comment.
 */
import { describe, it, expect } from 'vitest';
import { BED_MOODS, moodFor, type AudioBrief } from './director.js';
import { IMPORTABLE_MOODS } from './import.js';
import { BED_SEARCHES } from './openverse.js';

/** Every combination of the inputs `moodFor` actually branches on. */
function everyBrief(): AudioBrief[] {
  const angles = [
    undefined,
    'surprise',
    'delight',
    'relief',
    'calm',
    'recognition',
    'curiosity',
    'urgency',
    'tension',
    'something nobody wrote a branch for',
  ];
  const languages = [
    undefined,
    'kinetic',
    'editorial_cut',
    'product_led',
    'documentary',
  ] as const;

  const out: AudioBrief[] = [];
  for (const emotionalAngle of angles) {
    for (const visualLanguage of languages) {
      out.push({ emotionalAngle, visualLanguage } as unknown as AudioBrief);
    }
  }
  return out;
}

describe('mood coverage', () => {
  it('can import a bed for every mood the director can ask for', () => {
    const wanted = new Set(everyBrief().map(moodFor));
    const missing = [...wanted].filter((m) => !IMPORTABLE_MOODS.includes(m as never));
    expect(
      missing,
      `moodFor can return these and no bed may be imported with them, so such a ` +
        `piece scores a mismatch against the whole library: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('does not allow importing a mood nothing can ever ask for', () => {
    /*
     * A bed nobody can select is a file, not a capability — and it makes the
     * library look better stocked than it is.
     */
    const wanted = new Set(everyBrief().map(moodFor));
    const unreachable = IMPORTABLE_MOODS.filter((m) => !wanted.has(m));
    expect(unreachable, `importable but unreachable: ${unreachable.join(', ')}`).toEqual([]);
  });

  it('has a search for every importable mood', () => {
    /* Otherwise the import finds nothing for it and the gap is silent. */
    for (const mood of IMPORTABLE_MOODS) {
      expect(BED_SEARCHES[mood], `${mood} has no CC0 search`).toBeTruthy();
    }
  });

  it('never returns a mood outside the declared vocabulary', () => {
    for (const brief of everyBrief()) {
      expect(BED_MOODS).toContain(moodFor(brief));
    }
  });
});
