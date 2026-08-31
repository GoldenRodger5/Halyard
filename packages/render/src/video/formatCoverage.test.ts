/**
 * §408. Every format in the catalogue can actually be made.
 *
 * `videoTemplateCoverage.test.ts` asserts that every format *with* a builder
 * targets a registered composition. Nothing asserted that a format *had* one —
 * so `comparison`, `poll` and `behind` sat in the catalogue with no video path
 * at all, and `walkthrough` with no deck. They were written, offered to the
 * operator, chosen by the format picker, filled by the writer, and then had
 * nowhere to go.
 *
 * That is this codebase's recurring shape one more time: the thing exists, and
 * the step that would have used it was never wired. A coverage assertion is the
 * only thing that catches it, because every individual piece typechecks.
 *
 * A format may be absent from a surface — but it has to say so here, with a
 * reason, rather than by silently missing.
 */
import { describe, expect, it } from 'vitest';
import { POST_FORMATS, POST_FORMAT_CATALOG } from '@halyard/core';
import { VIDEO_FORMATS, videoForFormat } from './formatVideo.js';
import { RENDERABLE_FORMATS, slidesForFormat } from '../image/formatSlides.js';

/**
 * A plausible filled draft for a format: every slot, every repeat, real words.
 *
 * Built from the catalogue rather than hand-written per format, so a format
 * added tomorrow is covered without anybody remembering to add a fixture.
 */
function filled(id: (typeof POST_FORMATS)[number]) {
  const out: Array<{ key: string; index: number; text: string; citation: string | null }> = [];
  for (const slot of POST_FORMAT_CATALOG[id].slots) {
    for (let i = 0; i < (slot.repeats ?? 1); i += 1) {
      out.push({
        key: slot.key,
        index: i,
        text: `A real sentence for ${slot.key} number ${i + 1}, long enough to lay out.`,
        citation: 'https://example.org/source',
      });
    }
  }
  return out;
}

/**
 * Formats with no builder of their own on a surface, and why that is correct.
 *
 * Both are artifact-driven: the artifact *is* the subject, so the video comes
 * from `chooseVideoComposition` — TransformationDiff, SubstitutionExplainer,
 * ChefNoteCard — which is shaped around the artifact rather than around slots.
 * A slot-driven builder here would render the words about the change instead of
 * the change.
 */
const NO_VIDEO_BUILDER: Record<string, string> = {
  recipe: 'artifact-driven: the video comes from chooseVideoComposition',
  transformation: 'artifact-driven: the video comes from chooseVideoComposition',
};

const NO_CAROUSEL_BUILDER: Record<string, string> = {};

describe('format coverage', () => {
  it('every format can be made as a video, or says why not', () => {
    const missing = POST_FORMATS.filter(
      (id) => !VIDEO_FORMATS.includes(id) && !(id in NO_VIDEO_BUILDER),
    );
    expect(missing).toEqual([]);
  });

  it('every format can be made as a carousel, or says why not', () => {
    const missing = POST_FORMATS.filter(
      (id) => !RENDERABLE_FORMATS.includes(id) && !(id in NO_CAROUSEL_BUILDER),
    );
    expect(missing).toEqual([]);
  });

  it('the exemption lists name real formats', () => {
    /*
     * §403's refusal table keyed a rule on `myth` when the format is
     * `myth_fact`, and the entry was unreachable from the day it was written.
     * An exemption for a format that does not exist would silently un-exempt
     * one that does.
     */
    for (const id of [...Object.keys(NO_VIDEO_BUILDER), ...Object.keys(NO_CAROUSEL_BUILDER)]) {
      expect(POST_FORMATS).toContain(id);
    }
  });

  it('no format is exempt from both surfaces at once', () => {
    /* A format that can be neither video nor deck cannot be published at all. */
    for (const id of POST_FORMATS) {
      const hasVideo = VIDEO_FORMATS.includes(id) || id in NO_VIDEO_BUILDER;
      const hasDeck = RENDERABLE_FORMATS.includes(id) || id in NO_CAROUSEL_BUILDER;
      expect(hasVideo || hasDeck, `${id} has no renderable surface`).toBe(true);
    }
  });

  it('every builder actually produces something from a filled draft', () => {
    /*
     * §408. The failure this catches, found live: `walkthrough` was given a
     * carousel builder that reused `narrativeSlides`, which hardcodes the
     * history and origin key sets. It typechecked, it was registered, it was
     * reachable — and it returned **zero slides**, because every key it looks
     * for is absent from a walkthrough. A builder that returns nothing is
     * indistinguishable from a format with no builder at all, and the coverage
     * check above passes for both.
     */
    for (const id of POST_FORMATS) {
      const slots = filled(id);
      if (VIDEO_FORMATS.includes(id)) {
        const video = videoForFormat(id, slots);
        expect(video, `${id}: video builder returned null`).not.toBeNull();
        const props = video!.props as { beats?: unknown[]; questions?: unknown[]; steps?: unknown[] };
        /*
         * Quiz and Walkthrough are not beat-driven — one renders questions, the
         * other the capture the worker supplies — so the assertion is that the
         * composition got *something* to draw, not that it got beats.
         */
        const carries =
          (props.beats?.length ?? 0) + (props.questions?.length ?? 0) > 0 ||
          video!.compositionId === 'Walkthrough';
        expect(carries, `${id}: video props carry nothing to draw`).toBe(true);
      }
      if (RENDERABLE_FORMATS.includes(id)) {
        expect(slidesForFormat(id, slots).length, `${id}: deck builder made no slides`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('every format in the catalogue declares slots to fill', () => {
    for (const id of POST_FORMATS) {
      expect(POST_FORMAT_CATALOG[id].slots.length, `${id} has no slots`).toBeGreaterThan(0);
    }
  });
});
