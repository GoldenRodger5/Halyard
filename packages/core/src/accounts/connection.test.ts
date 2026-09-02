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
