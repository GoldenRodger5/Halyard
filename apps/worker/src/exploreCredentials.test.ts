import { describe, expect, it } from 'vitest';
import { credentialsForProduct } from './handlers/explore.js';

describe('product-specific Explorer credentials', () => {
  it('prefers the product account over the legacy global fallback', () => {
    const found = credentialsForProduct(
      { email: 'product@example.test', password: 'product-pass', loginPath: '/signin' },
      { EXPLORE_ACCOUNT_EMAIL: 'global@example.test', EXPLORE_ACCOUNT_PASSWORD: 'global-pass' },
    );
    expect(found).toEqual({
      email: 'product@example.test',
      password: 'product-pass',
      loginPath: '/signin',
    });
  });

  it('keeps the global pair as a compatibility fallback', () => {
    const found = credentialsForProduct(null, {
      EXPLORE_ACCOUNT_EMAIL: 'global@example.test',
      EXPLORE_ACCOUNT_PASSWORD: 'global-pass',
    });
    expect(found?.email).toBe('global@example.test');
  });

  it('refuses a half-configured credential instead of submitting an empty login', () => {
    expect(credentialsForProduct({ email: 'only@example.test' }, {})).toBeNull();
  });
});
