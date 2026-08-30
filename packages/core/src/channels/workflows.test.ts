/**
 * §350. Every post type, end to end, as a workflow.
 *
 * Not a unit test of one function: this walks each post type through
 * resolution, the stage plan and the ordering gates, because the faults this
 * work fixed were all *between* those steps rather than inside any of them.
 */
import { describe, it, expect } from 'vitest';
import { POST_TYPES, POST_TYPE_CATALOG, postTypesForPlatform, type PlatformSupport } from './postTypes.js';
import { resolvePostType } from './resolvePostType.js';
import { canStart, planProduction, STAGES, type Stage } from '../creative/productionPlan.js';
import { POST_FORMAT_CATALOG, requiresCitation } from '../formats/catalog.js';

const SUPPORTS: Record<string, PlatformSupport> = {
  tiktok: {
    platform: 'tiktok',
    supportedFormats: ['video', 'carousel'],
    carousel: { min: 2, max: 35 },
    linkStrategy: 'bio_only',
    video: { minSeconds: 3, maxSeconds: 600 },
  },
  instagram: {
    platform: 'instagram',
    supportedFormats: ['image', 'carousel', 'video', 'story'],
    carousel: { min: 2, max: 10, sameAspectRatioRequired: true },
    linkStrategy: 'bio_only',
    video: { minSeconds: 5, maxSeconds: 90 },
  },
  x: {
    platform: 'x',
    supportedFormats: ['text', 'image', 'video'],
    linkStrategy: 'first_reply',
    video: { minSeconds: 1, maxSeconds: 140 },
  },
  threads: {
    platform: 'threads',
    supportedFormats: ['text', 'image', 'video', 'carousel'],
    carousel: { min: 2, max: 20 },
    linkStrategy: 'in_body',
    video: { minSeconds: 1, maxSeconds: 300 },
  },
  youtube: {
    platform: 'youtube',
    supportedFormats: ['video'],
    linkStrategy: 'description',
    video: { minSeconds: 1, maxSeconds: 43_200 },
  },
};

/** Walk a production the way the handler does, refusing any out-of-order stage. */
function walk(postTypeId: (typeof POST_TYPES)[number], sourced: boolean) {
  const postType = POST_TYPE_CATALOG[postTypeId];
  const plan = planProduction({
    channel: postType.channel,
    media: postType.media,
    sourced,
  });

  const completed: Stage[] = [];
  const refused: string[] = [];
  for (const { stage } of plan.stages) {
    const gate = canStart(stage, completed);
    if (!gate.ok) refused.push(gate.because);
    completed.push(stage);
  }
  return { plan, refused, completed };
}

describe('every post type produces a runnable, ordered plan', () => {
  for (const id of POST_TYPES) {
    it(`${id} runs in an order where nothing starts before its input`, () => {
      const { refused } = walk(id, true);
      expect(refused, `${id}: ${refused.join('; ')}`).toEqual([]);
    });
  }

  it('never plans a stage that is not in the vocabulary', () => {
    for (const id of POST_TYPES) {
      for (const { stage } of walk(id, true).plan.stages) {
        expect(STAGES).toContain(stage);
      }
    }
  });

  it('accounts for every stage as run or skipped, with a reason', () => {
    /* A stage that is neither is a stage nobody decided about. */
    for (const id of POST_TYPES) {
      const { plan } = walk(id, true);
      const seen = [...plan.stages, ...plan.skipped].map((s) => s.stage);
      for (const stage of STAGES) {
        expect(seen, `${id} says nothing about ${stage}`).toContain(stage);
      }
    }
  });
});

