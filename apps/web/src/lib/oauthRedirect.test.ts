/**
 * The redirect base, which broke the X handshake on a fresh clone.
 *
 * `.env.example` ships `OAUTH_REDIRECT_BASE_URL=` with an inline comment.
 * dotenv parses that to `''`, and `??` does not fall back on an empty string —
 * so the redirect URI came out relative and every provider rejected it before
 * consent. These pin the behaviour so it cannot regress silently.
 */
import { describe, expect, it } from 'vitest';
import { callbackUrl, resolveRedirectBase } from './oauthRedirect';

const ORIGIN = 'http://localhost:3200';

describe('resolving the OAuth redirect base', () => {
  it('falls back to the request origin when the variable is an empty string', () => {
    // The exact defect: `??` kept '' and produced a relative redirect_uri.
    expect(resolveRedirectBase('', ORIGIN)).toBe(ORIGIN);
  });

  it('falls back when the variable is only whitespace', () => {
    expect(resolveRedirectBase('   ', ORIGIN)).toBe(ORIGIN);
  });

  it('falls back when the variable is undefined', () => {
    expect(resolveRedirectBase(undefined, ORIGIN)).toBe(ORIGIN);
  });

  it('uses a configured base when there is one', () => {
    expect(resolveRedirectBase('https://halyard.example.com', ORIGIN)).toBe(
      'https://halyard.example.com',
    );
  });

  it('strips a trailing slash, because providers match the URI exactly', () => {
    expect(resolveRedirectBase('https://halyard.example.com/', ORIGIN)).toBe(
      'https://halyard.example.com',
    );
    expect(resolveRedirectBase('https://halyard.example.com///', ORIGIN)).toBe(
      'https://halyard.example.com',
    );
  });

  it('always produces an absolute callback URL', () => {
    for (const configured of ['', '   ', undefined, ORIGIN, `${ORIGIN}/`]) {
      const url = callbackUrl(configured, ORIGIN, 'x');
      expect(url.startsWith('http'), String(configured)).toBe(true);
      expect(url).toBe('http://localhost:3200/api/oauth/x/callback');
    }
  });

  it('never emits a double slash before the path', () => {
    expect(callbackUrl('https://a.test/', ORIGIN, 'x')).toBe('https://a.test/api/oauth/x/callback');
  });
});
