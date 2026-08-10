/**
 * Render the PWA icons from the SVG mark.
 *
 *   pnpm exec tsx scripts/make-icons.ts
 *
 * Generated rather than committed as binaries, so changing the mark is a
 * one-line edit to icon.svg rather than a trip through a design tool.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const PUBLIC = path.resolve(process.cwd(), 'apps/web/public');
const svg = readFileSync(path.join(PUBLIC, 'icon.svg'), 'utf8');

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  // Maskable icons are cropped to a circle on Android, so the mark needs
  // padding inside a full-bleed background or the corners get shaved off.
  ['icon-maskable.png', 512],
] as const) {
  const source =
    name === 'icon-maskable.png'
      ? svg
          .replace('rx="112"', 'rx="0"')
          .replace('viewBox="0 0 512 512"', 'viewBox="-64 -64 640 640"')
      : svg;

  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(path.join(PUBLIC, name), png);
  console.log(`✓ ${name} ${size}×${size}`);
}
