/**
 * §163. Remotion caches bundles by code, and copies `publicDir` into them.
 *
 * Those two facts together mean a file written into `public/` after a bundle
 * exists is never served — which is exactly how the first footage render 404'd
 * on a file that was sitting on disk the whole time. The fingerprint is what
 * makes the cache notice.
 */
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicFingerprint } from './video.js';

function fixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'halyard-public-'));
  mkdirSync(path.join(dir, 'capture'));
  writeFileSync(path.join(dir, 'capture', 'flow.mp4'), 'aaa');
  writeFileSync(path.join(dir, 'font.woff2'), 'bbb');
  return dir;
}

describe('publicFingerprint', () => {
  it('is stable when nothing changed, so renders do not rebundle for free', () => {
    const dir = fixture();
    expect(publicFingerprint(dir)).toBe(publicFingerprint(dir));
  });

  it('changes when a capture writes new footage', () => {
    // The case that broke: a new file appearing under public/.
    const dir = fixture();
    const before = publicFingerprint(dir);
    writeFileSync(path.join(dir, 'capture', 'other.mp4'), 'ccc');
    expect(publicFingerprint(dir)).not.toBe(before);
  });

  it('changes when a capture overwrites footage with a new cut', () => {
    /*
     * The silent one. A recapture writes the same filename, so a names-only
     * fingerprint would match and the render would show last week's product.
     */
    const dir = fixture();
    const before = publicFingerprint(dir);
    const file = path.join(dir, 'capture', 'flow.mp4');
    writeFileSync(file, 'a much longer cut than before');
    expect(publicFingerprint(dir)).not.toBe(before);
  });

  it('notices a same-size recut, because equal length is not equal content', () => {
    const dir = fixture();
    const file = path.join(dir, 'capture', 'flow.mp4');
    const before = publicFingerprint(dir);
    writeFileSync(file, 'zzz');
    const later = new Date(Date.now() + 60_000);
    utimesSync(file, later, later);
    expect(publicFingerprint(dir)).not.toBe(before);
  });

  it('sees into subdirectories, which is where footage lives', () => {
    const dir = fixture();
    expect(publicFingerprint(dir)).toContain('capture/flow.mp4');
  });
});
