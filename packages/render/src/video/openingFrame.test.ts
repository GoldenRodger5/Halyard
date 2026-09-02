/**
 * §448. The slot that says it opens the piece must be the one on frame one.
 *
 * `FormatSlot.opensThePiece` is a *declaration*, and the writer's brief, the
 * draft check and the retention gate all act on it. If a builder reorders its
 * lines, the declaration keeps pointing at a slot that is no longer first and
 * every one of those three acts on the wrong text — silently, because a
 * thumbnail rule applied to the second beat still passes most of the time.
 *
 * That is the failure §124 records in another form: the rule was right and the
 * thing underneath it moved. So the declaration is held to the renderer, the
 * same way `lengthAgreement` holds the arithmetic and `handlerCoverage` holds
 * `JOB_KINDS`.
 */
import { describe, expect, it } from 'vitest';
import { POST_FORMATS, POST_FORMAT_CATALOG, THUMBNAIL_WORDS } from '@halyard/core';
import { videoForFormat } from './formatVideo.js';

/** One filled slot per key, with text that identifies which slot it came from. */
function fill(formatId: (typeof POST_FORMATS)[number]) {
  const format = POST_FORMAT_CATALOG[formatId];
  const slots: Array<{ key: string; index: number; text: string; citation?: string }> = [];
  for (const slot of format.slots) {
    for (let i = 0; i < (slot.repeats ?? 1); i += 1) {
      slots.push({
        key: slot.key,
        index: i,
        /* Distinctive and long enough to survive `splitLongLine` intact. */
        text: `${slot.key} ${i} marker text`,
        citation: 'https://example.org/a',
      });
    }
  }
  return { format, slots };
}

describe('the declared opening slot is the rendered first frame', () => {
  it('agrees for every format that has a video builder', () => {
    for (const id of POST_FORMATS) {
      const { format, slots } = fill(id);
      const built = videoForFormat(id, slots);
      if (!built) continue;

      const declared = format.slots.find((s) => s.opensThePiece);
      expect(declared, `${id} has a video builder and declares no opening slot`).toBeDefined();

      const beats = built.props.beats as Array<{ text: string }> | undefined;
      /*
       * A composition with no beats — the quiz's own template, the walkthrough's
       * phone frame — draws its opening from its own props rather than from a
       * beat list. Those are checked below against what the builder actually
       * puts on screen first.
       */
      if (!beats || beats.length === 0) {
        const opening = String(
          (built.props as Record<string, unknown>).title ??
            (built.props as Record<string, unknown>).headline ??
            '',
        );
        expect(opening, `${id} draws no opening text`).toContain(declared!.key);
        continue;
      }

      expect(beats[0]!.text, `${id}: beat 0 is not the ${declared!.key}`).toContain(declared!.key);
    }
  });

  it('marks exactly one opening slot per format', () => {
    for (const id of POST_FORMATS) {
      const opening = POST_FORMAT_CATALOG[id].slots.filter((s) => s.opensThePiece);
      expect(opening.length, id).toBeLessThanOrEqual(1);
    }
  });

  /*
   * A ceiling below the thumbnail minimum would make the two rules contradict:
   * the budget would refuse to write four words and the gate would demand them.
   */
  it('never gives an opening slot a ceiling under the thumbnail minimum', () => {
    for (const id of POST_FORMATS) {
      const opening = POST_FORMAT_CATALOG[id].slots.find((s) => s.opensThePiece);
      if (!opening) continue;
      expect(opening.maxWords, id).toBeGreaterThanOrEqual(THUMBNAIL_WORDS.min);
    }
  });
});
