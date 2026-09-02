/**
 * §398. The failure this prevents actually happened.
 *
 * Three `generate` jobs died on *"Your credit balance is too low to access the
 * Anthropic API"* while a working OpenAI key sat in the same env file. The
 * provider was chosen once, on key *presence*, so a provider with a key and no
 * credits counted as available.
 */
import { describe, expect, it, vi } from 'vitest';
import { ProviderUnavailable, isProviderExhausted } from './provider.js';
import { FallbackLlmClient, type FallbackEntry, worthFallingBackOn } from './fallback.js';
import type { LlmClient, LlmResponse } from './llm.js';

const answered = (name: string): LlmResponse =>
  ({ text: name, model: name, inputTokens: 1, outputTokens: 1, costUsd: 0 }) as LlmResponse;

const ok = (name: string): LlmClient => ({ complete: async () => answered(name) });
const fails = (message: string): LlmClient => ({
  complete: async () => {
    throw new Error(message);
  },
});

const entry = (name: string, client: LlmClient) => ({ name, client, modelFor: (m?: string) => m });

describe('what is worth falling back on', () => {
  it('falls back when the provider cannot serve anyone', () => {
    for (const message of [
      'Your credit balance is too low to access the Anthropic API',
      '429 insufficient_quota: You exceeded your current quota',
      'Rate limit reached for requests',
      'Overloaded',
      '503 Service Unavailable',
      'fetch failed',
      'socket hang up',
      '401 invalid_api_key',
    ]) {
      expect(worthFallingBackOn(new Error(message)), message).toBe(true);
    }
  });

  it('does not fall back on a failure about this request', () => {
    /*
     * The next provider fails identically, so retrying turns one clear error
     * into two confusing ones and doubles the bill.
     */
    for (const message of [
      'context_length_exceeded: this model supports 200000 tokens',
      'Invalid schema: expected object, received string',
      'The model refused to answer',
      'model_not_found: no such model',
    ]) {
      expect(worthFallingBackOn(new Error(message)), message).toBe(false);
    }
  });
});

describe('falling back', () => {
  it('uses the first provider when it works', async () => {
    const client = new FallbackLlmClient([entry('anthropic', ok('anthropic'))]);
    expect((await client.complete({ messages: [] } as never)).text).toBe('anthropic');
  });

  it('reaches the second when the first has no credits', async () => {
    /* The exact failure that killed three jobs. */
    const client = new FallbackLlmClient([
      entry('anthropic', fails('Your credit balance is too low to access the Anthropic API')),
      entry('openai', ok('openai')),
    ]);
    expect((await client.complete({ messages: [] } as never)).text).toBe('openai');
  });

  it('says which provider it fell back to, and why', async () => {
    /*
     * "Which model wrote this" is the first question asked when output quality
     * moves, so a silent fallback is worse than none.
     */
    const onFallback = vi.fn();
    const client = new FallbackLlmClient(
      [entry('anthropic', fails('429 rate limit')), entry('openai', ok('openai'))],
      onFallback,
    );
    await client.complete({ messages: [] } as never);
    expect(onFallback).toHaveBeenCalledOnce();
    const [from, to, because] = onFallback.mock.calls[0]!;
    expect(from).toBe('anthropic');
    expect(to).toBe('openai');
    expect(because).toContain('rate limit');
  });

  it('does not fall back on a bad request, and reports the real error', async () => {
    const second = vi.fn();
    const client = new FallbackLlmClient([
      entry('anthropic', fails('context_length_exceeded')),
      entry('openai', { complete: second as never }),
    ]);
    await expect(client.complete({ messages: [] } as never)).rejects.toThrow(
      'context_length_exceeded',
    );
    expect(second, 'a bad request must not be sent twice').not.toHaveBeenCalled();
  });

  it('throws the last error when every provider is down', async () => {
    const client = new FallbackLlmClient([
      entry('anthropic', fails('429 rate limit')),
      entry('openai', fails('insufficient_quota')),
    ]);
    await expect(client.complete({ messages: [] } as never)).rejects.toThrow('insufficient_quota');
  });

  it('refuses to exist with no providers', () => {
    /* Silently answering nothing would be worse than failing at construction. */
    expect(() => new FallbackLlmClient([])).toThrow();
  });
});

describe('falling back is a provider choice, never a quality one', () => {
  it('never invents a response when every provider is down', async () => {
    /*
     * The production rule: better to fail than to serve something fabricated.
     * A fallback that returned a placeholder would be worse than the error,
     * because a placeholder reaches a feed and an error does not.
     */
    const client = new FallbackLlmClient([
      entry('anthropic', fails('insufficient_quota')),
      entry('openai', fails('insufficient_quota')),
    ]);
    await expect(client.complete({ messages: [] } as never)).rejects.toThrow();
  });
});

describe('§493 every provider refused on account grounds', () => {
  const refusing = (name: string, status: number, message: string): FallbackEntry => ({
    name,
    client: { complete: async () => { throw new ProviderUnavailable(name, status, message, true); } },
    modelFor: (m) => m,
  });
  const request = { system: 's', messages: [], promptVersion: 'v' };

  it('raises one exhausted error naming both, so the poller stops retrying', async () => {
    const client = new FallbackLlmClient([
      refusing('openai', 429, 'You have no credits remaining'),
      refusing('anthropic', 400, 'Your credit balance is too low'),
    ]);
    const err = await client.complete(request).catch((e: unknown) => e);
    expect(isProviderExhausted(err)).toBe(true);
    expect((err as Error).message).toMatch(/openai and anthropic/);
    expect((err as Error).message).toMatch(/Fund one/);
  });

  it('still surfaces a plain failure from the last provider as itself', async () => {
    const client = new FallbackLlmClient([
      refusing('openai', 429, 'You have no credits remaining'),
      { name: 'anthropic', client: { complete: async () => { throw new Error('overloaded'); } }, modelFor: (m) => m },
    ]);
    const err = await client.complete(request).catch((e: unknown) => e);
    expect(isProviderExhausted(err)).toBe(false);
    expect((err as Error).message).toBe('overloaded');
  });
});
