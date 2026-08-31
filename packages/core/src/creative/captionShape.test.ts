/**
 * §419. An account whose every caption is the same rhythm reads as automated.
 *
 * `VARIETY_BY_POST_TYPE.md` §2.3 calls this the largest gap and the least
 * obvious, "because nothing renders" — every individual caption is fine and no
 * gate would ever catch the sameness. And it is wider than the three text post
 * types: every post has a caption, on every platform, under every video and
 * every carousel.
 */
import { describe, expect, it } from 'vitest';
import {
  CAPTION_SHAPES,
  SHAPE_BRIEF,
  chooseCaptionShape,
  shapesThatFit,
} from './captionShape.js';

/** Write n captions in a row, each seeing what came before. */
function series(n: number, fit: Parameters<typeof shapesThatFit>[0]): string[] {
  const recent: string[] = [];
  for (let i = 0; i < n; i += 1) recent.unshift(chooseCaptionShape({ fit, recent }).shape);
  return recent.reverse();
}

const rich = { itemCount: 5, hasTurn: true, hasSource: true, asksQuestion: true };

describe('what a caption can honestly be', () => {
  it('always offers a single sentence', () => {
    expect(shapesThatFit({})).toEqual(['single']);
  });

  it('offers a list only when there is something to list', () => {
    expect(shapesThatFit({ itemCount: 1 })).not.toContain('list');
    expect(shapesThatFit({ itemCount: 2 })).toContain('list');
  });

  it('offers a receipt only when there is something to cite', () => {
    expect(shapesThatFit({ hasSource: false })).not.toContain('receipt');
    expect(shapesThatFit({ hasSource: true })).toContain('receipt');
  });

  it('offers a turn only when the piece has two halves', () => {
    expect(shapesThatFit({ hasTurn: true })).toContain('setup_turn');
    expect(shapesThatFit({})).not.toContain('setup_turn');
  });
});

describe('choosing a shape', () => {
  it('does not repeat while an unused shape fits', () => {
    const five = series(CAPTION_SHAPES.length, rich);
    expect(new Set(five).size).toBe(CAPTION_SHAPES.length);
  });

  it('cycles rather than sticking once every shape has been used', () => {
    const ten = series(10, rich);
    /* The oldest comes back round; what must not happen is the same one twice. */
    expect(ten[0]).not.toBe(ten[1]);
    expect(ten[8]).not.toBe(ten[9]);
  });

  it('never chooses a shape the piece cannot fill', () => {
    const plain = series(6, {});
    expect(new Set(plain)).toEqual(new Set(['single']));
  });

  it('is a pure function of its inputs', () => {
    const recent = ['single', 'list'];
    expect(chooseCaptionShape({ fit: rich, recent }).shape).toBe(
      chooseCaptionShape({ fit: rich, recent }).shape,
    );
  });

  it('says why, in words an operator can disagree with', () => {
    expect(chooseCaptionShape({ fit: rich, recent: [] }).reason).toMatch(/nothing has been written/);
    const used = chooseCaptionShape({ fit: rich, recent: [...CAPTION_SHAPES] });
    expect(used.reason).toMatch(/every shape .* has been used recently/);
  });

  it('briefs form and never content', () => {
    /*
     * The shape is a move, not a template. Which words fill it is exactly the
     * open-ended work a model should be doing, so nothing here writes any.
     */
    for (const shape of CAPTION_SHAPES) {
      const brief = SHAPE_BRIEF[shape];
      expect(brief.length).toBeGreaterThan(40);
      expect(brief).not.toMatch(/recipe|gluten|RecipeFix/i);
    }
  });

  it('offers every shape somewhere, so none is dead', () => {
    /*
     * A treatment nothing can pick is dead code — `videoTemplateCoverage`'s
     * lesson, and `VARIETY_BY_POST_TYPE.md` §5 makes it a condition of done.
     */
    expect(new Set(shapesThatFit(rich))).toEqual(new Set(CAPTION_SHAPES));
  });
});
