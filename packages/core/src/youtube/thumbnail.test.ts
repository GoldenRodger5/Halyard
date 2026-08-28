import { describe, expect, it } from 'vitest';
import {
  checkThumbnail,
  FEED_RENDER_WIDTH,
  MAX_THUMBNAIL_WORDS,
  MIN_CANVAS_TEXT_PX,
  MIN_FEED_TEXT_PX,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_WIDTH,
  thumbnailFontSize,
  thumbnailPasses,
  thumbnailTextFrom,
} from './thumbnail.js';

const ok = {
  overlayText: 'Why gluten-free bread fails',
  fontSizePx: 150,
  width: THUMBNAIL_WIDTH,
  height: THUMBNAIL_HEIGHT,
  byteLength: 40_000,
};

describe('the legible size is derived, not chosen', () => {
  it('scales the feed minimum up to the canvas', () => {
    // The one piece of arithmetic the whole module rests on: a thumbnail is
    // served at 1280 and drawn at ~360, so canvas px are worth 28% of what
    // they look like.
    expect(MIN_CANVAS_TEXT_PX).toBe(
      Math.ceil(MIN_FEED_TEXT_PX * (THUMBNAIL_WIDTH / FEED_RENDER_WIDTH)),
    );
    expect(MIN_CANVAS_TEXT_PX).toBeGreaterThan(MIN_FEED_TEXT_PX);
  });

  it('gives fewer words more room', () => {
    expect(thumbnailFontSize('Two words')).toBeGreaterThan(thumbnailFontSize('One two three four'));
    expect(thumbnailFontSize('One two three four')).toBeGreaterThan(
      thumbnailFontSize('One two three four five six'),
    );
  });

  it('never sizes below the legible minimum', () => {
    for (const text of ['a', 'one two', 'one two three four five six']) {
      expect(thumbnailFontSize(text)).toBeGreaterThanOrEqual(MIN_CANVAS_TEXT_PX);
    }
  });
});

describe('checkThumbnail', () => {
  it('passes a thumbnail sized for the feed it appears in', () => {
    expect(checkThumbnail(ok)).toEqual([]);
    expect(thumbnailPasses(checkThumbnail(ok))).toBe(true);
  });

  it('fails text that is legible on the canvas and not in a feed', () => {
    /*
     * The defect the module exists for. 40px looks perfectly readable on a
     * 1280px canvas and is 11px where anyone sees it — and it uploads exactly
     * as successfully as a good one.
     */
    const issues = checkThumbnail({ ...ok, fontSizePx: 40 });
    expect(issues.map((i) => i.rule)).toContain('thumbnail.text_too_small');
    expect(thumbnailPasses(issues)).toBe(false);
    expect(issues[0]!.detail).toContain(String(MIN_FEED_TEXT_PX));
  });

  it(`fails more than ${MAX_THUMBNAIL_WORDS} words`, () => {
    const issues = checkThumbnail({
      ...ok,
      overlayText: 'This is a great deal too many words for one thumbnail',
    });
    expect(issues.map((i) => i.rule)).toContain('thumbnail.too_many_words');
    expect(thumbnailPasses(issues)).toBe(false);
  });

  it('fails bytes the API will reject', () => {
    const issues = checkThumbnail({ ...ok, byteLength: THUMBNAIL_MAX_BYTES + 1 });
    expect(issues.map((i) => i.rule)).toContain('thumbnail.too_large');
    expect(thumbnailPasses(issues)).toBe(false);
  });

  it('warns on a 16:9 canvas of the wrong size, and fails a wrong ratio', () => {
    // 1920x1080 is the right shape and the wrong picture — recoverable by
    // resampling. 1080x1080 is neither.
    expect(checkThumbnail({ ...ok, width: 1920, height: 1080 })[0]!.severity).toBe('warn');
    expect(checkThumbnail({ ...ok, width: 1080, height: 1080 })[0]!.severity).toBe('fail');
  });

  it('warns rather than fails on no text at all', () => {
    // An image-only thumbnail is a defensible choice; it just leans entirely
    // on the title, so it is worth saying out loud.
    const issues = checkThumbnail({ ...ok, overlayText: '   ' });
    expect(issues.map((i) => i.rule)).toContain('thumbnail.no_text');
    expect(thumbnailPasses(issues)).toBe(true);
  });
});

