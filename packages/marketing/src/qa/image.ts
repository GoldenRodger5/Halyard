/**
 * QA on the exported still — the file, not the prompt (QUALITY_AND_OPERATIONS §3).
 *
 * Text read-back: tesseract OCR of the PNG, every intended line fuzzy-matched
 * to what was actually drawn. Catches truncation, clipping, `[object Object]`
 * and the wrong string — the class of defect Halyard's visual gate let through
 * (`recipefix/x/2026-08-22-gluten-free-apple-pie-260769d6`).
 *
 * Safe zone and size use the word boxes OCR found for the intended words, so a
 * box is where the text really landed, not where the template meant it to.
 * Contrast is measured from rendered pixels behind the text.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { GateCheck } from '../copyGate.js';

export interface OcrWord {
  text: string;
  conf: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ocrWords(png: Buffer, extraArgs: string[] = [], psm = '11'): OcrWord[] {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mk-ocr-'));
  const file = path.join(dir, 'in.png');
  writeFileSync(file, png);
  const tsv = execFileSync('tesseract', [file, 'stdout', '--psm', psm, ...extraArgs, 'tsv'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return tsv
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t'))
    .filter((c) => c.length >= 12 && c[11]!.trim() !== '' && Number(c[10]) >= 0)
    .map((c) => ({ text: c[11]!.trim(), conf: Number(c[10]), x: Number(c[6]), y: Number(c[7]), w: Number(c[8]), h: Number(c[9]) }));
}

/**
 * A copy of the image with long thin horizontal rules painted out: a
 * strike-through crosses every glyph at mid x-height and OCR reads nothing.
 * A run of ≥ 70 dark pixels, under ~10 rows thick, is a rule, not a glyph
 * (Inter has no glyph that wide at these sizes). Used ONLY to read struck
 * lines back; every other check runs on the real file.
 */
