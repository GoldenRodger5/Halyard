/**
 * §534. Every YouTube thumbnail went out as text on a cream card.
 *
 * `youtubeThumbnail` has always accepted a picture — and read it from
 * `screenshotDataUri`, which the render handler sets for nobody. The handler
 * turns `imageAssetId` into `imageDataUri`, the name every other template uses,
 * and the generate handler queued the thumbnail with `overlayText`,
 * `fontSizePx` and `alt_text` and nothing else.
 *
 * So the composition worked, the gate passed it, and the artefact was the
 * weakest thing YouTube will show you: dark type on cream with half the frame
 * empty, at 210px wide in a feed. Nothing was broken. Nothing supplied the
 * input — the fifth time this session, after §478, §499, §508 and §522.
 */
import { describe, expect, it } from 'vitest';

import { youtubeThumbnail } from './templates.js';
import { resolveBrand } from '../brand.js';

const brand = resolveBrand({ heading_font: 'Instrument Serif', body_font: 'Inter' });
const base = { brand, aspectRatio: '16:9', overlayText: 'WHY YOUR STEAK STEAMS', fontSizePx: 120 };

/** Does the rendered tree contain an <img> anywhere? */
function hasImage(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const el = node as { type?: string; props?: { children?: unknown } };
  if (el.type === 'img') return true;
  const kids = el.props?.children;
  if (Array.isArray(kids)) return kids.some(hasImage);
  return hasImage(kids);
}

describe('§534 the thumbnail takes the picture the piece already has', () => {
  it('draws the image when given imageDataUri, which is what the handler produces', () => {
    const tree = youtubeThumbnail({ ...base, imageDataUri: 'data:image/png;base64,AAAA' });
    expect(hasImage(tree), 'imageDataUri was ignored, so every thumbnail is flat').toBe(true);
  });

  it('still honours screenshotDataUri, so nothing that worked stops working', () => {
    const tree = youtubeThumbnail({ ...base, screenshotDataUri: 'data:image/png;base64,AAAA' });
    expect(hasImage(tree)).toBe(true);
  });

  it('renders without a picture rather than failing, since one is not guaranteed', () => {
    const tree = youtubeThumbnail(base);
    expect(hasImage(tree)).toBe(false);
    expect(tree).toBeTruthy();
  });
});

describe('§534 the generate handler supplies one', () => {
  it('passes the hero image when the piece has one', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.resolve(__dirname, '../../../../apps/worker/src/handlers/generate.ts'),
      'utf8',
    );
    /* Queued beside overlayText, from the hero the piece already generated. */
    expect(source).toMatch(/overlayText: line\.text/);
    expect(source).toMatch(/\.\.\.\(hero \? \{ imageAssetId: hero\.assetId \} : \{\}\)/);
  });
});
