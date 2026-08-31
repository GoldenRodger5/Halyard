/**
 * §403. The two ways an embedding can lie.
 *
 * It can come back in the wrong order, which silently scores one idea's novelty
 * against another idea's topic — a wrong measurement wearing a right one's
 * clothes. Or it can be invented when the call failed, which is the thing this
 * codebase refuses everywhere else and must refuse here too: an unmeasured
 * novelty already has an honest answer, so there is nothing to gain by faking
 * a measured one.
 */
import { describe, expect, it, vi } from 'vitest';
import { OpenAIEmbeddingClient, ideaText, EMBEDDING_MODEL } from './embed.js';

function respond(body: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('OpenAIEmbeddingClient', () => {
  it('returns vectors in the order asked for, not the order they arrived', async () => {
    const fetchImpl = respond({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    });
    const client = new OpenAIEmbeddingClient('sk-test', fetchImpl);
    expect(await client.embed(['first', 'second'])).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('throws rather than returning a short or padded batch', async () => {
    const client = new OpenAIEmbeddingClient(
      'sk-test',
      respond({ data: [{ index: 0, embedding: [1, 0] }] }),
    );
    await expect(client.embed(['one', 'two'])).rejects.toThrow(/1 vectors for 2/);
  });

  it('throws on a provider error instead of inventing a vector', async () => {
    const client = new OpenAIEmbeddingClient('sk-test', respond({ error: 'nope' }, false, 429));
    await expect(client.embed(['x'])).rejects.toThrow(/429/);
  });

  it('makes no request at all for an empty batch', async () => {
    const fetchImpl = respond({ data: [] });
    expect(await new OpenAIEmbeddingClient('sk-test', fetchImpl).embed([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks for the model it documents', async () => {
    const fetchImpl = respond({ data: [{ index: 0, embedding: [1] }] });
    await new OpenAIEmbeddingClient('sk-test', fetchImpl).embed(['x']);
    const body = JSON.parse((fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]![1]!.body as string);
    expect(body.model).toBe(EMBEDDING_MODEL);
  });

  it('refuses to start without a key', () => {
    expect(() => new OpenAIEmbeddingClient('  ')).toThrow(/OPENAI_API_KEY/);
  });
});

describe('ideaText', () => {
  it('carries the angle, because a title alone is two different posts', () => {
    expect(ideaText({ title: 'Gluten, explained', angle: 'the chemistry' })).not.toBe(
      ideaText({ title: 'Gluten, explained', angle: 'the history' }),
    );
  });

  it('is just the title when there is no angle', () => {
    expect(ideaText({ title: 'Gluten', angle: null })).toBe('Gluten');
  });
});
