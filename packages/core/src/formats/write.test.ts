/**
 * §411. The rules the writing is judged by, stated before it is written.
 *
 * `checkDraft` runs `slopFilter` over every slot and the brief never said so,
 * so the writer discovered the house style one refusal at a time. Live, a
 * `history` piece spent two of its three attempts on citations and the third on
 * a hype comparative it had never been told to avoid, and was abandoned. The
 * attempt budget exists for genuine misses, not for teaching the rules.
 */
import { describe, expect, it } from 'vitest';
import { briefFor } from './write.js';
import { POST_FORMAT_CATALOG } from './catalog.js';
import { BANNED_PHRASES } from '../qc/slopFilter.js';

const brief = briefFor(POST_FORMAT_CATALOG.history, {
  platform: 'tiktok',
  subject: 'Where did sourdough come from?',
  audience: 'home cooks',
} as never);

describe('the brief states the rules the writing is judged by', () => {
  it('names the constructions slopFilter refuses outright', () => {
    expect(brief).toContain('more than just');
    expect(brief).toContain('not just');
    expect(brief).toContain("that's where");
  });

  it('warns off the punctuation repairDraft would otherwise have to repair', () => {
    expect(brief.toLowerCase()).toContain('em dash');
    expect(brief.toLowerCase()).toContain('emoji');
  });

  it('does not paste the whole banned list', () => {
    /*
     * Forty-five phrases is a wall a model skims, and it refuses only the rows
     * somebody happened to list. Naming the shape refuses the family.
     */
    const pasted = BANNED_PHRASES.filter((p) => p.length > 12 && brief.includes(p));
    expect(pasted).toEqual([]);
  });

  it('still asks for every slot, which is the brief’s actual job', () => {
    for (const slot of POST_FORMAT_CATALOG.history.slots) {
      expect(brief).toContain(slot.key);
    }
  });
});
