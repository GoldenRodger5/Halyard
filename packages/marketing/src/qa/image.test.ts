/**
 * The still QA must FAIL on the defects it exists for, measured on real
 * rendered PNGs (gotcha 14 in RecipeFix's handbook: mutate the subject and
 * confirm the check fails). Needs the `tesseract` binary; without it the
 * suite is reported as skipped, never as passed.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { box, renderElement, text } from '@halyard/render';
import { qaStill, tokens } from './image.js';

const hasTesseract = (() => {
  try {
    execFileSync('tesseract', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const W = 1080;
const H = 1350;
const SAFE = { x0: 60, y0: 48, x1: W - 60, y1: H - 32 };

async function card(lines: Array<{ text: string; top: number; left?: number }>): Promise<Buffer> {
  const el = box(
    { width: W, height: H, position: 'relative', backgroundColor: '#F5EDE4' },
    ...lines.map((l) =>
      box({ position: 'absolute', top: l.top, left: l.left ?? 72 }, text(l.text, { fontFamily: 'Inter', fontWeight: 600, fontSize: 56, color: '#27221E' })),
    ),
  );
  return (await renderElement(el, { aspectRatio: '4:5', size: { width: W, height: H } })).png;
}

const qa = (png: Buffer, intended: string[]) => qaStill({ png, intended, safeBox: SAFE, canvas: { width: W, height: H }, minWordHeight: 24, label: 't' });

describe.skipIf(!hasTesseract)('still QA on rendered files', () => {
  it('passes a card that says what was intended, inside the safe zone', async () => {
    const r = await qa(await card([{ text: 'Two batches, same time each.', top: 400 }]), ['Two batches, same time each.']);
    expect(r.checks.filter((c) => !c.passed).map((c) => c.id)).toEqual([]);
  });

  it('fails read-back when the file says something else (truncation, wrong string)', async () => {
    const r = await qa(await card([{ text: 'Two batches,', top: 400 }]), ['Two batches, same time each.']);
    expect(r.checks.find((c) => c.id === 'still.text_readback')!.passed).toBe(false);
  });

  it('fails on a serialisation artefact drawn into the image', async () => {
    const r = await qa(await card([{ text: 'No gluten-free)? [object Object]', top: 400 }]), ['No gluten-free)?']);
    expect(r.checks.find((c) => c.id === 'still.no_artefacts')!.passed).toBe(false);
  });

  it('fails when the intended text lands outside the safe zone', async () => {
    const r = await qa(await card([{ text: 'Edge words here', top: 1300, left: 20 }]), ['Edge words here']);
    expect(r.checks.find((c) => c.id === 'still.safe_zone')!.passed).toBe(false);
  });

  it('fails when two intended lines overprint each other', async () => {
    // A partial collision like the real slide-5 defect: descenders of one line into the next.
    const r = await qa(await card([{ text: 'Simmer gently, then', top: 400 }, { text: 'As written here', top: 425, left: 300 }]), ['Simmer gently, then', 'As written here']);
    const failed = r.checks.filter((c) => !c.passed).map((c) => c.id);
    expect(r.passed).toBe(false);
    expect(failed.some((id) => id === 'still.text_overlap' || id === 'still.text_readback')).toBe(true);
  });

  it('a sweep over nothing intended is not a pass', async () => {
    const r = await qa(await card([{ text: 'Anything', top: 400 }]), []);
    expect(r.checks.find((c) => c.id === 'still.text_readback')!.passed).toBe(false);
  });
});

describe('read-back tokens', () => {
  it('treats vulgar fractions and their OCR misreading as one class, and splits glued digits', () => {
    expect(tokens('1½ lb')).toEqual(tokens('1% lb'));
    expect(tokens('1cup')).toEqual(['1', 'cup']);
  });
});
