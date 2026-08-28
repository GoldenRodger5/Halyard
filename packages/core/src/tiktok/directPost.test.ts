/**
 * The TikTok rules that app review actually checks.
 *
 * §179. Most of TikTok's Direct Post requirements are UX requirements: the
 * creator must *choose* the privacy level, interaction toggles must respect what
 * the creator's account allows, commercial content must be disclosed, and the
 * music confirmation must be given. An integration can call the right endpoint
 * with a valid token and still be rejected for defaulting any of them.
 *
 * The adapter previously sent PUBLIC_TO_EVERYONE with comments, Duet and Stitch
 * all enabled, on every post. These tests exist so that cannot come back.
 */
import { describe, expect, it } from 'vitest';
import {
  canPostToTikTok,
  emptyTikTokOptions,
  interpretPublishStatus,
  parseCreatorInfo,
  isTikTokFetchableUrl,
  tiktokMediaUrl,
  toTikTokPostInfo,
  validateTikTokPost,
  type TikTokCreatorInfo,
  type TikTokPostOptions,
} from './directPost.js';

const creator = (over: Partial<TikTokCreatorInfo> = {}): TikTokCreatorInfo => ({
  creatorNickname: 'RecipeFix',
  creatorUsername: 'recipefix',
  creatorAvatarUrl: null,
  privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 600,
  ...over,
});

/** A complete, valid submission — the baseline each test perturbs by one field. */
const ready = (over: Partial<TikTokPostOptions> = {}): TikTokPostOptions => ({
  ...emptyTikTokOptions(),
  privacyLevel: 'PUBLIC_TO_EVERYONE',
  musicConfirmedAt: '2026-08-28T05:00:00.000Z',
  creatorInfoFetchedAt: '2026-08-28T05:00:00.000Z',
  ...over,
});

const fields = (ps: ReturnType<typeof validateTikTokPost>) => ps.map((p) => p.field);

describe('nothing is chosen for the creator', () => {
  it('opens with no privacy level — never the most public one', () => {
    /*
     * The specific thing TikTok's guidance calls out, and what the adapter used
     * to hard-code. A default here is a choice made on the creator's behalf.
     */
    expect(emptyTikTokOptions().privacyLevel).toBeNull();
  });

  it('opens with every interaction toggle off', () => {
    const o = emptyTikTokOptions();
    expect([o.allowComment, o.allowDuet, o.allowStitch]).toEqual([false, false, false]);
  });

  it('opens with commercial disclosure off and no music consent', () => {
    const o = emptyTikTokOptions();
    expect(o.commercialContent).toBe(false);
    expect(o.brandOrganic).toBe(false);
    expect(o.brandedContent).toBe(false);
    expect(o.musicConfirmedAt).toBeNull();
  });

  it('refuses to post an untouched panel', () => {
    const problems = validateTikTokPost({ options: emptyTikTokOptions(), creatorInfo: creator() });
    expect(fields(problems)).toContain('privacyLevel');
    expect(fields(problems)).toContain('musicConfirmedAt');
    expect(canPostToTikTok({ options: emptyTikTokOptions(), creatorInfo: creator() })).toBe(false);
  });

  it('reports every problem at once rather than one at a time', () => {
    expect(validateTikTokPost({ options: emptyTikTokOptions(), creatorInfo: creator() }).length)
      .toBeGreaterThan(1);
  });
});

describe('privacy comes from TikTok, per creator', () => {
  it('accepts a level TikTok offered', () => {
    expect(canPostToTikTok({ options: ready(), creatorInfo: creator() })).toBe(true);
  });

  it('refuses a level TikTok did not offer for this account', () => {
    /* An unaudited client sees only SELF_ONLY; sending PUBLIC would be rejected. */
    const problems = validateTikTokPost({
      options: ready({ privacyLevel: 'PUBLIC_TO_EVERYONE' }),
      creatorInfo: creator({ privacyLevelOptions: ['SELF_ONLY'] }),
    });
    expect(fields(problems)).toContain('privacyLevel');
  });

  it('refuses branded content on a private post', () => {
    const problems = validateTikTokPost({
      options: ready({
        privacyLevel: 'SELF_ONLY',
        commercialContent: true,
        brandedContent: true,
      }),
      creatorInfo: creator(),
    });
    expect(fields(problems)).toContain('privacyLevel');
  });
});

