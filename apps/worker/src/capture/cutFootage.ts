/**
 * Turn a raw screen recording into the part worth watching.
 *
 * §163. A capture records the whole browser session. The first real one ran to
 * fifty seconds, of which about ten were the product doing anything: the rest
 * was a sibling flow stalled on a selector that no longer exists. Nothing
 * downstream could use that file — a creative beat needs footage, not a session.
 *
 * `footageSpansFor` decides *which* parts, deterministically, from measured step
 * offsets. This does the cutting, and nothing else: it trims the spans, joins
 * them, and reframes the result for 9:16. It invents no frames, adds no
 * transitions and generates no imagery — every frame in the output is a frame
 * that was recorded.
 *
 * Cutting rather than speeding up is deliberate. A speed ramp over a spinner is
 * still a spinner, and §159 already rejected a synthetic progress overlay for
 * the same reason: it would draw product UI that does not exist.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import type { FootageSpan } from '@halyard/core';

const execFileAsync = promisify(execFile);

/** 9:16 at the size every composition renders. */
export const PORTRAIT = { width: 1080, height: 1920 } as const;

export interface CutOptions {
  /**
   * The part of the source frame worth showing, as fractions.
   *
   * §163. Supplied by the flow, because where a product's output sits is
   * knowledge about that product's layout. Omitted means the whole frame.
   */
  focusRegion?: { x: number; y: number; width: number; height: number };
}

/**
 * Cut `spans` out of `sourcePath` and write one portrait mp4.
 *
 * Returns the output path, or `null` when there is nothing to cut — which is an
 * honest outcome and the caller must treat it as "no footage", never as a
 * reason to substitute something else.
 */
export async function cutFootage(
  sourcePath: string,
  spans: FootageSpan[],
  outputPath: string,
  options: CutOptions = {},
): Promise<string | null> {
  if (spans.length === 0) return null;

  const work = await mkdtemp(path.join(tmpdir(), 'halyard-cut-'));
  try {
    const parts: string[] = [];

    for (const [index, span] of spans.entries()) {
      const part = path.join(work, `part-${index}.mp4`);
      const seconds = (span.endMs - span.startMs) / 1000;

      /*
       * Crop to the focus region first, then scale to the frame width. Doing it
       * in that order is what makes the product legible: scaling the whole
       * window down and then cropping leaves the interface at the size it was
       * on a 1280px desktop, shrunk onto a phone.
       *
       * Proportions are never altered — a stretched interface reads as a broken
       * screenshot, which is a lie about the product.
       */
      const r = options.focusRegion;
      const filter = r
        ? `crop=iw*${r.width}:ih*${r.height}:iw*${r.x}:ih*${r.y},scale=${PORTRAIT.width}:-2`
        : `scale=${PORTRAIT.width}:-2`;

      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', String(span.startMs / 1000),
        '-t', String(seconds),
        '-i', sourcePath,
        '-vf', filter,
        '-an',
        '-r', '30',
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        part,
      ]);
      parts.push(part);
    }

    if (parts.length === 1) {
      await execFileAsync('ffmpeg', ['-y', '-i', parts[0]!, '-c', 'copy', outputPath]);
      return outputPath;
    }

    // A plain concat, so the join is a cut. Anything else would be an effect
    // applied to footage of a real product doing a real thing.
    const list = path.join(work, 'parts.txt');
    await writeFile(list, parts.map((p) => `file '${p}'`).join('\n'), 'utf8');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', list,
      '-c', 'copy',
      outputPath,
    ]);
    return outputPath;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
