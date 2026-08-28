/**
 * §199. The rules here are facts about YouTube, so the tests are written as
 * those facts — not as a restatement of the implementation.
 */
import { describe, expect, it } from 'vitest';
import {
  YOUTUBE_SHORTS_MAX_SECONDS,
  canModifyExistingVideo,
  canScheduleAtUpload,
  canSetThumbnail,
  categoryIdFor,
  classifiesAsShort,
  limitsFor,
  resolveVariant,
  validateYouTubeUpload,
} from './variant.js';

const vertical = { width: 1080, height: 1920, durationSeconds: 30 };
const landscape = { width: 1920, height: 1080, durationSeconds: 600 };

describe('classifiesAsShort — YouTube decides, not Halyard', () => {
  it('treats square-or-taller under three minutes as a Short', () => {
    expect(classifiesAsShort(vertical)).toBe(true);
    expect(classifiesAsShort({ width: 1080, height: 1080, durationSeconds: 179 })).toBe(true);
  });

  it('uses three minutes, not the sixty seconds the adapter shipped with', () => {
    expect(classifiesAsShort({ ...vertical, durationSeconds: 90 })).toBe(true);
    expect(classifiesAsShort({ ...vertical, durationSeconds: YOUTUBE_SHORTS_MAX_SECONDS })).toBe(true);
    expect(classifiesAsShort({ ...vertical, durationSeconds: YOUTUBE_SHORTS_MAX_SECONDS + 1 })).toBe(false);
  });

  it('never calls a landscape video a Short', () => {
    expect(classifiesAsShort({ width: 1920, height: 1080, durationSeconds: 10 })).toBe(false);
  });

  it('treats an unmeasured asset as long-form rather than guessing', () => {
    expect(classifiesAsShort({ width: 1080, height: 1920 })).toBe(false);
    expect(classifiesAsShort({ durationSeconds: 20 })).toBe(false);
  });
});

describe('resolveVariant', () => {
  it('infers from the asset when nothing was declared', () => {
    const r = resolveVariant(null, vertical);
    expect(r.actual).toBe('short');
    expect(r.mismatch).toBe(false);
  });

  it('flags an intent YouTube will not honour', () => {
    const r = resolveVariant('long_form', vertical);
    expect(r.intended).toBe('long_form');
    expect(r.actual).toBe('short');
    expect(r.mismatch).toBe(true);
    expect(r.reason).toMatch(/publish it as a Short/);
  });

  it('flags a Short that does not qualify', () => {
    const r = resolveVariant('short', landscape);
    expect(r.actual).toBe('long_form');
    expect(r.mismatch).toBe(true);
  });

  it('agrees when intent matches the file', () => {
    expect(resolveVariant('long_form', landscape).mismatch).toBe(false);
    expect(resolveVariant('short', vertical).mismatch).toBe(false);
  });
});

