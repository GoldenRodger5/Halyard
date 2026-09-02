import { describe, expect, it } from 'vitest';
import { carouselSlide, type CarouselSlideProps } from './templates.js';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const base = (over: Partial<CarouselSlideProps> = {}): CarouselSlideProps =>
  ({
    brand: {
      primary: '#C4714A',
      background: '#FAF8F3',
      ink: '#2A2320',
      muted: '#7A6E66',
      accent: '#5C7A5E',
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    aspectRatio: '4:5',
    index: 1,
    total: 7,
    kicker: 'Tips',
    headline: 'Make onions and potatoes last',
    bodyLines: [],
    ...over,
  }) as CarouselSlideProps;

/** Every `src` anywhere in the tree, so a picture cannot hide behind nesting. */
function imageSources(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== 'object') return found;
  const el = node as { type?: string; props?: { src?: string; children?: unknown } };
  if (el.type === 'img' && el.props?.src) found.push(el.props.src);
  const children = el.props?.children;
  if (Array.isArray(children)) children.forEach((c) => imageSources(c, found));
  else if (children) imageSources(children, found);
  return found;
}

describe('§511 a slide draws the picture it was given', () => {
  it('a statement slide carrying an image still shows it', () => {
    const el = carouselSlide(base({ layout: 'statement', imageDataUri: PIXEL }));
    expect(imageSources(el)).toContain(PIXEL);
  });

  it('every layout that ignores images is upgraded rather than silently dropping one', () => {
    for (const layout of ['editorial', 'statement', 'numbered', 'split_rule', 'lead_emphasis'] as const) {
      const el = carouselSlide(base({ layout, imageDataUri: PIXEL }));
      expect(imageSources(el), `${layout} dropped the picture`).toContain(PIXEL);
    }
  });

  it('a slide with no image keeps the composition it asked for', () => {
    const el = carouselSlide(base({ layout: 'statement' }));
    expect(imageSources(el)).toEqual([]);
  });

  it('a screenshot still wins, because the picture is the point on that slide', () => {
    const el = carouselSlide(
      base({ layout: 'statement', imageDataUri: PIXEL, screenshotDataUri: PIXEL }),
    );
    /* Editorial with the screenshot in `extra`; the hero is not drawn twice. */
    expect(imageSources(el).filter((s) => s === PIXEL).length).toBe(1);
  });
});

describe('§509 the number a reader counts', () => {
  it('a numbered slide shows its own ordinal, not its position in the deck', () => {
    const el = carouselSlide(base({ layout: 'numbered', index: 2, ordinal: 1 }));
    const flat = JSON.stringify(el);
    expect(flat).toContain('01');
    expect(flat).not.toContain('"02"');
  });

  it('falls back to the slide index when the builder set no ordinal', () => {
    const el = carouselSlide(base({ layout: 'numbered', index: 3 }));
    expect(JSON.stringify(el)).toContain('03');
  });
});
