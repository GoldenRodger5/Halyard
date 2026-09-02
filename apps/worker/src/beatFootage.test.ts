import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockClip, StockFootageClient } from '@halyard/core';

const uploads: unknown[] = [];
vi.mock('./storage.js', () => ({
  uploadAsset: vi.fn(async (_ctx: unknown, input: unknown) => {
    uploads.push(input);
    return { id: `asset-${uploads.length}`, storagePath: 'footage/x.mp4', publicUrl: null };
  }),
}));
vi.mock('@halyard/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@halyard/core')>();
  return {
    ...actual,
    photographicSubject: vi.fn(async ({ line }: { line: string }) => ({
      subject: line.includes('nothing') ? null : `hands with ${line.split(' ')[0]}`,
      reason: '',
    })),
  };
});

const { footageForBeats, namesTheProduct, beatsToFilm, MAX_FOOTAGE_BEATS } = await import('./beatFootage.js');

function clip(id: string, seconds = 8): StockClip {
  return {
    id,
    url: `https://v/${id}.mp4`,
    width: 1080,
    height: 1920,
    durationSeconds: seconds,
    photographer: 'A. Cook',
    pageUrl: `https://www.pexels.com/video/${id}/`,
  };
}

function ctxWith(recentTags: string[][]) {
  const logs: Array<[string, unknown]> = [];
  return {
    ctx: {
      pool: { query: vi.fn(async () => ({ rows: recentTags.map((tags) => ({ tags })) })) },
      log: (m: string, d?: unknown) => logs.push([m, d]),
    } as never,
    logs,
  };
}

function clientReturning(clips: StockClip[]) {
  const searches: Array<[string, unknown]> = [];
  const client: StockFootageClient = {
    search: vi.fn(async (subject: string, options?: unknown) => {
      searches.push([subject, options]);
      return clips;
    }),
  };
  return { client, searches };
}

const okFetch = (async () =>
  new Response(Buffer.from('mp4bytes'), {
    status: 200,
    headers: { 'content-length': '8' },
  })) as typeof fetch;

const llm = {} as never;
const base = { productId: 'p', contentItemId: 'c', productName: 'RecipeFix' };

beforeEach(() => uploads.splice(0));