describe('interaction toggles respect the creator account', () => {
  it.each([
    ['comment', { allowComment: true }, { commentDisabled: true }, 'allowComment'],
    ['duet', { allowDuet: true }, { duetDisabled: true }, 'allowDuet'],
    ['stitch', { allowStitch: true }, { stitchDisabled: true }, 'allowStitch'],
  ])('refuses %s when TikTok reports it disabled', (_n, opt, info, field) => {
    const problems = validateTikTokPost({
      options: ready(opt as Partial<TikTokPostOptions>),
      creatorInfo: creator(info as Partial<TikTokCreatorInfo>),
    });
    expect(fields(problems)).toContain(field);
  });

  it('allows a disabled interaction to stay off without complaint', () => {
    expect(
      canPostToTikTok({
        options: ready({ allowDuet: false }),
        creatorInfo: creator({ duetDisabled: true }),
      }),
    ).toBe(true);
  });
});

describe('commercial content disclosure', () => {
  it('requires a kind once the master switch is on', () => {
    const problems = validateTikTokPost({
      options: ready({ commercialContent: true }),
      creatorInfo: creator(),
    });
    expect(fields(problems)).toContain('commercialContent');
  });

  it('accepts either kind, or both', () => {
    for (const kind of [{ brandOrganic: true }, { brandedContent: true }, { brandOrganic: true, brandedContent: true }]) {
      expect(
        canPostToTikTok({ options: ready({ commercialContent: true, ...kind }), creatorInfo: creator() }),
      ).toBe(true);
    }
  });

  it('sends neither toggle when nothing was disclosed', () => {
    const info = toTikTokPostInfo(ready(), 'A title');
    expect(info.brand_content_toggle).toBe(false);
    expect(info.brand_organic_toggle).toBe(false);
  });

  it('does not label an ordinary post as an ad when the switch is off', () => {
    /* Both kinds set, master off — the disclosure was withdrawn, so send neither. */
    const info = toTikTokPostInfo(
      ready({ commercialContent: false, brandOrganic: true, brandedContent: true }),
      'A title',
    );
    expect(info.brand_content_toggle).toBe(false);
    expect(info.brand_organic_toggle).toBe(false);
  });
});

describe('music usage confirmation', () => {
  it('is required', () => {
    expect(fields(validateTikTokPost({ options: ready({ musicConfirmedAt: null }), creatorInfo: creator() })))
      .toContain('musicConfirmedAt');
  });
});

describe('creator info', () => {
  it('refuses to validate anything without it', () => {
    const problems = validateTikTokPost({ options: ready(), creatorInfo: null });
    expect(fields(problems)).toEqual(['creatorInfo']);
  });

  it('enforces the per-account duration limit', () => {
    const problems = validateTikTokPost({
      options: ready(),
      creatorInfo: creator({ maxVideoPostDurationSec: 60 }),
      videoDurationSec: 90,
    });
    expect(fields(problems)).toContain('video');
  });

  it('accepts a video inside the limit', () => {
    expect(
      canPostToTikTok({ options: ready(), creatorInfo: creator({ maxVideoPostDurationSec: 60 }), videoDurationSec: 45 }),
    ).toBe(true);
  });

  it('parses a real creator_info response', () => {
    const parsed = parseCreatorInfo({
      data: {
        creator_nickname: 'RecipeFix',
        creator_username: 'recipefix',
        privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
        comment_disabled: false,
        duet_disabled: true,
        stitch_disabled: false,
        max_video_post_duration_sec: 300,
      },
    });
    expect(parsed).toMatchObject({
      creatorNickname: 'RecipeFix',
      duetDisabled: true,
      maxVideoPostDurationSec: 300,
      privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
    });
  });

  it('treats a missing disable flag as not disabled, never as disabled', () => {
    const parsed = parseCreatorInfo({ data: { creator_nickname: 'X' } })!;
    expect([parsed.commentDisabled, parsed.duetDisabled, parsed.stitchDisabled]).toEqual([false, false, false]);
  });

  it('returns null for a malformed response rather than inventing a creator', () => {
    expect(parseCreatorInfo({})).toBeNull();
    expect(parseCreatorInfo(null)).toBeNull();
    expect(parseCreatorInfo({ data: {} })).toBeNull();
  });
});

describe('post_info translation', () => {
  it('inverts allow into disable, which is what TikTok expects', () => {
    const info = toTikTokPostInfo(ready({ allowComment: true, allowDuet: false, allowStitch: true }), 'T');
    expect(info.disable_comment).toBe(false);
    expect(info.disable_duet).toBe(true);
    expect(info.disable_stitch).toBe(false);
  });

  it('carries the chosen privacy level through unchanged', () => {
    expect(toTikTokPostInfo(ready({ privacyLevel: 'MUTUAL_FOLLOW_FRIENDS' }), 'T').privacy_level)
      .toBe('MUTUAL_FOLLOW_FRIENDS');
  });

  it('throws rather than defaulting when no privacy level was chosen', () => {
    expect(() => toTikTokPostInfo(ready({ privacyLevel: null }), 'T')).toThrow(/chosen by the creator/i);
  });
});

