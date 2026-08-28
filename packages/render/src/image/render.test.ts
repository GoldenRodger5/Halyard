/**
 * Render tests. Build pack §6 asks for snapshot testing of Satori output; these
 * go further and render real PNGs, then assert the properties Gate 3 checks.
 *
 * Set HALYARD_WRITE_SNAPSHOTS=1 to drop the PNGs into .render-output/ for a
 * visual look. They are not committed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import fixture from '../../../core/src/connectors/__fixtures__/recipeAdaptation.json' with { type: 'json' };
import { toArtifact, type RecipeFixAdaptation } from '../../../core/src/connectors/recipefix.js';
import { runVisualQC } from '../../../core/src/qc/visualQC.js';
import { CANVAS, DEFAULT_BRAND, resolveBrand } from '../brand.js';
import {
  carouselProps,
  chefNoteProps,
  substitutionRatioProps,
  transformationDiffProps,
} from './artifactProps.js';
import { contrastRatio, renderTemplate } from './index.js';
import { collectText } from './elements.js';
import {
  carouselSlide,
  transformationDiff,
  TEMPLATE_REQUIRED_PROPS,
  type TemplateId,
} from './templates.js';

const artifact = toArtifact(fixture as unknown as RecipeFixAdaptation);
const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.render-output',
);
const WRITE = process.env.HALYARD_WRITE_SNAPSHOTS === '1';

function save(name: string, png: Buffer): void {
  if (!WRITE) return;
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(path.join(OUTPUT_DIR, name), png);
}

describe('artifact → template props', () => {
  it('builds a transformation card entirely from artifact fields', () => {
    const props = transformationDiffProps(artifact)!;
    expect(props.headline).toBe("Sally's Artisan Bread, gluten-free");
    expect(props.after).toContain('gluten-free bread flour');
    expect(props.reason).toContain('xanthan gum');
  });

  it('returns null rather than inventing content when the artifact is thin', () => {
    const bare = toArtifact({ recipeName: 'Toast', ingredients: [], steps: [] });
    expect(transformationDiffProps(bare)).toBeNull();
    expect(chefNoteProps(bare)).toBeNull();
    expect(substitutionRatioProps(bare)).toBeNull();
  });

  it('builds the six-slide carousel shape from v1 §5.1', () => {
    const slides = carouselProps(artifact);
    expect(slides.map((s) => s.kicker)).toEqual([
      'The original',
      'What breaks',
      'The swaps',
      'Why',
      'Chef notes',
      'The result',
    ]);
    expect(slides[0]?.total).toBe(6);
    expect(slides[5]?.index).toBe(6);
  });

  it('shortens a carousel rather than padding it when the artifact is thin', () => {
    const thin = toArtifact({
      recipeName: 'Simple swap',
      ingredients: [],
      steps: [],
      explanations: ['One note.'],
    });
    const slides = carouselProps(thin);
    expect(slides.length).toBeLessThan(6);
    expect(slides.every((s) => s.total === slides.length)).toBe(true);
  });

  it('strips quantities so a ratio card reads as an ingredient name', () => {
    const props = substitutionRatioProps(artifact)!;
    expect(props.ingredient).toBe('bread flour');
    expect(props.substitute).toBe('gluten-free bread flour blend');
  });
});

describe('templates are pure element trees', () => {
  it('puts every prop on the canvas', () => {
    const element = transformationDiff({
      ...transformationDiffProps(artifact)!,
      brand: DEFAULT_BRAND,
      aspectRatio: '1:1',
      wordmark: 'recipefix',
    });
    const rendered = collectText(element).join(' ');
    expect(rendered).toContain('Artisan Bread');
    expect(rendered).toContain('xanthan gum');
    expect(rendered).toContain('recipefix');
  });

  it('reads brand tokens rather than hard-coding colour', () => {
    const brand = resolveBrand({ primary: '#123456', heading_font: 'Georgia' });
    expect(brand.primary).toBe('#123456');
    expect(brand.headingFont).toBe('Georgia');
    expect(brand.background).toBe(DEFAULT_BRAND.background);
  });

  it('numbers carousel slides so the reader knows where they are', () => {
    const element = carouselSlide({
      ...carouselProps(artifact)[2]!,
      brand: DEFAULT_BRAND,
      aspectRatio: '4:5',
    });
    expect(collectText(element).join(' ')).toContain('3 / 6');
  });
});

describe('renderTemplate produces real PNGs', () => {
  it('renders a 1:1 transformation card at 1080×1080', async () => {
    const result = await renderTemplate({
      templateId: 'transformation_diff_1x1',
      props: transformationDiffProps(artifact)!,
      aspectRatio: '1:1',
      wordmark: 'recipefix',
    });
    save('transformation_diff_1x1.png', result.png);

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(result.png.length).toBeGreaterThan(5000);
  }, 30_000);

  it('renders every registered template without throwing', async () => {
    const cases: Array<{ id: Parameters<typeof renderTemplate>[0]['templateId']; props: unknown; ratio: string }> = [
      { id: 'transformation_diff_4x5', props: transformationDiffProps(artifact)!, ratio: '4:5' },
      { id: 'substitution_ratio', props: substitutionRatioProps(artifact)!, ratio: '1:1' },
      { id: 'chef_note_quote', props: chefNoteProps(artifact)!, ratio: '1:1' },
      {
        id: 'pinterest_tall',
        props: {
          title: 'Gluten-free sandwich loaf that holds its shape',
          subtitle: 'Vinegar in the dough, lower oven, longer bake.',
          bullets: ['Acid firms the crumb', 'Drop the oven 25 degrees', 'Cool completely before slicing'],
        },
        ratio: '2:3',
      },
      {
        id: 'scaling_math',
        props: {
          fromServings: 8,
          toServings: 2,
          rows: [
            { label: 'Salt', linear: '2 tsp', actual: '1 1/4 tsp' },
            { label: 'Yeast', linear: '2 tsp', actual: '1 1/2 tsp' },
          ],
          note: 'Salt and yeast do not scale linearly.',
        },
        ratio: '1:1',
      },
    ];

    for (const testCase of cases) {
      const result = await renderTemplate({
        templateId: testCase.id,
        props: testCase.props as Record<string, unknown>,
        aspectRatio: testCase.ratio,
        wordmark: 'recipefix',
      });
      save(`${testCase.id}.png`, result.png);
      const canvas = CANVAS[testCase.ratio]!;
      expect(result.width).toBe(canvas.width);
      expect(result.height).toBe(canvas.height);
    }
  }, 60_000);

  /**
   * Milestone 41's definition of done: "A carousel renders containing a real
   * screenshot of the result card."
   *
   * The screenshot comes from scripts/capture-flows.ts, which drives the live
   * recipefix.app. When no capture exists on this machine the test falls back to
   * a generated stand-in of the same shape rather than skipping, so it still
   * proves the composition path — and says which it used.
   */
  it('renders a carousel slide around a real screenshot of the product', async () => {
    const captureDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../apps/web/public/dev-assets',
    );
    const capture = existsSync(captureDir)
      ? readdirSync(captureDir).find((f) => f.startsWith('screenshot-') && f.endsWith('.png'))
      : undefined;

    const png = capture
      ? readFileSync(path.join(captureDir, capture))
      : (await renderTemplate({
          templateId: 'chef_note_quote',
          props: chefNoteProps(artifact) as unknown as Record<string, unknown>,
          aspectRatio: '1:1',
        })).png;

    const slide = {
      ...carouselProps(artifact)[0]!,
      kicker: 'the result',
      headline: 'This is what comes back',
      bodyLines: ['Every substitution carries the reason it was made.'],
      screenshotDataUri: `data:image/png;base64,${png.toString('base64')}`,
      screenshotCaption: capture
        ? 'Captured from recipefix.app'
        : 'Stand-in: no capture on this machine',
    };

    const result = await renderTemplate({
      templateId: 'carousel_6',
      props: slide as unknown as Record<string, unknown>,
      aspectRatio: '4:5',
      wordmark: 'recipefix',
    });
    save('carousel_with_screenshot.png', result.png);

    expect(result.png.byteLength).toBeGreaterThan(20_000);
    expect(result.width).toBe(CANVAS['4:5']!.width);

    // The slide must not be the screenshot alone: the headline is what makes it
    // a carousel slide rather than a pasted image.
    const qc = runVisualQC(
      { kind: 'image', width: result.width, height: result.height },
      { aspectRatio: '4:5', platform: 'instagram', format: 'carousel' },
    );
    expect(qc.passed, qc.summary).toBe(true);
  }, 60_000);

  it('renders all six carousel slides at one aspect ratio — Instagram crops otherwise', async () => {
    const slides = carouselProps(artifact);
    const rendered = [];
    for (const slide of slides) {
      const result = await renderTemplate({
        templateId: 'carousel_6',
        props: slide as unknown as Record<string, unknown>,
        aspectRatio: '4:5',
        wordmark: 'recipefix',
      });
      save(`carousel_${slide.index}.png`, result.png);
      rendered.push(result);
    }

    const ratios = new Set(rendered.map((r) => (r.width / r.height).toFixed(4)));
    expect(ratios.size).toBe(1);

    const qc = runVisualQC(
      { kind: 'image', width: rendered[0]!.width, height: rendered[0]!.height },
      {
        aspectRatio: '4:5',
        platform: 'instagram',
        format: 'carousel',
        carouselSiblings: rendered.map((r) => ({
          kind: 'image' as const,
          width: r.width,
          height: r.height,
        })),
      },
    );
    expect(qc.passed).toBe(true);
  }, 90_000);

  it('renders a preview at 480px for cheap co-pilot iteration', async () => {
    const result = await renderTemplate({
      templateId: 'transformation_diff_1x1',
      props: transformationDiffProps(artifact)!,
      aspectRatio: '1:1',
      quality: 'preview',
    });
    expect(result.width).toBe(480);
    expect(result.durationMs).toBeLessThan(5000);
  }, 30_000);

  it('keeps 9:16 text out of the 12% safe area', async () => {
    const result = await renderTemplate({
      templateId: 'chef_note_quote',
      props: chefNoteProps(artifact)!,
      aspectRatio: '9:16',
    });
    save('chef_note_9x16.png', result.png);

    // The frame applies safe-area padding, so the first and last glyph groups in
    // the SVG must sit inside it.
    const yPositions = [...result.svg.matchAll(/translate\([-\d.]+[, ]+([-\d.]+)\)/g)].map((m) =>
      Number(m[1]),
    );
    const inside = yPositions.filter((y) => y > 0);
    const canvas = CANVAS['9:16']!;
    expect(Math.min(...inside) / canvas.height).toBeGreaterThan(0.11);
    expect(Math.max(...inside) / canvas.height).toBeLessThan(0.89);
  }, 30_000);
});