describe('validateYouTubeUpload', () => {
  const base = {
    variant: 'short' as const,
    asset: vertical,
    title: 'A title',
    description: 'A description',
    tags: ['cooking'],
    privacyStatus: 'private' as const,
  };

  it('passes a well-formed Short', () => {
    expect(validateYouTubeUpload(base).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('rejects a title past the API limit', () => {
    const issues = validateYouTubeUpload({ ...base, title: 'x'.repeat(101) });
    expect(issues.some((i) => i.field === 'title' && i.severity === 'error')).toBe(true);
  });

  it('rejects angle brackets, which YouTube refuses outright', () => {
    expect(validateYouTubeUpload({ ...base, title: 'a <b> c' }).some((i) => i.field === 'title')).toBe(true);
    expect(
      validateYouTubeUpload({ ...base, description: 'a <b> c' }).some((i) => i.field === 'description'),
    ).toBe(true);
  });

  it('caps tags by total characters, not by count', () => {
    const many = Array.from({ length: 5 }, () => 'x'.repeat(120));
    expect(validateYouTubeUpload({ ...base, tags: many }).some((i) => i.field === 'tags')).toBe(true);
  });

  it('rejects a Short over three minutes with advice, not a code', () => {
    const issues = validateYouTubeUpload({
      ...base,
      asset: { ...vertical, durationSeconds: 200 },
    });
    const err = issues.find((i) => i.field === 'asset');
    expect(err?.message).toMatch(/Trim it, or publish it as long-form/);
  });

  it('refuses publishAt on a public upload, which YouTube rejects', () => {
    const issues = validateYouTubeUpload({
      ...base,
      privacyStatus: 'public',
      publishAt: new Date(Date.now() + 86_400_000),
    });
    expect(issues.some((i) => i.field === 'publishAt' && i.severity === 'error')).toBe(true);
  });

  it('refuses a publishAt in the past', () => {
    const issues = validateYouTubeUpload({
      ...base,
      publishAt: new Date(Date.now() - 1000),
    });
    expect(issues.some((i) => i.field === 'publishAt')).toBe(true);
  });

  it('warns — but does not block — on a variant mismatch', () => {
    const issues = validateYouTubeUpload({ ...base, variant: 'long_form' });
    const v = issues.find((i) => i.field === 'variant');
    expect(v?.severity).toBe('warning');
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('scopes — what Halyard can actually do', () => {
  /** Exactly what production granted. */
  const granted = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ];

  it('cannot flip an existing private video public', () => {
    expect(canModifyExistingVideo(granted)).toBe(false);
  });

  it('cannot set a thumbnail', () => {
    expect(canSetThumbnail(granted)).toBe(false);
  });

  it('can schedule at upload time, which is what apiScheduling claims', () => {
    expect(canScheduleAtUpload(granted)).toBe(true);
  });

  it('gains modification only with youtube or force-ssl', () => {
    expect(canModifyExistingVideo([...granted, 'https://www.googleapis.com/auth/youtube'])).toBe(true);
    expect(canModifyExistingVideo(['https://www.googleapis.com/auth/youtube.force-ssl'])).toBe(true);
  });
});

describe('categoryIdFor', () => {
  it('does not send every upload to Howto & Style', () => {
    expect(categoryIdFor('founder_insight')).toBe('28');
    expect(categoryIdFor('education')).toBe('27');
    expect(categoryIdFor('community')).toBe('22');
  });

  it('falls back to Howto & Style for recipe content', () => {
    expect(categoryIdFor('transformation')).toBe('26');
    expect(categoryIdFor(null)).toBe('26');
  });
});

describe('limitsFor', () => {
  it('gives the two variants different ceilings', () => {
    expect(limitsFor('short').maxSeconds).toBe(180);
    expect(limitsFor('long_form').maxSeconds).toBeGreaterThan(180);
  });
});

/**
 * §201. The audit gate needs a producer, and `capability_state` is it.
 *
 * These assert behaviour through the adapter rather than through the flag,
 * because the defect was precisely that the flag existed and nothing wrote it.
 */
describe('the compliance-audit gate has a producer', () => {
  const uploadStub = () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      // Only the metadata initiation carries JSON; the chunk PUT carries bytes.
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, body });

      // The adapter reads the asset bytes before it opens a session.
      if (url.includes('x.invalid')) return new Response(new Uint8Array(512), { status: 200 });
      if (url.includes('uploadType=resumable')) {
        return new Response('{}', { status: 200, headers: { location: 'https://up.invalid/session-1' } });
      }
      return new Response(JSON.stringify({ id: 'vid-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  };

  const asset = {
    id: 'a', publicUrl: 'https://x.invalid/v.mp4', mimeType: 'video/mp4',
    kind: 'video' as const, width: 1080, height: 1920, durationSeconds: 20,
  };
  const item = {
    id: 'i', platform: 'youtube' as const, format: 'video' as const,
    body: 'body', title: 'Title', hashtags: [],
  };

  const publishWith = async (capabilityState: string) => {
    const { getAdapter } = await import('../adapters/index.js');
    const { fetchImpl, calls } = uploadStub();
    await getAdapter('youtube').publish(item as never, [asset], {
      id: 'acct', platform: 'youtube', handle: '@h', platformUserId: 'c1',
      capabilityState,
      tokens: { accessToken: 't', refreshToken: null, expiresAt: null, scopes: [] },
      meta: { fetchImpl },
    } as never);
    const init = calls.find((c) => c.url.includes('uploadType=resumable'))!;
    return (init.body as { status: { privacyStatus: string } }).status.privacyStatus;
  };

  it('uploads private while the account is draft_only', async () => {
    expect(await publishWith('draft_only')).toBe('private');
  });

  /**
   * The regression that matters. Before §201 this returned `private` too,
   * because the only gate was a meta flag nothing in production ever set — so
   * passing the audit changed nothing.
   */
  it('uploads public once an operator marks the account live', async () => {
    expect(await publishWith('live')).toBe('public');
  });

  it('still refuses on any other state', async () => {
    expect(await publishWith('pending_auth')).toBe('private');
    expect(await publishWith('error')).toBe('private');
  });
});
