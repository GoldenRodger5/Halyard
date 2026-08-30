/**
 * §350. Which post type a run is making.
 *
 * `generate.ts` never asks this. It decides media by scattered conditions — a
 * carousel when the platform is Instagram *and* `carousel_6` is enabled, a
 * landscape render when the subtype says long-form — and each condition is a
 * local answer to a question nobody asks globally.
 *
 * The consequence is that no stage can know what is being made. The voiceover
 * stage cannot skip itself for a text post, because nothing told it there is no
 * video; it runs whenever its own conditions happen to pass.
 *
 * This resolves it once, from the format and the platform, so every stage after
 * it can ask rather than infer.
 */
import { POST_TYPE_CATALOG, type PostType, type PostTypeId } from './postTypes.js';
import type { PostFormat } from '../formats/catalog.js';

export interface PostTypeResolution {
  postType: PostType;
  /** Why this one, in a line an operator can disagree with. */
  because: string;
  /** Types that were possible and not chosen, best first. */
  alternatives: PostTypeId[];
}

/**
 * Resolve from what is already decided: the format, the platform, and whether
 * the operator asked for something specific.
 *
 * An operator's explicit choice wins, because the Make page exists to let a
 * person say what they want. Everything else follows from the format's channel
 * — which is the format saying what kind of thing it is — narrowed by what the
 * platform can carry.
 */
export function resolvePostType(input: {
  format: PostFormat;
  platform: string;
  /** What the platform can carry, from `postTypesForPlatform`. */
  available: readonly PostTypeId[];
  /** An operator's explicit choice, honoured above everything. */
  requested?: PostTypeId | null;
}): PostTypeResolution | null {
  if (input.requested) {
    const requested = POST_TYPE_CATALOG[input.requested];
    if (requested && input.available.includes(input.requested)) {
      return { postType: requested, because: 'Chosen by the operator.', alternatives: [] };
    }
    /*
     * Asked for and impossible here. Falls through rather than throwing: the
     * caller has a platform and a format that may still work together, and the
     * reason is reported below.
     */
  }

  /*
   * The format's channel says what kind of thing this format is — a quiz is a
   * short video, a recipe is a carousel. Post types in that channel are the
   * candidates, ordered so the richest producible one wins: given the choice
   * between a carousel and a single image, a format that wanted a sequence
   * should get one.
   */
  const RICHNESS: PostTypeId[] = [
    'short_video',
    'long_video',
    'carousel_mixed',
    'carousel_images',
    'single_image',
    'story',
    'caption_link',
    'caption_only',
    'reply',
    'pin',
  ];

  const candidates = RICHNESS.filter((id) => {
    const type = POST_TYPE_CATALOG[id];
    return type.channel === input.format.channels[0] && input.available.includes(id);
  });

  if (candidates.length === 0) {
    /*
     * The format's own channel cannot be carried here. Rather than substituting
     * a different kind of piece — which is how a quiz becomes a transformation
     * post — this returns null and the caller refuses.
     */
    return null;
  }

  const chosen = POST_TYPE_CATALOG[candidates[0]!];
  return {
    postType: chosen,
    because: input.requested
      ? `${input.requested} cannot be carried on ${input.platform}, so ${chosen.id} was used instead.`
      : `${input.format.id} is a ${chosen.channel} format and ${input.platform} can carry ${chosen.id}.`,
    alternatives: candidates.slice(1, 4),
  };
}
