/**
 * §549. Both ziti captions are real, and both are in the queue.
 *
 * `alreadySaid` hands the writer sixty days of claims and opening lines as a
 * brief. The writer honoured it by paraphrasing — "Dairy-free ziti browns
 * fast:" became "Dairy-free ziti can brown fast." — and nothing compared the
 * finished bodies, so the account queued the same post twice.
 */
import { describe, expect, it } from 'vitest';

import {
  captionSimilarity,
  findRepeatedPost,
  repeatsAPost,
  DUPLICATE_FLOOR,
} from './nearDuplicate.js';

/** Verbatim from `content_items`. */
const ZITI_A =
  'Dairy-free ziti browns fast: meltable mozzarella gives a gooey top. But check at 16 minutes because it can darken unevenly.';
const ZITI_B =
  'Dairy-free ziti can brown fast. So check at 16 minutes: meltable cheeses keep the top gooey, but stretch is less elastic.';

/** The closest *legitimate* pair in the same corpus, at 0.26. */
const PASTRY =
  'Tough dairy-free pastry. The fat can be right while water and handling build gluten.';
const CAKE =
  'Dry cake needs butter. Oil stays fluid after cooling, so tenderness lasts without dairy solids.';

describe('§549 the same post, written twice', () => {
  it('catches the pair that shipped', () => {
    const finding = findRepeatedPost(ZITI_B, [ZITI_A, PASTRY, CAKE]);
    expect(repeatsAPost(finding), finding.because).toBe(true);
    expect(finding.match).toBe(ZITI_A);
    expect(finding.shared).toEqual(expect.arrayContaining(['ziti', 'minute']));
  });

  it('leaves two pieces on a related subject alone', () => {
    /*
     * Both are about dairy-free baking and *should* share words. A threshold
     * that refused them would refuse the account's whole subject.
     */
    expect(repeatsAPost(findRepeatedPost(CAKE, [PASTRY]))).toBe(false);
  });

  it('sits in the gap the corpus actually has', () => {
    /* Measured: the duplicate 0.45, the next legitimate pair 0.26. */
    expect(captionSimilarity(ZITI_A, ZITI_B)).toBeGreaterThan(DUPLICATE_FLOOR);
    expect(captionSimilarity(PASTRY, CAKE)).toBeLessThan(DUPLICATE_FLOOR);
  });

  it('is not fooled by a shared connective, which §544 found everywhere', () => {
    const a = 'Wet steak stalls. So the fridge step is doing pan work.';
    const b = 'Slimy cilantro is trapped moisture. So the fix is humidity without sealing.';
    expect(repeatsAPost(findRepeatedPost(a, [b]))).toBe(false);
  });

  it('says so plainly when nothing matches', () => {
    const finding = findRepeatedPost('An entirely unrelated sentence about film scores.', [PASTRY]);
    expect(repeatsAPost(finding)).toBe(false);
    expect(finding.because).toContain('Nothing in the recent queue');
  });

  it('reports the worst match, not an arbitrary one', () => {
    const finding = findRepeatedPost(ZITI_B, [PASTRY, ZITI_A, CAKE]);
    expect(finding.match).toBe(ZITI_A);
  });

  it('does not judge a caption too short to measure', () => {
    expect(captionSimilarity('Two words.', 'Two words.')).toBe(0);
  });
});
