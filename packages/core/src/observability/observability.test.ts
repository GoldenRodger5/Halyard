/**
 * Redaction, which is the only part of the error reporter that matters.
 *
 * `scrubEvent` runs in Sentry's `beforeSend`, so it is the last thing between
 * an exception and a third-party service. Everything here asserts an absence:
 * the value must not survive.
 */
import { describe, expect, it } from 'vitest';
import { scrubEvent, scrubString } from './sentry.js';

/**
 * Credentials carried in a URL query string.
 *
 * `SENSITIVE_KEY` inspects object keys; the value patterns match credentials
 * with a recognisable shape. Neither saw `?access_token=EAAGm0PX…`, and the
 * Instagram adapter puts exactly that in the URL of every GET it makes — Meta's
 * Graph API takes the token as a query parameter rather than a header.
 *
 * A Meta token is a long opaque string with no prefix, so nothing matched it.
 * Any path putting such a URL into an error chain would have sent a live
 * credential to Sentry in the clear.
 */
describe('credentials in URLs', () => {
  const TOKEN = 'EAAGm0PX4ZCpsBO1234567890abcdefghijklmnopqrstuv';

  it('redacts a Meta access token from a Graph URL', () => {
    const out = scrubString(
      `Instagram GET failed https://graph.facebook.com/v21.0/me/permissions?access_token=${TOKEN}`,
    );
    expect(out).not.toContain(TOKEN);
    // The parameter name survives, so a reader still knows what was removed.
    expect(out).toContain('access_token=[redacted]');
  });

  it('redacts an OAuth authorization code and verifier', () => {
    // An authorization code is single-use but exchangeable until it is used —
    // a code in a log is a live credential for as long as it is unredeemed.
    const out = scrubString(
      'callback https://halyard.app/api/oauth/x/callback?code=abc123def456&state=xyz&code_verifier=v-9876543210',
    );
    expect(out).not.toContain('abc123def456');
    expect(out).not.toContain('v-9876543210');
    // `state` is not a credential and stays, because over-redaction costs
    // debuggability too.
    expect(out).toContain('state=xyz');
  });

  it('redacts a client secret and stops at the parameter boundary', () => {
    const out = scrubString('POST /token?client_secret=s3cr3tvalue&grant_type=refresh_token');
    expect(out).not.toContain('s3cr3tvalue');
    // Only the value goes; the next parameter is intact.
    expect(out).toContain('grant_type=refresh_token');
  });

  it('redacts through a nested error object, not only a bare string', () => {
    const scrubbed = scrubEvent({
      message: 'request failed',
      cause: { url: `https://graph.facebook.com/v21.0/17841400000000000/media?access_token=${TOKEN}` },
    });
    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
  });

  it('leaves an ordinary URL alone', () => {
    const url = 'https://recipefix.app/recipes/gluten-free-bread?utm_source=x&page=2';
    expect(scrubString(url)).toBe(url);
  });

  it('still redacts everything it did before', () => {
    // The pre-existing patterns are untouched by the addition.
    expect(scrubString('Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toContain(
      '[redacted bearer]',
    );
    expect(scrubString('postgres://user:pw@host:5432/db')).toContain('[redacted database url]');
  });
});
