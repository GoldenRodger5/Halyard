/**
 * The per-platform format specs, which nothing selected between.
 *
 * Eleven were declared — X insights and threads, Instagram carousels, singles
 * and reel scripts, TikTok scripts, Pinterest pins, YouTube shorts, Threads
 * posts — each with its own craft notes, shape rules and extra output fields.
 * The copywriter used one generic prompt with a platform brief appended, so a
 * carousel and a single image were written identically and the slide structure
 * a carousel needs was never asked for.
 */
import { describe, expect, it } from 'vitest';
import { FORMAT_SPECS, formatSpecBlock, selectFormatSpec } from './formatPrompts.js';
import { buildCopywriterPrompt } from './prompts.js';

describe('selectFormatSpec', () => {
  it('gives a carousel the carousel spec, not the single-image one', () => {
    const spec = selectFormatSpec('instagram', 'carousel');
    expect(spec?.id).toBe('instagram/carousel');
    // The structure a carousel needs and a caption does not.
    expect(spec?.extraOutput).toHaveProperty('slides');
  });

  it('gives an Instagram video a reel script, not a caption', () => {
    expect(selectFormatSpec('instagram', 'video')?.id).toBe('instagram/reel_script');
  });

  it('routes each video platform to its own craft', () => {
    expect(selectFormatSpec('tiktok', 'video')?.id).toBe('tiktok/script');
    expect(selectFormatSpec('youtube', 'video')?.id).toBe('youtube/short');
  });

  it('gives Pinterest the pin spec', () => {
    expect(selectFormatSpec('pinterest', 'pin')?.id).toBe('pinterest/pin');
  });

  it('returns nothing for a platform with no spec rather than a near-match', () => {
    /**
     * Bluesky has no spec. Handing it the Threads prompt because they look
     * similar is how a platform quietly gets someone else's voice.
     */
    expect(selectFormatSpec('bluesky', 'text')).toBeNull();
  });

  it('honours an explicit subtype over the default', () => {
    expect(selectFormatSpec('x', 'text', 'thread')?.id).toBe('x/thread');
    expect(selectFormatSpec('x', 'text')?.id).toBe('x/insight');
  });
});

describe('formatSpecBlock', () => {
  it('carries the craft, the rules and the extra output', () => {
    const spec = FORMAT_SPECS.find((s) => s.id === 'instagram/carousel')!;
    const block = formatSpecBlock(spec);
    expect(block).toContain('instagram/carousel');
    expect(block).toContain(spec.rules[0]!);
    expect(block).toContain('slides');
  });
});

describe('the copywriter prompt', () => {
  const context = {
    platform: 'tiktok' as const,
    format: 'video',
    category: 'education',
    persona: 'brand' as const,
    idea: { title: 'Flour swaps', angle: 'why the crumb changes' },
    voice: {
      displayName: 'RecipeFix',
      description: 'direct and specific',
      doRules: [],
      dontRules: [],
      examples: [],
      antiExamples: [],
    },
    productBrief: 'RecipeFix adapts recipes.',
    contentRules: {},
    hooks: [],
  };

  it('tells the model the platform ceiling, which nothing enforced before', () => {
    const { system } = buildCopywriterPrompt(context);
    expect(system).toContain('2200 characters');
  });

  it('injects the format craft for platforms that have one', () => {
    const { system } = buildCopywriterPrompt(context);
    expect(system).toContain('tiktok/script');
  });

  it('falls back to the shared architecture where no spec exists', () => {
    // Bluesky still gets the caption architecture — just not a borrowed voice.
    const { system } = buildCopywriterPrompt({ ...context, platform: 'bluesky', format: 'text' });
    expect(system).toContain('CAPTION ARCHITECTURE');
    expect(system).not.toContain('threads/post');
  });
});
