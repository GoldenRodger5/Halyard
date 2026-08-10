/**
 * Render tests. Build pack §6 asks for snapshot testing of Satori output; these
 * go further and render real PNGs, then assert the properties Gate 3 checks.
 *
 * Set HALYARD_WRITE_SNAPSHOTS=1 to drop the PNGs into .render-output/ for a
 * visual look. They are not committed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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
import { carouselSlide, transformationDiff } from './templates.js';

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