describe('setThumbnail', () => {
  /*
   * §224. The scope gate, exercised against the grant the connected channel
   * actually holds. Halyard requests youtube.upload, youtube.readonly and
   * yt-analytics.readonly; thumbnails.set needs youtube or youtube.force-ssl.
   * So this is not a hypothetical branch — it is the only branch that runs
   * today, and it must not spend a request to find that out.
   */
  const granted = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ];

  function accountWith(scopes: string[], fetchImpl: typeof fetch) {
    return {
      id: 'a',
      platform: 'youtube' as const,
      handle: '@recipefix',
      capabilityState: 'live' as const,
      tokens: { accessToken: 'token', scopes },
      meta: { fetchImpl },
    };
  }

  it('refuses without spending a request, and names the scope', async () => {
    const { YouTubeAdapter } = await import('../adapters/youtube.js');
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await new YouTubeAdapter().setThumbnail(
      'abc',
      accountWith(granted, fetchImpl),
      { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
    );

    expect(result.set).toBe(false);
    expect(result.reason).toContain('youtube.force-ssl');
    // The point: no 403 to read in a log, because no request was made.
    expect(called).toBe(0);
  });

  it('uploads when the grant is actually there', async () => {
    const { YouTubeAdapter } = await import('../adapters/youtube.js');
    let url = '';
    const fetchImpl = (async (u: string) => {
      url = String(u);
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const result = await new YouTubeAdapter().setThumbnail(
      'abc',
      accountWith([...granted, 'https://www.googleapis.com/auth/youtube.force-ssl'], fetchImpl),
      { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
    );

    expect(result.set).toBe(true);
    expect(url).toContain('thumbnails/set');
    expect(url).toContain('videoId=abc');
  });

  it('refuses oversized bytes even with the grant', async () => {
    const { YouTubeAdapter } = await import('../adapters/youtube.js');
    const fetchImpl = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const result = await new YouTubeAdapter().setThumbnail(
      'abc',
      accountWith([...granted, 'https://www.googleapis.com/auth/youtube'], fetchImpl),
      { bytes: new Uint8Array(THUMBNAIL_MAX_BYTES + 1), mimeType: 'image/png' },
    );
    expect(result.set).toBe(false);
    expect(result.reason).toContain('2 MB');
  });
});

describe('thumbnailTextFrom', () => {
  it('takes the hook when it already fits', () => {
    const r = thumbnailTextFrom({ hook: 'Why gluten-free bread fails' });
    expect(r).toEqual({ text: 'Why gluten-free bread fails', source: 'hook' });
  });

  it('falls back to a clause the writer chose, not a cut at six words', () => {
    /*
     * The whole reason this is not a truncation. Cutting at six words gives
     * "Everyone blames the flour, and they" — a sentence stopped mid-thought,
     * which reads as a bug rather than a headline.
     */
    const r = thumbnailTextFrom({
      hook: 'Everyone blames the flour, and they are wrong about all of it',
    });
    expect(r).toEqual({ text: 'Everyone blames the flour', source: 'hook_clause' });
  });

  it('refuses rather than emitting half a sentence', () => {
    const r = thumbnailTextFrom({
      hook: 'There is one reason gluten free bread never holds together properly',
      title: 'A very long title that also will not fit in six words at all',
    });
    expect(r.text).toBeNull();
    expect((r as { reason: string }).reason).toContain(String(MAX_THUMBNAIL_WORDS));
  });

  it('says so when the concept carries nothing at all', () => {
    const r = thumbnailTextFrom({});
    expect(r.text).toBeNull();
    expect((r as { reason: string }).reason).toContain('neither a hook nor a title');
  });

  it('produces text the checker then passes', () => {
    // The two halves have to agree: a line this function returns must survive
    // the gate, or one of them is wrong.
    const r = thumbnailTextFrom({ hook: 'Why gluten-free bread fails' }) as { text: string };
    expect(
      thumbnailPasses(
        checkThumbnail({
          overlayText: r.text,
          fontSizePx: thumbnailFontSize(r.text),
          width: THUMBNAIL_WIDTH,
          height: THUMBNAIL_HEIGHT,
          byteLength: 40_000,
        }),
      ),
    ).toBe(true);
  });
});