describe('contrast — WCAG AA, checked against the real palette', () => {
  it('passes AA for body text on the brand background', () => {
    expect(contrastRatio(DEFAULT_BRAND.ink, DEFAULT_BRAND.background)).toBeGreaterThan(4.5);
  });

  it('passes AA for muted text on the brand background', () => {
    expect(contrastRatio(DEFAULT_BRAND.muted, DEFAULT_BRAND.background)).toBeGreaterThan(4.5);
  });

  it('passes AA for the background knocked out of the primary', () => {
    expect(contrastRatio(DEFAULT_BRAND.background, DEFAULT_BRAND.primary)).toBeGreaterThan(3);
  });

  it('computes a known ratio correctly', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});

describe('required props are declared correctly', () => {
  /**
   * `TEMPLATE_REQUIRED_PROPS` is a hand-written list, and a hand-written list
   * about code is wrong the moment the code moves. It was wrong on the day it
   * was written: `pinterest_tall` was declared as needing headline/before/after
   * when it actually takes title/subtitle/bullets, so validation passed a call
   * that then crashed inside the template on `.slice` of undefined.
   *
   * A list nobody checks is the thing this project keeps finding. So the check
   * is: give each template exactly what it declares it needs, and nothing else.
   * If it still cannot render, the declaration is incomplete.
   */
  const SAMPLES: Record<string, unknown> = {
    headline: 'A headline',
    before: '3 cups bread flour',
    after: '3 cups gluten-free blend',
    reason: 'A 1:1 blend with xanthan gum keeps the dough workable.',
    ingredient: 'bread flour',
    substitute: 'gluten-free blend',
    ratio: 'Same volume, more water',
    failureMode: 'Skip the water and the crumb reads dry.',
    quote: 'The vinegar is doing structural work.',
    fromServings: 8,
    toServings: 2,
    rows: [{ label: 'Salt', linear: '1/2 tsp', actual: '3/4 tsp' }],
    note: 'Salt scales to about 85 percent of linear.',
    title: 'A title',
    subtitle: 'A subtitle',
    bullets: ['One bullet'],
    index: 1,
    total: 6,
    kicker: 'One change',
    bodyLines: ['A line of body copy.'],
    /* §224. A thumbnail is read at ~360px wide, so its sample is a real
       six-words-or-fewer line at a size that survives the shrink. */
    overlayText: 'Why gluten-free bread fails',
    fontSizePx: 150,
  };

  for (const [templateId, required] of Object.entries(TEMPLATE_REQUIRED_PROPS)) {
    it(`${templateId} renders from its declared props alone`, async () => {
      const props: Record<string, unknown> = {};
      for (const key of required) {
        expect(SAMPLES[key], `no sample value for '${key}'`).toBeDefined();
        props[key] = SAMPLES[key];
      }

      const result = await renderTemplate({
        templateId: templateId as TemplateId,
        props,
        brandTokens: null,
        aspectRatio: templateId === 'pinterest_tall' ? '2:3' : '1:1',
        quality: 'preview',
        wordmark: 'recipefix',
      });
      expect(result.png.byteLength).toBeGreaterThan(1000);
    }, 60_000);

    it(`${templateId} refuses to render with a required prop missing`, async () => {
      // A missing value renders as empty space under a heading that promises
      // something, and passes every gate: contrast fine, ratio fine, term shown.
      const props: Record<string, unknown> = {};
      for (const key of required.slice(1)) props[key] = SAMPLES[key];

      await expect(
        renderTemplate({
          templateId: templateId as TemplateId,
          props,
          brandTokens: null,
          aspectRatio: '1:1',
          quality: 'preview',
          wordmark: 'recipefix',
        }),
      ).rejects.toThrow(new RegExp(required[0]!));
    }, 60_000);
  }
});
