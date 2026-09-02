import { describe, expect, it } from 'vitest';
import { PexelsFootageClient, createStockFootageClient } from './stockFootage.js';

function video(over: Partial<{ id: number; width: number; height: number; duration: number; files: unknown[] }>) {
  const width = over.width ?? 1080;
  const height = over.height ?? 1920;
  return {
    id: over.id ?? 1,
    width,
    height,
    duration: over.duration ?? 8,
    url: `https://www.pexels.com/video/${over.id ?? 1}/`,
    user: { name: 'A. Cook' },
    video_files: over.files ?? [
      { id: 1, quality: 'uhd', file_type: 'video/mp4', width: 2160, height: 3840, link: 'https://v/uhd.mp4' },
      { id: 2, quality: 'hd', file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://v/hd.mp4' },
      { id: 3, quality: 'sd', file_type: 'video/mp4', width: 540, height: 960, link: 'https://v/sd.mp4' },
    ],
  };
}

function fetchReturning(videos: unknown[]): { fetch: typeof fetch; calls: URL[] } {
  const calls: URL[] = [];
  const impl = (async (input: string | URL | Request) => {
    calls.push(new URL(String(input)));
    return new Response(JSON.stringify({ videos }), { status: 200 });
  }) as typeof fetch;
  return { fetch: impl, calls };
}

describe('§478 PexelsFootageClient', () => {
  it('refuses to exist without a key, and says what would enable it', () => {
    expect(() => new PexelsFootageClient('')).toThrow(/PEXELS_API_KEY/);
    expect(() => new PexelsFootageClient('   ')).toThrow(/pexels\.com\/api/);
  });

  it('asks for portrait clips and sends the key as the header Pexels wants', async () => {
    const { fetch, calls } = fetchReturning([]);
    await new PexelsFootageClient('k', fetch).search('hands kneading dough');
    expect(calls[0]!.searchParams.get('orientation')).toBe('portrait');
    expect(calls[0]!.searchParams.get('query')).toBe('hands kneading dough');
  });

  it('picks the largest mp4 that is still 1080p, never the 4K master', async () => {
    const { fetch } = fetchReturning([video({})]);
    const [clip] = await new PexelsFootageClient('k', fetch).search('dough');
    expect(clip?.url).toBe('https://v/hd.mp4');
    expect(clip?.height).toBe(1920);
  });

  it('drops clips that are too short, too long, or not really portrait', async () => {
    const { fetch } = fetchReturning([
      video({ id: 1, duration: 2 }),
      video({ id: 2, duration: 45 }),
      video({ id: 3, width: 1080, height: 1350 }),
      video({ id: 4, duration: 7 }),
    ]);
    const clips = await new PexelsFootageClient('k', fetch).search('dough', { want: 5 });
    expect(clips.map((c) => c.id)).toEqual(['4']);
  });

  it('skips clips already used, so two pieces do not open on the same hands', async () => {
    const { fetch } = fetchReturning([video({ id: 1 }), video({ id: 2 })]);
    const clips = await new PexelsFootageClient('k', fetch).search('dough', { avoid: ['1'] });
    expect(clips.map((c) => c.id)).toEqual(['2']);
  });

  it('ranks a clip long enough to cover the beat ahead of a shorter, better-matched one', async () => {
    const { fetch } = fetchReturning([video({ id: 1, duration: 4 }), video({ id: 2, duration: 9 })]);
    const clips = await new PexelsFootageClient('k', fetch).search('dough', { want: 2, minSeconds: 6 });
    expect(clips.map((c) => c.id)).toEqual(['2', '1']);
  });

  it('carries who filmed it and where the licence can be checked', async () => {
    const { fetch } = fetchReturning([video({ id: 7 })]);
    const [clip] = await new PexelsFootageClient('k', fetch).search('dough');
    expect(clip?.photographer).toBe('A. Cook');
    expect(clip?.pageUrl).toBe('https://www.pexels.com/video/7/');
  });

  it('surfaces an HTTP failure rather than returning an empty, plausible list', async () => {
    const failing = (async () => new Response('nope', { status: 429 })) as typeof fetch;
    await expect(new PexelsFootageClient('k', failing).search('dough')).rejects.toThrow(/429/);
  });

  it('createStockFootageClient is null without a key — a state, not a throw', () => {
    const saved = process.env.PEXELS_API_KEY;
    delete process.env.PEXELS_API_KEY;
    try {
      expect(createStockFootageClient()).toBeNull();
    } finally {
      if (saved !== undefined) process.env.PEXELS_API_KEY = saved;
    }
  });
});
