/**
 * §413. Only a piece about the product is expected to show the product.
 *
 * `creative.unused_product_footage` is an error, and an errored gate sets
 * `content_items.status = 'failed'`. It fired on every format.
 *
 * Live: a `history` piece on why bread goes stale — hook, mechanism, payoff,
 * cited to Wikipedia, four distinct photographs — was failed for showing no
 * RecipeFix footage. Showing the app in an explainer about starch
 * retrogradation would have been the defect, not the fix, so the gate was
 * failing the piece for declining to commit it.
 *
 * The same line §291 draws for claim verification and §405 for the caption
 * prompt: a format whose factuality is not `product` is not about the artifact.
 */
import { describe, expect, it } from 'vitest';
import { runCreativeQC, type CreativeQCInput } from './creativeQC.js';

function input(over: Partial<CreativeQCInput> = {}): CreativeQCInput {
  return {
    creativeType: 'before_after',
    platform: 'tiktok',
    footageAvailable: true,
    beats: [
      { role: 'hook', emphasis: 'quick', hasMedia: false, wordCount: 6 },
      { role: 'setup', emphasis: 'normal', hasMedia: false, wordCount: 12 },
      { role: 'payoff', emphasis: 'hold', hasMedia: false, wordCount: 10 },
    ],
    ...over,
  } as CreativeQCInput;
}

const rules = (r: ReturnType<typeof runCreativeQC>) => r.findings.map((f) => f.rule);

describe('unused product footage', () => {
  it('fails a product-grounded piece that ignores an available capture', () => {
    const result = runCreativeQC(input({ aboutTheProduct: true }));
    expect(rules(result)).toContain('creative.unused_product_footage');
  });

  it('says nothing to a piece that is not about the product', () => {
    const result = runCreativeQC(input({ aboutTheProduct: false }));
    expect(rules(result)).not.toContain('creative.unused_product_footage');
  });

  it('keeps the old behaviour when the caller does not say', () => {
    /*
     * A caller that cannot tell must not silently switch an error-severity rule
     * off — that is how a gate stops gating without anybody noticing.
     */
    const result = runCreativeQC(input());
    expect(rules(result)).toContain('creative.unused_product_footage');
  });

  it('says nothing when there was no capture to use', () => {
    const result = runCreativeQC(input({ footageAvailable: false, aboutTheProduct: true }));
    expect(rules(result)).not.toContain('creative.unused_product_footage');
  });

  it('no longer calls a photographed beat a text card', () => {
    /* Every beat carries its own photograph since §407. */
    const finding = runCreativeQC(input({ aboutTheProduct: true })).findings.find(
      (f) => f.rule === 'creative.unused_product_footage',
    );
    expect(finding!.message).not.toMatch(/text card/);
  });
});
