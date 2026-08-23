/**
 * §156. What each platform's API can actually receive short of a public post.
 *
 * Every assertion here is a claim about a documented API, not about what a
 * platform's web UI lets a person do by hand. The sources are recorded in
 * `docs/PLATFORM_COVERAGE.md`; these tests are what stops the table drifting
 * away from the code that acts on it.
 *
 * The property that matters most: a capability is `false` until the
 * documentation says otherwise. Inventing one here would make Halyard promise
 * an operator something the platform will not do.
 */
import { describe, expect, it } from 'vitest';
import { PLATFORM_IDS, getAdapter } from './index.js';

describe('platform delivery capability', () => {
  it('declares a capability for every platform, so none is unclassified', () => {
    for (const id of PLATFORM_IDS) {
      const { delivery } = getAdapter(id).constraints;
      expect(delivery, `${id} has no delivery capability`).toBeDefined();
      expect(delivery.note.length, `${id} has no evidence note`).toBeGreaterThan(20);
    }
  });

  it('gives TikTok the only native draft, and says a person must finish it', () => {
    // /v2/post/publish/inbox/video/init/ puts a real draft in the creator's
    // TikTok inbox. Halyard cannot post it afterwards; they do, in the app.
    const { delivery } = getAdapter('tiktok').constraints;
    expect(delivery.nativeDraft).toBe(true);
    expect(delivery.requiresCreatorCompletion).toBe(true);
    expect(delivery.privateUpload).toBe(false);
  });

  it('gives YouTube a private upload and API scheduling, and no draft', () => {
    // privacyStatus=private is real content Halyard can still publish;
    // publishAt schedules it. Neither is a draft object.
    const { delivery } = getAdapter('youtube').constraints;
    expect(delivery.privateUpload).toBe(true);
    expect(delivery.apiScheduling).toBe(true);
    expect(delivery.nativeDraft).toBe(false);
    expect(delivery.requiresCreatorCompletion).toBe(false);
  });

  it('gives X nothing, because POST /2/tweets publishes immediately', () => {
    const { delivery } = getAdapter('x').constraints;
    expect(delivery.nativeDraft).toBe(false);
    expect(delivery.privateUpload).toBe(false);
    expect(delivery.apiScheduling).toBe(false);
  });

  it('does not count a media container as an unpublished upload', () => {
    /*
     * Instagram and Threads publish in two steps, and it is tempting to read
     * the container as a draft. It is not: the creator never sees it, it
     * expires — 24 hours on Instagram — and it exists to be published seconds
     * later. Recording it as a capability would invent one.
     */
    for (const id of ['instagram', 'threads'] as const) {
      const { delivery } = getAdapter(id).constraints;
      expect(delivery.nativeDraft, `${id} must not claim a native draft`).toBe(false);
      expect(delivery.privateUpload, `${id} must not claim a private upload`).toBe(false);
    }
  });

  it('gives Pinterest nothing, whatever its web UI offers by hand', () => {
    const { delivery } = getAdapter('pinterest').constraints;
    expect(delivery.nativeDraft).toBe(false);
    expect(delivery.privateUpload).toBe(false);
  });

  it('never marks a platform as needing creator completion without a native draft', () => {
    // The flag only means anything alongside a draft the creator can open.
    for (const id of PLATFORM_IDS) {
      const { delivery } = getAdapter(id).constraints;
      if (delivery.requiresCreatorCompletion) {
        expect(delivery.nativeDraft, `${id} requires completion but has no draft`).toBe(true);
      }
    }
  });

  it('keeps native draft and private upload mutually exclusive', () => {
    // They are different objects with different owners. A platform offering
    // both would need two delivery paths, and none of these does.
    for (const id of PLATFORM_IDS) {
      const { delivery } = getAdapter(id).constraints;
      expect(delivery.nativeDraft && delivery.privateUpload, `${id} claims both`).toBe(false);
    }
  });
});