describe('publish status is not the same as publish success', () => {
  it('only PUBLISH_COMPLETE counts as published', () => {
    expect(interpretPublishStatus({ status: 'PUBLISH_COMPLETE' })).toBe('published');
  });

  it('treats an accepted init as merely initialized', () => {
    /* The whole point: a publish_id is a receipt for a request, not a post. */
    expect(interpretPublishStatus({ status: 'PROCESSING_UPLOAD' })).toBe('processing');
    expect(interpretPublishStatus({ status: 'SEND_TO_USER_INBOX' })).toBe('initialized');
    expect(interpretPublishStatus({ status: '' })).toBe('initialized');
  });

  it('separates permanent failures from retryable ones', () => {
    expect(interpretPublishStatus({ status: 'FAILED', failReason: 'spam_risk_too_many_posts' }))
      .toBe('failed_permanent');
    expect(interpretPublishStatus({ status: 'FAILED', failReason: 'privacy_level_check_failed' }))
      .toBe('failed_permanent');
    expect(interpretPublishStatus({ status: 'FAILED', failReason: 'internal_error' }))
      .toBe('failed_retryable');
  });

  it('treats an unrecognised failure as retryable', () => {
    /*
     * The cheaper mistake. A transient failure called permanent loses a post
     * silently; a permanent one called retryable costs bounded retries and then
     * surfaces.
     */
    expect(interpretPublishStatus({ status: 'FAILED', failReason: 'something_new' })).toBe('failed_retryable');
    expect(interpretPublishStatus({ status: 'FAILED' })).toBe('failed_retryable');
  });
});

describe('the URL TikTok is asked to pull from', () => {
  const ASSET = '3f6b2c1a-9d4e-4a7b-8c2d-1e5f7a9b0c3d';
  const PROD = 'https://halyard-ten.vercel.app';

  it('builds a media URL on the verified origin', () => {
    expect(tiktokMediaUrl(PROD, ASSET)).toBe(`${PROD}/media/${ASSET}`);
  });

  it('tolerates a trailing slash on the base', () => {
    expect(tiktokMediaUrl(`${PROD}/`, ASSET)).toBe(`${PROD}/media/${ASSET}`);
  });

  it('refuses to build anything TikTok cannot fetch', () => {
    /*
     * Each of these fails *at TikTok*, minutes later, as an opaque
     * video_pull_failed — long after the operator was told the post was sent.
     */
    expect(tiktokMediaUrl('http://halyard-ten.vercel.app', ASSET)).toBeNull();
    expect(tiktokMediaUrl('https://localhost:3200', ASSET)).toBeNull();
    expect(tiktokMediaUrl('https://halyard.local', ASSET)).toBeNull();
    expect(tiktokMediaUrl('', ASSET)).toBeNull();
    expect(tiktokMediaUrl(null, ASSET)).toBeNull();
  });

  it('refuses an id that is not an asset id', () => {
    expect(tiktokMediaUrl(PROD, '../../etc/passwd')).toBeNull();
    expect(tiktokMediaUrl(PROD, 'not-a-uuid')).toBeNull();
  });

  it('accepts only URLs under the verified prefix', () => {
    expect(isTikTokFetchableUrl(`${PROD}/media/${ASSET}`, PROD)).toBe(true);
    /* Supabase Storage is a domain Halyard does not own and cannot verify. */
    expect(isTikTokFetchableUrl(`https://abc.supabase.co/storage/v1/x.mp4`, PROD)).toBe(false);
    expect(isTikTokFetchableUrl(`http://halyard-ten.vercel.app/media/${ASSET}`, PROD)).toBe(false);
    expect(isTikTokFetchableUrl('/dev-assets/v.mp4', PROD)).toBe(false);
  });

  it('does not accept a lookalike host that merely starts the same way', () => {
    expect(isTikTokFetchableUrl('https://halyard-ten.vercel.app.evil.com/media/x', PROD)).toBe(false);
  });

  it('has no verified prefix to compare against when none is configured', () => {
    expect(isTikTokFetchableUrl(`${PROD}/media/${ASSET}`, null)).toBe(false);
  });
});
