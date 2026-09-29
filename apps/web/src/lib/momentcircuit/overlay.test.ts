import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { assertCleanOverlayText, renderMomentCircuitOverlay } from './overlay';

describe('MomentCircuit portable overlays', () => {
  it('renders campaign-required subtitle text with bundled fonts', async () => {
    const samples = [
      'You should get the GPS.',
      'We do have a GPS.',
      'But he just runs.',
      'We get to the woods...',
      'All we can do is stand there.',
      'and watch him run with coyotes.',
    ];

    for (const required_text of samples) {
      const png = await renderMomentCircuitOverlay({ required_text }, 'required');
      const meta = await sharp(png).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1920);
      expect(meta.hasAlpha).toBe(true);
      const stats = await sharp(png).stats();
      const alpha = stats.channels[3];
      expect(alpha).toBeDefined();
      expect(alpha!.max).toBeGreaterThan(0);
    }
  });

  it('leaves the hook layer fully transparent when no hook is supplied', async () => {
    const png = await renderMomentCircuitOverlay({}, 'hook');
    const stats = await sharp(png).stats();
    const alpha = stats.channels[3];
    expect(alpha).toBeDefined();
    expect(alpha!.max).toBe(0);
  });

  it('renders native white hook text without a solid card', async () => {
    const png = await renderMomentCircuitOverlay(
      {
        hook_line1: "Trae isn’t Dylan Brooks",
        hook_line2: 'Villain talk, in his words',
      },
      'hook',
    );
    const stats = await sharp(png).stats();
    expect(stats.channels[3]!.max).toBeGreaterThan(0);
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let opaquePixels = 0;
    const pixelCount = info.width * info.height;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 245) opaquePixels += 1;
    }
    expect(opaquePixels / pixelCount).toBeLessThan(0.05);
  });

  it('fails unsupported glyphs instead of silently rendering tofu boxes', async () => {
    await expect(
      renderMomentCircuitOverlay({ hook_line1: 'Great clip 🔥' }, 'hook'),
    ).rejects.toThrow('OVERLAY_UNSUPPORTED_GLYPH');
  });
  it('renders caption cue text as a dedicated visual layer', async () => {
    const png = await renderMomentCircuitOverlay(
      { caption_text: 'Never mind. This is a horrible idea.' },
      'caption',
    );
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
    const stats = await sharp(png).stats();
    expect(stats.channels[3]!.max).toBeGreaterThan(0);
  });

  it('rejects raw ASS/SRT/timestamp serialization before rasterization', () => {
    expect(() =>
      assertCleanOverlayText('0:00:01.68,0:00:03.35,Cap,,0,0,0,,YOU AND MY COUPLES THERAPIST'),
    ).toThrow('OVERLAY_RAW_SUBTITLE_ARTIFACT');
    expect(() => assertCleanOverlayText('Dialogue: 0,0:00:01.68,0:00:03.35,Cap,text')).toThrow(
      'OVERLAY_RAW_SUBTITLE_ARTIFACT',
    );
    expect(() => assertCleanOverlayText('00:00:01,680 --> 00:00:03,350')).toThrow(
      'OVERLAY_RAW_SUBTITLE_ARTIFACT',
    );
  });
});
