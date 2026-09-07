import { describe, expect, it } from 'vitest';
import { connectionView, type ConnectionInput } from './connection.js';

const base: ConnectionInput = {
  platform: 'instagram',
  handle: '@recipe.fix',
  capabilityState: 'draft_only',
  hasToken: true,
  identityConfirmedAt: '2026-08-01T00:00:00Z',
  tokenExpiresAt: '2027-01-01T00:00:00Z',
  lastError: null,
  credentialsConfigured: true,
  credentialEnvNames: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
  requiresPlatformReview: true,
  publishingEnabled: true,
};

describe('§497 what one connection row says and offers', () => {
  it('a healthy reviewed account can post publicly and offers a reconnect', () => {
    const view = connectionView({
      ...base,
      capabilityState: 'live',
      requiresPlatformReview: false,
    });
    expect(view.state).toBe('connected');
    expect(view.headline).toMatch(/post publicly/);
    expect(view.action).toBe('reconnect');
    expect(view.canDisconnect).toBe(true);
  });

  it('a connected account behind a review says drafts only, and why', () => {
    const view = connectionView(base);
    expect(view.state).toBe('limited');
    expect(view.headline).toMatch(/Drafts only/);
    expect(view.detail).toMatch(/review/i);
  });

  it('an unconnected platform offers Connect, with nothing else in the way', () => {
    const view = connectionView({ ...base, hasToken: false, capabilityState: 'draft_only' });
    expect(view.state).toBe('not_connected');
    expect(view.action).toBe('connect');
    expect(view.actionLabel).toBe('Connect');
    expect(view.canTest).toBe(false);
    expect(view.canDisconnect).toBe(false);
  });

  it('gotcha 5: marked live with no credential says a review is not a connection', () => {
    const view = connectionView({ ...base, hasToken: false, capabilityState: 'live' });
    expect(view.state).toBe('not_connected');
    expect(view.detail).toMatch(/review is not a connection/);
  });

  it('an expired credential asks to reconnect and says nothing works until then', () => {
    const view = connectionView({ ...base, tokenExpiresAt: '2020-01-01T00:00:00Z' });
    expect(view.state).toBe('broken');
    expect(view.action).toBe('reconnect');
    expect(view.detail).toMatch(/until it is reconnected/);
  });

  it('a failing account shows the platform’s own words', () => {
    const view = connectionView({ ...base, lastError: 'Blotato said the token was revoked.' });
    expect(view.state).toBe('broken');
    expect(view.detail).toBe('Blotato said the token was revoked.');
  });

  it('no developer app names the variables instead of offering a dead button', () => {
    const view = connectionView({ ...base, hasToken: false, credentialsConfigured: false });
    expect(view.state).toBe('unavailable');
    expect(view.action).toBe('register_app');
    expect(view.detail).toMatch(/INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET/);
  });

  it('bluesky takes an app password rather than an OAuth round trip', () => {
    const view = connectionView({
      ...base,
      platform: 'bluesky',
      hasToken: false,
      credentialsConfigured: false,
      usesAppPassword: true,
    });
    expect(view.action).toBe('app_password');
    expect(view.actionLabel).toMatch(/app password/i);
  });
});

/**
 * §531. An expired access token is not, by itself, anybody's problem.
 *
 * X issues a two-hour access token by design and a refresh token behind it that
 * lives six months. So an expired access token is the *normal* state between
 * refreshes — and this screen said "The credential has expired. Nothing can be
 * read or published until it is reconnected", which is how a working system
 * teaches an operator to do pointless work every few hours.
 */
describe('§531 an expired token that renews itself', () => {
  const base = {
    platform: 'X',
    handle: '@Recipe_Fix',
    capabilityState: 'live',
    hasToken: true,
    identityConfirmedAt: new Date().toISOString(),
    tokenExpiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    lastError: null,
    credentialsConfigured: true,
    credentialEnvNames: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    requiresPlatformReview: false,
    publishingEnabled: true,
  };

  it('reads as a state, not a request, while a refresh token is held', () => {
    const view = connectionView({ ...base, hasRefreshToken: true, refreshFailures: 0 });
    expect(view.state).not.toBe('broken');
    expect(view.headline).toBe('Between refreshes.');
    expect(view.detail).toContain('Nothing for you to do');
  });

  it('still lets an impatient operator reconnect by hand', () => {
    const view = connectionView({ ...base, hasRefreshToken: true, refreshFailures: 0 });
    expect(view.action).toBe('reconnect');
    expect(view.canDisconnect).toBe(true);
  });

  it('becomes the operator’s problem once the retries are spent', () => {
    const view = connectionView({ ...base, hasRefreshToken: true, refreshFailures: 6 });
    expect(view.state).toBe('broken');
    expect(view.headline).toContain('failed too many times');
    expect(view.detail).toContain('needs a round trip');
  });

  it('is broken immediately when nothing can renew it', () => {
    /* No refresh token: expiry really is the end of the line. */
    const view = connectionView({ ...base, hasRefreshToken: false });
    expect(view.state).toBe('broken');
    expect(view.headline).toBe('The credential has expired.');
  });

  it('defaults to the old behaviour when the caller says nothing', () => {
    /* An absent `hasRefreshToken` must not quietly claim an account renews. */
    const view = connectionView(base);
    expect(view.state).toBe('broken');
  });
});