export async function withoutRules(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return luminance(data[i]!, data[i + 1]!, data[i + 2]!) < 0.3;
  };
  const out = Buffer.from(data);
  const OFF = 6; // beyond a 4px strike, so the rows we compare against are outside it
  for (let y = OFF; y < height - OFF; y++) {
    let x = 0;
    while (x < width) {
      if (!dark(x, y)) { x++; continue; }
      let end = x;
      while (end < width && dark(end, y)) end++;
      if (end - x >= 70) {
        // thin: across most of the run, the pixels 3 rows above AND below are not both dark
        let thick = 0;
        for (let xx = x; xx < end; xx++) if (dark(xx, y - OFF) && dark(xx, y + OFF)) thick++;
        if (thick / (end - x) < 0.6) {
          for (let xx = x; xx < end; xx++) {
            const src = ((y - OFF) * width + xx) * channels;
            const dst = (y * width + xx) * channels;
            for (let c = 0; c < channels; c++) out[dst + c] = data[src + c]!;
          }
        }
      }
      x = end;
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

/** Pure-white glyphs as black on white: reads white type on terracotta or on a photo scrim. */
export async function whiteTextMask(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height);
  for (let p = 0, i = 0; p < out.length; p++, i += info.channels) {
    out[p] = data[i]! >= 236 && data[i + 1]! >= 236 && data[i + 2]! >= 236 ? 0 : 255;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
}

/** Dark ink only (luminance < 100 → black, everything else white): lifts dark type off a busy colour ground. */
export async function darkTextMask(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height);
  for (let p = 0, i = 0; p < out.length; p++, i += info.channels) {
    out[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]! < 100 ? 0 : 255;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
}

/**
 * Apple Vision text recognition (tools/vision-ocr, built from vision-ocr.swift with swiftc).
 * Tesseract cannot read dark type hugged by thick card borders (the quiz template); Vision can.
 * Returns [] when the tool is not built, so Tesseract remains the floor.
 */
const VISION_BIN = new URL('../../tools/vision-ocr', import.meta.url).pathname;
export function visionWords(png: Buffer): OcrWord[] {
  if (!existsSync(VISION_BIN)) {
    try {
      execFileSync('swiftc', ['-O', `${VISION_BIN}.swift`, '-o', VISION_BIN], { stdio: 'ignore' });
    } catch {
      return [];
    }
  }
  const dir = new URL('../../../../runs/_cache/ocr/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const file = `${dir}${process.pid}-${Date.now()}.png`;
  writeFileSync(file, png);
  try {
    const out = JSON.parse(execFileSync(VISION_BIN, [file], { encoding: 'utf8' })) as Array<{ text: string; conf: number; x: number; y: number; w: number; h: number }>;
    return out.map((w) => ({ text: w.text, conf: w.conf, x: w.x, y: w.y, w: w.w, h: w.h }) as OcrWord);
  } finally {
    rmSync(file, { force: true });
  }
}

/** OCR passes merged: the file as is, inverted (light text on colour), and rules removed. */
export async function ocrAllPasses(png: Buffer): Promise<{ words: OcrWord[]; passes: string[] }> {
  const inverted = await sharp(png).removeAlpha().negate().greyscale().png().toBuffer();
  const ruled = await withoutRules(png);
  const whiteText = await whiteTextMask(png);
  const passes: Array<[string, OcrWord[]]> = [
    ['vision', visionWords(png)],
    ['file', ocrWords(png)],
    ['inverted', ocrWords(inverted)],
    ['rules removed', ocrWords(ruled)],
    ['white-text mask', ocrWords(whiteText)],
    ['dark-text mask', ocrWords(await darkTextMask(png))],
  ];
  const merged: OcrWord[] = [];
  for (const [, ws] of passes) {
    for (const w of ws) {
      const dup = merged.some((m) => Math.abs(m.x - w.x) < 12 && Math.abs(m.y - w.y) < 12 && tokens(m.text).join() === tokens(w.text).join());
      if (!dup) merged.push(w);
    }
  }
  return { words: merged, passes: passes.map(([n, ws]) => `${n}: ${ws.length} words`) };
}

export function tokens(s: string): string[] {
  return s
    // OCR reads vulgar-fraction glyphs (½ ¼ ¾) as "%" (or "Y%"): one recorded equivalence class.
    // Before NFKD, which would otherwise decompose ½ into "1⁄2".
    .replace(/[½¼¾⅓⅔]/g, ' frac ')
    .replace(/%/g, ' frac ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9/%]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0);
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

/** One OCR token "is" an intended token if equal, or within 1 edit for words of 5+ letters. */
function sameToken(intended: string, read: string): boolean {
  if (intended === read) return true;
  if (intended.length >= 7) return lev(intended, read) <= 2;
  return intended.length >= 5 && lev(intended, read) <= 1;
}

export interface LineReadBack {
  line: string;
  similarity: number;
  missing: string[];
  boxes: OcrWord[];
}

/**
 * Recall of each intended line's words in the OCR output (multiset, so a word
 * used twice must be read twice). One- and two-character tokens ("a", "of",
 * "/") are excluded: OCR at display sizes drops them inconsistently and they
 * carry no meaning a reader would miss.
 */
export interface IntendedLine {
  text: string;
  /** Read-back bar for this line. 0.95 unless the line is deliberately struck through (0.80, recorded). */
  min?: number;
}

export function readBack(intended: string[], words: OcrWord[]): LineReadBack[] {
  // Low-confidence words are often texture in a photograph read as letters ("V4" in a curry),
  // and sometimes a short real word ("Use" at 29). They count only on an EXACT match within
  // 90px of where the rest of the line was read with confidence.
  const pool = words.flatMap((w) => tokens(w.text).map((t) => ({ t, w, sure: w.conf >= 40 })));
  const wanted = intended.map((line) => tokens(line).filter((t) => t.length >= 3 || /\d/.test(t)));
  // Lines that read back best claim their words first, so a struck line that
  // OCR half-missed cannot borrow "10" from the clean line below it.
  const potential = wanted.map((want) => want.filter((t) => pool.some((p) => p.sure && sameToken(t, p.t))).length / Math.max(1, want.length));
  const order = intended.map((_, i) => i).sort((a, b) => potential[b]! - potential[a]!);
  const used = new Set<number>();
  const results: LineReadBack[] = new Array(intended.length);
  for (const i of order) {
    const missing: string[] = [];
    const boxes: OcrWord[] = [];
    // Where this line sits: the median y of every candidate for its words.
    const candidateYs = wanted[i]!.flatMap((t) => pool.filter((p, k) => p.sure && !used.has(k) && sameToken(t, p.t)).map((p) => p.w.y));
    const anchor = [...candidateYs].sort((a, b) => a - b)[Math.floor(candidateYs.length / 2)] ?? 0;
    for (const t of wanted[i]!) {
      let hit = -1;
      pool.forEach((p, k) => {
        if (used.has(k) || !sameToken(t, p.t)) return;
        if (!p.sure && (p.t !== t || candidateYs.length === 0 || Math.abs(p.w.y - anchor) > 90)) return;
        if (hit < 0 || Math.abs(p.w.y - anchor) < Math.abs(pool[hit]!.w.y - anchor)) hit = k;
      });
      if (hit < 0) missing.push(t);
      else {
        used.add(hit);
        boxes.push(pool[hit]!.w);
      }
    }
    const n = wanted[i]!.length;
    results[i] = { line: intended[i]!, similarity: n === 0 ? 1 : (n - missing.length) / n, missing, boxes };
  }
  return results;
}

function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(l1: number, l2: number): number {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

/**
 * WCAG contrast of a text box from its own pixels: the brightest decile and
 * the darkest decile of the box are the two inks (glyph and ground). Works for
 * light-on-dark and dark-on-light without being told which.
 */
export async function boxContrast(png: Buffer, b: { x: number; y: number; w: number; h: number }): Promise<number> {
  const { data, info } = await sharp(png).extract({ left: b.x, top: b.y, width: Math.max(1, b.w), height: Math.max(1, b.h) }).raw().toBuffer({ resolveWithObject: true });
  const lums: number[] = [];
  for (let i = 0; i < data.length; i += info.channels) lums.push(luminance(data[i]!, data[i + 1]!, data[i + 2]!));
  lums.sort((x, y) => x - y);
  const lo = lums[Math.floor(lums.length * 0.08)]!;
  const hi = lums[Math.floor(lums.length * 0.92)]!;
  return contrast(hi, lo);
}

export interface StillQaInput {
  png: Buffer;
  intended: Array<string | IntendedLine>;
  safeBox: { x0: number; y0: number; x1: number; y1: number };
  canvas: { width: number; height: number };
  /** Minimum OCR word-box height (px) for the smallest permitted type on this canvas. */
  minWordHeight: number;
  label: string;
}

export async function qaStill(input: StillQaInput): Promise<{ passed: boolean; checks: GateCheck[]; readBack: LineReadBack[] }> {
  const checks: GateCheck[] = [];
  const meta = await sharp(input.png).metadata();
  checks.push({
    id: 'still.canvas',
    passed: meta.width === input.canvas.width && meta.height === input.canvas.height,
    detail: `${meta.width}×${meta.height}`,
    problems: meta.width === input.canvas.width && meta.height === input.canvas.height ? [] : [`expected ${input.canvas.width}×${input.canvas.height}`],
  });

  const { words, passes } = await ocrAllPasses(input.png);
  const lines = input.intended.map((l) => (typeof l === 'string' ? { text: l, min: 0.95 } : { text: l.text, min: l.min ?? 0.95 }));
  const rb = readBack(lines.map((l) => l.text), words);
  const low = rb.filter((r, i) => r.similarity < lines[i]!.min);
  // Lines not held to read-back (a lone glyph OCR cannot see reliably) prove nothing about
  // position, size or contrast either: OCR "finds" them in photo texture. Their boxes are dropped,
  // and the reported minimum is over the held lines only, so 0.00 can never read as a pass.
  const held = rb.filter((_, i) => lines[i]!.min > 0);
  rb.forEach((r, i) => {
    if (lines[i]!.min === 0) r.boxes = [];
    // A one-character box inside a longer line ("3" in "plus 3 tbsp water") is the weakest match
    // OCR makes: it was credited from wood grain at x 924 once (2026-10-27). With the line's other
    // words present it proves nothing about position or contrast, so it is dropped from those checks.
    else if (r.boxes.length > 1) {
      const longer = r.boxes.filter((b) => tokens(b.text).join('').length > 1);
      if (longer.length) r.boxes = longer;
    }
  });
  checks.push({
    id: 'still.text_readback',
    passed: low.length === 0 && held.length > 0,
    detail: `${held.length} lines held to read-back, min similarity ${held.length ? Math.min(...held.map((r) => r.similarity)).toFixed(2) : 'n/a'}; ${rb.length - held.length} single-glyph lines checked by eye only (OCR ${passes.join(', ')})`,
    problems: [
      ...(rb.length === 0 ? ['nothing intended to read back: a sweep over nothing is not a pass'] : []),
      ...low.map((r) => `"${r.line}" read back at ${r.similarity.toFixed(2)}; missing: ${r.missing.join(', ')}`),
    ],
  });

  // Serialisation artefacts only: a lone brace is how OCR reads an icon (the app's fork-and-knife), not a bug.
  const artefacts = ocrWords(input.png).filter((w) => /\[?object|undefined|NaN|\{\{|\}\}|\$\{/.test(w.text));
  checks.push({
    id: 'still.no_artefacts',
    passed: artefacts.length === 0,
    detail: 'no [object Object] / undefined / NaN / braces read on the image',
    problems: artefacts.map((w) => `read "${w.text}" at ${w.x},${w.y}`),
  });

  const boxes = rb.flatMap((r) => r.boxes);
  const crossing = boxes.filter(
    (b) => b.x < input.safeBox.x0 || b.y < input.safeBox.y0 || b.x + b.w > input.safeBox.x1 || b.y + b.h > input.safeBox.y1,
  );
  // An OCR box can run ~100 px wider than the ink (large serif type over a striped towel read
  // "Egg whites" from x 71 when the glyphs start at 165). So a crossing box is re-checked: crop
  // the frame to the safe box and read again. A word that still reads whole inside the crop is
  // inside the safe zone; text that really crosses the edge is cut by the crop and still fails.
  let outside = crossing;
  if (crossing.length) {
    const { x0, y0, x1, y1 } = input.safeBox;
    const crop = await sharp(input.png).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
    const inner = (await ocrAllPasses(crop)).words.map((w) => tokens(w.text).join(''));
    outside = crossing.filter((b) => {
      const t = tokens(b.text).join('');
      return t.length < 3 || !inner.some((w) => w === t || (t.length >= 5 && w.includes(t)));
    });
  }
  checks.push({
    id: 'still.safe_zone',
    passed: outside.length === 0 && boxes.length > 0,
    detail: `${boxes.length} word boxes inside x ${input.safeBox.x0}–${input.safeBox.x1}, y ${input.safeBox.y0}–${input.safeBox.y1}`,
    problems: outside.map((b) => `"${b.text}" at x ${b.x}–${b.x + b.w}, y ${b.y}–${b.y + b.h}`),
  });

  // Overlap: a word box of one intended line intersecting a word box of another means the layout
  // collided (an overflowing flex column shrinks its children until they overprint).
  const overlaps: string[] = [];
  for (let a = 0; a < rb.length; a++)
    for (let b = a + 1; b < rb.length; b++)
      for (const p of rb[a]!.boxes)
        for (const q of rb[b]!.boxes) {
          if (p === q) continue;
          const ix = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
          const iy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
          // The same physical word read by two OCR passes and credited to two lines (a repeated
          // word: "Vegan Society" in the why and the source) is attribution, not a collision.
          // OCR also clips a word's first letters ("rmigiano" for "Parmigiano"), so a fragment of
          // five or more letters inside the other word counts as the same word.
          const oneEdit = (a: string, b: string) => {
            if (Math.abs(a.length - b.length) > 1) return false;
            let i = 0;
            while (i < a.length && a[i] === b[i]) i++;
            return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
          };
          // ...and misreads one letter ("Reqgiano"), so two long words one edit apart are the same word too.
          const sameWord = (t: string, u: string) => (t.length > 3 && u.startsWith(t.slice(0, 4))) || (Math.min(t.length, u.length) >= 5 && (u.includes(t) || t.includes(u))) || (Math.min(t.length, u.length) >= 6 && oneEdit(t, u));
          const same = tokens(p.text).join(' ') === tokens(q.text).join(' ') || tokens(p.text).some((t) => tokens(q.text).some((u) => sameWord(t, u)));
          const share = ix > 0 && iy > 0 ? (ix * iy) / Math.min(p.w * p.h, q.w * q.h) : 0;
          if (!same && ix > 6 && iy > 6 && share > 0.3) overlaps.push(`"${p.text}" (${rb[a]!.line.slice(0, 30)}) overlaps "${q.text}" (${rb[b]!.line.slice(0, 30)})`);
        }
  checks.push({ id: 'still.text_overlap', passed: overlaps.length === 0, detail: 'no two intended lines overprint each other', problems: [...new Set(overlaps)].slice(0, 8) });

  // Size: per line, the median word height must clear the floor for the smallest permitted type.
  const small = rb
    .filter((r) => r.boxes.length > 0)
    .map((r) => ({ line: r.line, h: median(r.boxes.map((b) => b.h)) }))
    .filter((r) => r.h < input.minWordHeight);
  checks.push({
    id: 'still.text_size',
    passed: small.length === 0,
    detail: `every line's median OCR word height ≥ ${input.minWordHeight}px`,
    problems: small.map((s) => `"${s.line}" median word height ${s.h}px`),
  });

  // Contrast: each line's union box, measured from pixels.
  const lowContrast: string[] = [];
  const ratios: number[] = [];
  for (const r of rb) {
    if (r.boxes.length === 0) continue;
    for (const b of r.boxes) {
      const pad = 4;
      const rect = {
        x: Math.max(0, b.x - pad),
        y: Math.max(0, b.y - pad),
        w: Math.min(input.canvas.width - Math.max(0, b.x - pad), b.w + pad * 2),
        h: Math.min(input.canvas.height - Math.max(0, b.y - pad), b.h + pad * 2),
      };
      const c = await boxContrast(input.png, rect);
      ratios.push(c);
      if (c < 4.5) lowContrast.push(`"${b.text}" in "${r.line}" measures ${c.toFixed(2)}:1`);
    }
  }
  checks.push({
    id: 'still.contrast',
    passed: lowContrast.length === 0 && ratios.length > 0,
    detail: `min ${ratios.length ? Math.min(...ratios).toFixed(2) : 'n/a'}:1 over ${ratios.length} word boxes (WCAG AA 4.5:1)`,
    problems: lowContrast,
  });

  return { passed: checks.every((c) => c.passed), checks, readBack: rb };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}
