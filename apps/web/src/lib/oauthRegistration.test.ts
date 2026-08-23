/**
 * What the card tells the operator to register must be what Halyard sends.
 *
 * §173. These two values lived in different places — the redirect URI in the
 * OAuth route, the instructions in a chat message or a doc — and drifted, which
 * is how three platforms ended up registered against an origin Halyard no longer
 * used. Both now come from `callbackUrl`, and this asserts they agree.
 */
import { describe, expect, it } from 'vitest';
import { callbackUrl } from './oauthRedirect';
import { registrationFor } from './oauthRegistration';

const PROD = 'https://halyard-ten.vercel.app';

describe('registration values', () => {
  it('shows exactly the callback the OAuth route will send', () => {
    for (const platform of ['x', 'instagram', 'threads', 'tiktok', 'pinterest', 'youtube'] as const) {
      const reg = registrationFor(platform, PROD, 'https://some-preview.vercel.app');
      const sent = callbackUrl(PROD, 'https://some-preview.vercel.app', platform);
      const shown = reg?.fields.map((f) => f.value) ?? [];
      expect(shown, platform).toContain(sent);
    }
  });

  it('follows the configured base rather than the request origin', () => {
    /*
     * The whole point of `OAUTH_REDIRECT_BASE_URL`: a preview deployment must
     * still show, and send, the production callback — otherwise every preview
     * would need its own registration.
     */
    const reg = registrationFor('x', PROD, 'https://halyard-git-branch.vercel.app');
    expect(reg?.fields[0]?.value).toBe(`${PROD}/api/oauth/x/callback`);
  });

  it('falls back to the request origin when no base is configured', () => {
    const reg = registrationFor('x', undefined, PROD);
    expect(reg?.fields[0]?.value).toBe(`${PROD}/api/oauth/x/callback`);
  });

  it('treats an empty base as unset — dotenv parses `KEY=` to ""', () => {
    expect(registrationFor('x', '', PROD)?.fields[0]?.value).toBe(`${PROD}/api/oauth/x/callback`);
  });

  it('gives Meta a bare domain for App Domains, not a URL', () => {
    const appDomains = registrationFor('instagram', PROD, PROD)?.fields.find((f) =>
      f.label.includes('App Domains'),
    );
    expect(appDomains?.value).toBe('halyard-ten.vercel.app');
    expect(appDomains?.value).not.toContain('https://');
    expect(appDomains?.value).not.toContain('/');
  });

  it('tells X it needs a confidential client, since Halyard sends a client secret', () => {
    const reqs = registrationFor('x', PROD, PROD)?.requirements.join(' ') ?? '';
    expect(reqs).toMatch(/confidential client/i);
    expect(reqs).toMatch(/read and write/i);
  });

  it('tells Threads it has its own app id', () => {
    expect(registrationFor('threads', PROD, PROD)?.requirements.join(' ')).toMatch(/THREADS_APP_ID/);
  });

  it('has no registration for Bluesky, which is not OAuth', () => {
    expect(registrationFor('bluesky', PROD, PROD)).toBeNull();
  });

  it('never exposes a secret', () => {
    for (const platform of ['x', 'instagram', 'threads', 'tiktok', 'pinterest', 'youtube'] as const) {
      const text = JSON.stringify(registrationFor(platform, PROD, PROD));
      expect(text.toLowerCase()).not.toMatch(/client_secret|app_secret["']?\s*:\s*["'][^"']/);
    }
  });
});