describe('§478 footageForBeats', () => {
  it('is all stills with a reason when no source is configured', async () => {
    const { ctx } = ctxWith([]);
    const out = await footageForBeats(ctx, null, llm, { ...base, beats: [{ text: 'x' }] });
    expect(out[0]).toMatchObject({ assetId: null, reason: /no footage source/ });
  });

  it("searches for the screenplay's subject, prefers a clip that covers the beat, and stores it as licensed", async () => {
    const { ctx } = ctxWith([]);
    const { client, searches } = clientReturning([clip('41', 9)]);
    const out = await footageForBeats(
      ctx,
      client,
      llm,
      { ...base, beats: [{ text: 'Knead it for ten minutes', subject: 'hands kneading dough', seconds: 5.5 }] },
      okFetch,
    );
    expect(searches[0]![0]).toBe('hands kneading dough');
    expect(searches[0]![1]).toMatchObject({ minSeconds: 5.5 });
    expect(out[0]).toMatchObject({ assetId: 'asset-1', clipId: '41', seconds: 9, reason: null });
    expect(uploads[0]).toMatchObject({
      kind: 'broll',
      mimeType: 'video/mp4',
      source: 'licensed',
      subject: 'hands kneading dough',
      sourceUrl: 'https://www.pexels.com/video/41/',
      tags: ['stock-footage', 'pexels:41'],
    });
  });

  it('refuses a subject that is the product, in code, whatever the screenplay said', async () => {
    const { ctx } = ctxWith([]);
    const { client, searches } = clientReturning([clip('1')]);
    const out = await footageForBeats(
      ctx,
      client,
      llm,
      { ...base, beats: [{ text: 'Open RecipeFix', subject: 'RecipeFix on a phone' }] },
      okFetch,
    );
    expect(searches).toHaveLength(0);
    expect(out[0]!.reason).toMatch(/the product/);
    expect(uploads).toHaveLength(0);
  });

  it('avoids clips this product has already used, and the ones chosen earlier in the piece', async () => {
    const { ctx } = ctxWith([['stock-footage', 'pexels:9'], ['other']]);
    const { client, searches } = clientReturning([clip('2')]);
    await footageForBeats(
      ctx,
      client,
      llm,
      { ...base, beats: [{ text: 'a', subject: 'flour' }, { text: 'b', subject: 'butter' }] },
      okFetch,
    );
    expect((searches[0]![1] as { avoid: string[] }).avoid).toEqual(['9']);
    expect((searches[1]![1] as { avoid: string[] }).avoid).toEqual(['2', '9']);
  });

  it('falls back to the subject agent when the screenplay gave none, and declines an unfilmable line', async () => {
    const { ctx } = ctxWith([]);
    const { client, searches } = clientReturning([clip('3')]);
    const out = await footageForBeats(
      ctx,
      client,
      llm,
      { ...base, beats: [{ text: 'Butter melts first' }, { text: 'nothing here is a thing' }] },
      okFetch,
    );
    expect(searches[0]![0]).toBe('hands with Butter');
    expect(out[1]).toMatchObject({ assetId: null, reason: /nothing that could be filmed/ });
  });

  it('keeps a still, with the reason, when the download is over the cap or fails', async () => {
    const { ctx } = ctxWith([]);
    const { client } = clientReturning([clip('4')]);
    const huge = (async () =>
      new Response('x', { status: 200, headers: { 'content-length': String(80 * 1024 * 1024) } })) as typeof fetch;
    const out = await footageForBeats(ctx, client, llm, { ...base, beats: [{ text: 'a', subject: 'flour' }] }, huge);
    expect(out[0]!.reason).toMatch(/over the .* cap/);
    const broken = (async () => new Response('x', { status: 503 })) as typeof fetch;
    const out2 = await footageForBeats(ctx, client, llm, { ...base, beats: [{ text: 'a', subject: 'flour' }] }, broken);
    expect(out2[0]!.reason).toMatch(/503/);
    expect(uploads).toHaveLength(0);
  });

  it('caps the number of clips and says so for the beats past it', async () => {
    const { ctx } = ctxWith([]);
    const { client } = clientReturning([clip('5')]);
    const beats = Array.from({ length: MAX_FOOTAGE_BEATS + 2 }, (_, i) => ({ text: `b${i}`, subject: 'flour' }));
    const out = await footageForBeats(ctx, client, llm, { ...base, beats }, okFetch);
    expect(out.filter((f) => f.assetId)).toHaveLength(MAX_FOOTAGE_BEATS);
    expect(out.filter((f) => !f.assetId).every((f) => /cap/.test(f.reason ?? ''))).toBe(true);
  });

  it('§503: the opening always moves, and the rest are spread rather than front-loaded', async () => {
    const { ctx } = ctxWith([]);
    const { client } = clientReturning([clip('6')]);
    const beats = Array.from({ length: 8 }, (_, i) => ({ text: `b${i}`, subject: 'flour' }));
    const out = await footageForBeats(ctx, client, llm, { ...base, beats }, okFetch);
    const filmed = out.map((f, i) => (f.assetId ? i : -1)).filter((i) => i >= 0);

    expect(filmed[0]).toBe(0);
    expect(filmed).toHaveLength(MAX_FOOTAGE_BEATS);
    /* Not the first four in a row — something later in the piece moves too. */
    expect(filmed.at(-1)).toBeGreaterThan(MAX_FOOTAGE_BEATS);
  });
});

describe('§503 beatsToFilm', () => {
  it('films everything when the piece is within the cap', () => {
    expect(beatsToFilm(3, 4)).toEqual([0, 1, 2]);
    expect(beatsToFilm(4, 4)).toEqual([0, 1, 2, 3]);
  });
  it('opens on motion and spreads the rest to the end', () => {
    expect(beatsToFilm(8, 4)).toEqual([0, 2, 5, 7]);
    expect(beatsToFilm(6, 3)).toEqual([0, 3, 5]);
  });
  it('is deterministic and never exceeds the cap', () => {
    for (const n of [5, 7, 9, 12, 20]) {
      const first = beatsToFilm(n);
      expect(first).toEqual(beatsToFilm(n));
      expect(first.length).toBeLessThanOrEqual(MAX_FOOTAGE_BEATS);
      expect(Math.max(...first)).toBeLessThan(n);
    }
  });
  it('has nothing to film when there are no beats', () => {
    expect(beatsToFilm(0)).toEqual([]);
  });
});

describe('namesTheProduct', () => {
  it('catches the product by name and the screen by any name', () => {
    expect(namesTheProduct('recipefix on a phone', 'RecipeFix')).toBe(true);
    expect(namesTheProduct('a screenshot of the recipe', 'RecipeFix')).toBe(true);
    expect(namesTheProduct('hands kneading dough', 'RecipeFix')).toBe(false);
  });
});
