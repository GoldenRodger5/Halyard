import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderUnavailable } from '@halyard/core';

const generated: string[] = [];
let failOn = -1;
let exhausted = true;
vi.mock('./heroImage.js', () => ({
  generateHeroImage: vi.fn(async (_ctx: unknown, _client: unknown, req: { subject: string }) => {
    if (generated.length === failOn) {
      throw exhausted
        ? new ProviderUnavailable('openai-image', 429, 'You have no credits remaining', true)
        : new ProviderUnavailable('openai-image', 503, 'down', false);
    }
    generated.push(req.subject);
    return { assetId: `a${generated.length}`, bytes: Buffer.alloc(0), mimeType: 'image/png', costUsd: 0 };
  }),
}));
vi.mock('./shotRecency.js', () => ({ recentShots: vi.fn(async () => []) }));
vi.mock('@halyard/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@halyard/core')>();
  return { ...actual, photographicSubject: vi.fn(async ({ line }: { line: string }) => ({ subject: line, reason: '' })) };
});

const { photographBeats } = await import('./beatPhotographs.js');

const ctx = { pool: {}, log: () => undefined } as never;
const llm = {} as never;
const beats = ['parsley in a jar', 'stems on a board', 'leaves on a towel', 'a bag over a jar'].map((text) => ({ text }));
const input = { productId: 'p', contentItemId: 'c', format: 'tips', fallbackSubject: 'herbs', beats };

beforeEach(() => {
  generated.splice(0);
  failOn = -1;
  exhausted = true;
});

describe('§491 photographBeats and a provider that cannot pay', () => {
  it('stops at the refusal, asks no more, and says so', async () => {
    failOn = 2;
    const result = await photographBeats(ctx, {} as never, llm, input);
    expect(generated).toHaveLength(2);
    expect(result.providerExhausted).toMatch(/no credits/);
    expect(result.photographs.map((p) => p.assetId)).toEqual(['a1', 'a2', null, null]);
  });

  it('a transient provider failure is not the account, and still surfaces', async () => {
    failOn = 1;
    exhausted = false;
    await expect(photographBeats(ctx, {} as never, llm, input)).rejects.toThrow(/503/);
  });

  it('photographs everything when nothing refuses', async () => {
    const result = await photographBeats(ctx, {} as never, llm, input);
    expect(result.providerExhausted).toBeNull();
    expect(result.photographs.every((p) => p.assetId)).toBe(true);
  });
});
