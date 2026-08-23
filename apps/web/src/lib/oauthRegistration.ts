/**
 * The exact values a provider dashboard needs, computed rather than remembered.
 *
 * §173. Three of the four connection failures in this pass were the same thing:
 * a redirect URI that Halyard sends and the provider has never been told about.
 * Every provider validates it by exact string match, so "roughly the right URL"
 * fails identically to a completely wrong one, and the provider's error never
 * names the mismatch.
 *
 * Telling an operator these values once, in a chat message, fixes it once. Showing
 * them on the card next to the Connect button — derived from the same
 * `callbackUrl` the OAuth route actually uses, so they cannot drift apart — fixes
 * it for every future deploy, origin change and re-registration.
 *
 * Nothing here is a secret: these are public URLs that get sent to the provider in
 * a query string. App *ids* and secrets are deliberately absent.
 */
import type { PlatformId } from '@halyard/core';
import { callbackUrl } from './oauthRedirect';

export type RegistrationField = { label: string; value: string; note?: string };

export type Registration = {
  /** Where the operator changes this, in the provider's own words. */
  dashboard: string;
  fields: RegistrationField[];
  /** Anything that is not a copy-paste value but still blocks the connection. */
  requirements: string[];
};

export function registrationFor(
  platform: PlatformId,
  configuredBase: string | undefined,
  origin: string,
): Registration | null {
  const cb = callbackUrl(configuredBase, origin, platform);
  const host = safeHost(cb);

  switch (platform) {
    case 'x':
      return {
        dashboard: 'X developer portal → your app → User authentication settings',
        fields: [
          { label: 'Callback URI / Redirect URL', value: cb, note: 'Exact match. No trailing slash.' },
          { label: 'Website URL', value: `https://${host}` },
        ],
        requirements: [
          'OAuth 2.0 must be turned on.',
          'Type of App must be a confidential client — "Web App, Automated App or Bot" — because Halyard authenticates the token exchange with a client secret.',
          'App permissions must be Read and write, or tweet.write is refused at consent.',
        ],
      };

    case 'instagram':
      return {
        dashboard: 'Meta App Dashboard → Facebook Login → Settings, and App settings → Basic',
        fields: [
          { label: 'Valid OAuth Redirect URIs', value: cb, note: 'Facebook Login → Settings.' },
          { label: 'App Domains', value: host, note: 'App settings → Basic. Domain only, no scheme or path.' },
        ],
        requirements: [
          'The Instagram account must be Business or Creator, and linked to a Facebook Page — this flow is Facebook Login for Business.',
          'While the app is in Development mode it works for accounts with a role on the app; anyone else needs App Review.',
        ],
      };

    case 'threads':
      return {
        dashboard: 'Meta App Dashboard → Threads use case → Settings',
        fields: [
          { label: 'Redirect Callback URLs', value: cb },
          { label: 'Uninstall / Delete callback', value: `https://${host}/`, note: 'Meta requires both to be non-empty.' },
        ],
        requirements: [
          'Threads has its own app id and secret, separate from the Meta app. Set THREADS_APP_ID and THREADS_APP_SECRET; Halyard falls back to META_APP_ID and will say so.',
          'The Threads profile must exist and be reachable from the linked account.',
        ],
      };

    case 'tiktok':
      return {
        dashboard: 'TikTok for Developers → your app → Login Kit',
        fields: [{ label: 'Redirect URI', value: cb }],
        requirements: ['Login Kit and Content Posting API must both be added to the app.'],
      };

    case 'pinterest':
      return {
        dashboard: 'Pinterest developers → your app → Configure',
        fields: [{ label: 'Redirect URI', value: cb }],
        requirements: ['A trial app can only write to sandbox boards until Pinterest grants standard access.'],
      };

    case 'youtube':
      return {
        dashboard: 'Google Cloud console → APIs & Services → Credentials → OAuth 2.0 Client ID',
        fields: [
          { label: 'Authorised redirect URI', value: cb },
          { label: 'Authorised JavaScript origin', value: `https://${host}` },
        ],
        requirements: [
          'The YouTube Data API v3 must be enabled on the project.',
          'While the consent screen is in Testing, only listed test users can authorise.',
        ],
      };

    case 'bluesky':
      /* Not OAuth. The operator creates an app password and pastes it into Halyard. */
      return null;

    default:
      return null;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
