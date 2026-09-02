import { describe, expect, it } from 'vitest';
import { isProviderExhausted, providerRefusal, refusalIsExhausted } from './provider.js';

describe('§491 telling a dead account from a bad moment', () => {
  it('a 429 that names credits or quota is the account', () => {
    expect(refusalIsExhausted(429, '{"error":{"message":"You have no credits remaining."}}')).toBe(true);
    expect(refusalIsExhausted(429, 'insufficient_quota')).toBe(true);
  });
  it('a 429 that is only rate limiting is the moment', () => {
    expect(refusalIsExhausted(429, 'Rate limit reached for requests, please try again in 20s')).toBe(false);
  });
  it('auth and payment statuses are the account whatever the body says', () => {
    for (const status of [401, 402, 403]) expect(refusalIsExhausted(status, '')).toBe(true);
  });
  it('server trouble is the moment', () => {
    for (const status of [500, 502, 503, 504]) expect(refusalIsExhausted(status, 'oops')).toBe(false);
  });
  it('carries the verdict on the error, and the guard is safe on anything', () => {
    const dead = providerRefusal('openai-image', 429, 'You have no credits remaining');
    expect(isProviderExhausted(dead)).toBe(true);
    expect(dead.message).toMatch(/openai-image 429/);
    expect(isProviderExhausted(providerRefusal('openai-image', 503, 'down'))).toBe(false);
    expect(isProviderExhausted(new Error('x'))).toBe(false);
    expect(isProviderExhausted(null)).toBe(false);
  });
});
