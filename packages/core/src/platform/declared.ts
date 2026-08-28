/**
 * What each Halyard adapter actually implements — dimension B, stated from code.
 *
 * ## The distinction this file exists to hold
 *
 * Three different claims get conflated constantly, and Meta's dashboard wording
 * encourages it:
 *
 *   1. the provider's API supports an operation
 *   2. **Halyard's adapter implements it**
 *   3. Halyard has watched it work
 *
 * `PlatformConstraints` covers what a platform allows for *content* — formats,
 * aspect ratios, link strategy. It says nothing about whether Halyard wrote the
 * code to read a comment. That second claim had no home, so actions like
 * `read_comments` fell through to `unknown` even where an adapter plainly
 * implements them — and `unknown` for something we built is as wrong as
 * `declared` for something we did not.
 *
 * So this maps action → the method that implements it, and **absence is
 * meaningful**: an action missing from a platform's entry is genuinely not
 * implemented, and `resolveCapability` will report `unknown` rather than
 * inventing a claim. Nothing here is ever `verified` — that still requires a
 * probe, and this file cannot grant it.
 *
 * Meta's dashboard listing "respond to comments" and "answer direct messages"
 * is deliberately **not** represented. Those are refused by product policy
 * (`platform/policy.ts`), and a capability entry for them would reopen a closed
 * safety decision.
 */
import type { PlatformId } from '../adapters/types.js';
import type { CapabilityAction } from './capability.js';

export interface AdapterDeclaration {
  /** The adapter method that implements it, for anyone checking this is true. */
  implementedBy: string;
}

/**
 * Keyed by platform, then action. An action absent here is not implemented.
 *
 * Every entry was read out of the adapter rather than inferred from provider
 * documentation.
 */
export const ADAPTER_DECLARED: Partial<
  Record<PlatformId, Partial<Record<CapabilityAction, AdapterDeclaration>>>
> = {
  /**
   * X, YouTube and Bluesky were missing entirely when this file was written,
   * and all three implement `listComments`. The result was `read_comments`
   * resolving to `unknown` on three platforms that plainly have the code — the
   * exact error this file's own opening paragraph warns about, made by this
   * file.
   *
   * It went unnoticed because the table was hand-written against two adapters
   * and nothing compared it to the rest. `platform.test.ts` now derives the
   * truth from the adapter objects themselves for every action that maps to a
   * method, so this particular drift cannot happen quietly again.
   */
  x: {
    publish: { implementedBy: 'x.ts#publish' },
    alt_text: { implementedBy: 'x.ts#uploadMedia posts metadata.alt_text' },
    read_comments: { implementedBy: 'x.ts#listComments (conversation_id search)' },
    // Nothing else. `video` and `carousel` are answered by the constraints,
    // and repeating them here would add a second place for them to disagree.
  },
  youtube: {
    publish: { implementedBy: 'youtube.ts#publish' },
    read_comments: { implementedBy: 'youtube.ts#listComments (commentThreads)' },
    /**
     * §199 made both of these true, and they were not before.
     *
     * `scheduling` is the rarer kind: Halyard normally schedules in its own
     * queue rather than asking a provider to hold a post, and for every other
     * platform that is still the case. YouTube accepts `status.publishAt` on
     * `videos.insert` — on the upload scope alone — so the *platform* holds it
     * and releases it. That was advertised by the delivery contract since §156
     * and implemented by nothing until §199.
     *
     * `short_video` is a real distinction here rather than a synonym for
     * `video`: a Short and a twelve-minute upload go through the same endpoint
     * and are different products, and `resolveVariant` is the code that tells
     * them apart.
     */
    scheduling: { implementedBy: 'youtube.ts#publish sets status.publishAt (§199)' },
    short_video: { implementedBy: 'youtube.ts#publish via resolveVariant in youtube/variant.ts (§199)' },
    // alt_text: YouTube has no alt text. Absent, not "no" — the constraints own
    // that answer.
  },
  bluesky: {
    publish: { implementedBy: 'bluesky.ts#publish' },
    alt_text: { implementedBy: 'bluesky.ts#publish sets alt on each image' },
    read_comments: { implementedBy: 'bluesky.ts#listComments (getPostThread)' },
  },
  pinterest: {
    publish: { implementedBy: 'pinterest.ts#publish' },
    alt_text: { implementedBy: 'pinterest.ts#publish sets alt_text' },
    // read_comments: no `listComments` method. Absent, and resolves to
    // `unknown` rather than to a claim in either direction.
  },
  tiktok: {
    publish: { implementedBy: 'tiktok.ts#publish (inbox upload)' },
    // read_comments: no `listComments` method.
  },
  instagram: {
    publish: { implementedBy: 'instagram.ts#publish' },
    carousel: { implementedBy: 'instagram.ts#publish (carousel container)' },
    video: { implementedBy: 'instagram.ts#publish (video container)' },
    alt_text: { implementedBy: 'instagram.ts#publish sets fields.alt_text' },
    read_comments: { implementedBy: 'instagram.ts#listComments' },
    /**
     * §200. This said "Reels publishing is a distinct container type Halyard
     * does not build". It builds it — `media_type: 'REELS'` is what every
     * Instagram video container has been sent as, in two places, since the
     * adapter was written. The entry was absent, so `short_video` resolved to
     * `unknown` on the one platform where Halyard's short video actually goes.
     *
     * The comment was not idly wrong: it is the same failure this file's own
     * header describes, and the reason it survived is that `short_video` maps
     * to no adapter method, so the test that derives declarations from method
     * names could not see it. Found by reading a rehearsal's recorded request.
     */
    short_video: { implementedBy: "instagram.ts#publish sends media_type: 'REELS'" },
    // read_mentions: no method. The Graph API exposes mentions; Halyard has not
    // implemented them, so this stays absent and resolves to `unknown`.
    // scheduling: Halyard schedules in its own queue rather than asking the
    // provider to hold a post, so there is no adapter method to declare.
  },
  threads: {
    publish: { implementedBy: 'threads.ts#publish' },
    carousel: { implementedBy: 'threads.ts#publish (carousel container)' },
    video: { implementedBy: 'threads.ts#publish (video container)' },
    alt_text: { implementedBy: 'threads.ts#publish sets fields.alt_text' },
    read_comments: { implementedBy: 'threads.ts#listComments' },
    // read_mentions, scheduling, short_video: not implemented — see above.
  },
};

/** Whether a Halyard adapter implements this action. Absence means it does not. */
export function adapterDeclares(platform: PlatformId, action: CapabilityAction): boolean {
  return ADAPTER_DECLARED[platform]?.[action] !== undefined;
}

/** Where to look to confirm the declaration, or null when there is none. */
export function declarationEvidence(
  platform: PlatformId,
  action: CapabilityAction,
): string | null {
  return ADAPTER_DECLARED[platform]?.[action]?.implementedBy ?? null;
}