describe('the workflows differ where they should', () => {
  it('gives a caption-only post no render, voice, music or screenplay', () => {
    const stages = walk('caption_only', false).plan.stages.map((s) => s.stage);
    expect(stages).toEqual(['brief', 'write', 'caption']);
  });

  it('gives a link post the same shape as a caption post', () => {
    /* They differ in cost, reach and copy — not in which stages run. */
    const link = walk('caption_link', false).plan.stages.map((s) => s.stage);
    const plain = walk('caption_only', false).plan.stages.map((s) => s.stage);
    expect(link).toEqual(plain);
  });

  it('gives a single image assets and a render but no voice', () => {
    const stages = walk('single_image', false).plan.stages.map((s) => s.stage);
    expect(stages).toContain('assets');
    expect(stages).toContain('render');
    expect(stages).not.toContain('voice');
  });

  it('stages a carousel without giving it a voice', () => {
    const stages = walk('carousel_images', false).plan.stages.map((s) => s.stage);
    expect(stages).toContain('screenplay');
    expect(stages).not.toContain('voice');
  });

  it('gives a short video every stage', () => {
    const stages = walk('short_video', true).plan.stages.map((s) => s.stage);
    for (const stage of ['research', 'write', 'screenplay', 'assets', 'voice', 'music', 'marks', 'render', 'qc']) {
      expect(stages).toContain(stage as Stage);
    }
  });
});

describe('resolvePostType', () => {
  it('gives a quiz a short video on TikTok', () => {
    const resolved = resolvePostType({
      format: POST_FORMAT_CATALOG.quiz,
      platform: 'tiktok',
      available: postTypesForPlatform(SUPPORTS.tiktok!),
    })!;
    expect(resolved.postType.id).toBe('short_video');
  });

  it('refuses rather than substituting when the channel cannot be carried', () => {
    /*
     * A quiz is a short-video format and X caps video at 140s, which it can
     * still carry — so the honest refusal case is a long video on X.
     */
    const resolved = resolvePostType({
      format: POST_FORMAT_CATALOG.recipe,
      platform: 'x',
      available: postTypesForPlatform(SUPPORTS.x!),
    });
    /* `recipe` is a carousel format and X carries no carousel. */
    expect(resolved).toBeNull();
  });

  it('honours an operator’s explicit choice', () => {
    const resolved = resolvePostType({
      format: POST_FORMAT_CATALOG.tips,
      platform: 'threads',
      available: postTypesForPlatform(SUPPORTS.threads!),
      requested: 'caption_only',
    })!;
    expect(resolved.postType.id).toBe('caption_only');
    expect(resolved.because).toContain('operator');
  });

  it('falls back and says so when the operator asks for the impossible', () => {
    const resolved = resolvePostType({
      format: POST_FORMAT_CATALOG.quiz,
      platform: 'tiktok',
      available: postTypesForPlatform(SUPPORTS.tiktok!),
      requested: 'caption_only',
    })!;
    expect(resolved.postType.id).not.toBe('caption_only');
    expect(resolved.because).toContain('cannot be carried');
  });

  it('explains itself either way', () => {
    const resolved = resolvePostType({
      format: POST_FORMAT_CATALOG.quiz,
      platform: 'instagram',
      available: postTypesForPlatform(SUPPORTS.instagram!),
    })!;
    expect(resolved.because.length).toBeGreaterThan(20);
  });
});

describe('formats and post types agree', () => {
  it('every format can be resolved on at least one platform', () => {
    /* A format nothing can carry is a menu entry that wastes an operator. */
    for (const [id, format] of Object.entries(POST_FORMAT_CATALOG)) {
      const anywhere = Object.values(SUPPORTS).some((support) =>
        resolvePostType({
          format,
          platform: support.platform,
          available: postTypesForPlatform(support),
        }),
      );
      expect(anywhere, `${id} cannot be carried on any platform`).toBe(true);
    }
  });

  it('a sourced format always researches before it writes', () => {
    for (const format of Object.values(POST_FORMAT_CATALOG)) {
      if (!requiresCitation(format)) continue;
      const postType = POST_TYPE_CATALOG[
        format.channels[0] === 'short_video' ? 'short_video' : 'carousel_images'
      ];
      const stages = planProduction({
        channel: postType.channel,
        media: postType.media,
        sourced: true,
      }).stages.map((s) => s.stage);
      expect(stages.indexOf('research')).toBeLessThan(stages.indexOf('write'));
    }
  });
});
