/**
 * The TikTok URL-prefix verification file must stay reachable.
 *
 * §179. It arrived at the repository root, which Vercel does not serve — the Next
 * app is `apps/web`, so a file beside the workspace README resolves to a 404 on
 * the deployed domain. TikTok's check is a plain unauthenticated GET for exact
 * bytes, so this fails silently and looks like TikTok being wrong.
 *
 * Also asserted: nothing renames it. The filename *is* the token.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = join(__dirname, '..', '..', 'public');
const FILENAME = 'tiktokw3IwWcG9lc3GkWvMiyKbZTj898KE9ysw.txt';

describe('TikTok URL prefix verification', () => {
  it('is in the directory Next actually serves at the domain root', () => {
    expect(existsSync(join(PUBLIC_DIR, FILENAME))).toBe(true);
  });

  it('is not left at the repository root, where nothing serves it', () => {
    const repoRoot = join(__dirname, '..', '..', '..', '..');
    expect(existsSync(join(repoRoot, FILENAME))).toBe(false);
  });

  it('keeps its exact name — the filename is the token', () => {
    const found = readdirSync(PUBLIC_DIR).filter((f) => f.startsWith('tiktok') && f.endsWith('.txt'));
    expect(found).toEqual([FILENAME]);
  });

  it('has content, and is not an HTML page', () => {
    const body = readFileSync(join(PUBLIC_DIR, FILENAME), 'utf8');
    expect(body.trim().length).toBeGreaterThan(0);
    expect(body).not.toMatch(/<html|<!doctype/i);
  });

  it('is not shadowed by a route of the same path', () => {
    /*
     * A `app/tiktok.../route.ts` would take precedence over the static file and
     * could answer with anything at all.
     */
    const appDir = join(__dirname, '..', 'app');
    const shadow = readdirSync(appDir).filter((e) => e.startsWith('tiktok'));
    expect(shadow).toEqual([]);
  });
});

describe('the app icon submitted to TikTok', () => {
  const ICON = join(PUBLIC_DIR, 'branding', 'halyard-app-icon.png');

  it('exists as a PNG', () => {
    expect(existsSync(ICON)).toBe(true);
  });

  it('is exactly 600x600, which the portal requires', () => {
    /* Read straight from the IHDR chunk rather than trusting the build step. */
    const buf = readFileSync(ICON);
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.readUInt32BE(16)).toBe(600);
    expect(buf.readUInt32BE(20)).toBe(600);
  });

  it('has a vector source beside it', () => {
    expect(existsSync(join(PUBLIC_DIR, 'branding', 'halyard-app-icon.svg'))).toBe(true);
  });

  it('bakes in no corner radius, which would double up under the portal mask', () => {
    const svg = readFileSync(join(PUBLIC_DIR, 'branding', 'halyard-app-icon.svg'), 'utf8');
    expect(svg).toMatch(/<rect width="600" height="600"/);
    expect(svg).not.toMatch(/<rect[^>]*\srx=/);
  });
});
