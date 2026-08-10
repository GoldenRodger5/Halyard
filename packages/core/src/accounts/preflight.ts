/**
 * Pre-flight checklists. Milestone 40.
 *
 * Every platform has a set of conditions that must already be true before the
 * OAuth screen will produce a usable token, and each one fails differently and
 * unhelpfully when it is not met — Instagram silently returns an empty page
 * list, YouTube returns a channel that cannot upload, TikTok returns a token
 * that can only post to a private account.
 *
 * Listing them next to the connect button turns four failed round trips into
 * one that works.
 */
import type { PlatformId } from '../adapters/types.js';

export interface PreflightItem {
  /** What must be true. */
  requirement: string;
  /** Where to do it. */
  where?: string;
  /** What happens if it is not, so the checklist reads as consequence not chore. */
  otherwise: string;
}

export interface Preflight {
  /** Which browser profile to start the flow in. */
  browserProfile: string;
  items: PreflightItem[];
  /** Environment variables the start route needs. */
  credentials: string[];
}

/**
 * The browser-profile problem, stated once.
 *
 * OAuth consent screens authorise whoever the browser is already signed in as.
 * There is no step in any of these flows that asks "which account?" in a way you
 * would notice while clicking through, which is why identity is confirmed after
 * the fact as well.
 */
export const BROWSER_PROFILE_RULE =
  'Open the connect link in a browser profile signed into the account you want, or in a private window ' +
  'so you are forced to sign in. The consent screen authorises whoever is already logged in and never asks you to choose.';

export const PREFLIGHT: Record<PlatformId, Preflight> = {
  x: {
    browserProfile:
      'Use a private window. The founder and brand accounts are both on x.com, and this is the pairing that gets crossed most often.',
    credentials: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    items: [
      {
        requirement: 'A project and app exist in the X developer portal, on a paid tier.',
        where: 'developer.x.com → Projects & Apps',
        otherwise: 'Free-tier apps cannot post. The token exchange succeeds and the first publish returns 403.',
      },
      {
        requirement: 'OAuth 2.0 is enabled with type "Web App, Automated App or Bot", and the callback URL matches exactly.',
        where: 'App → User authentication settings',
        otherwise: 'The consent screen returns invalid_request before you see it.',
      },
      {
        requirement: 'App permissions are Read and write.',
        where: 'App → User authentication settings',
        otherwise: 'Posting fails with 403 and the account looks connected.',
      },
      {
        requirement: 'A payment method is on file.',
        where: 'developer.x.com → billing',
        otherwise: 'Posts are billed per call — about $0.015 without a link. Publishing stops when billing does.',
      },
    ],
  },

  instagram: {
    browserProfile:
      'Sign into the Facebook account that administers the Page, not the Instagram account itself. Instagram publishing runs through the Facebook Graph API.',
    credentials: ['META_APP_ID', 'META_APP_SECRET'],
    items: [
      {
        requirement: 'The Instagram account is a Professional account (Business or Creator).',
        where: 'Instagram app → Settings → Account type and tools',
        otherwise: 'It will not appear in the Page list and no token can reach it.',
      },
      {
        requirement: 'It is linked to a Facebook Page you administer.',
        where: 'Instagram app → Settings → Page',
        otherwise: 'The connect flow finds zero linked accounts and stops with that message.',
      },
      {
        requirement: 'The Meta app has instagram_content_publish, instagram_basic and pages_show_list.',
        where: 'developers.facebook.com → App → Permissions',
        otherwise: 'The account connects as draft-only and publishing returns a permission error.',
      },
      {
        requirement: 'You are a developer, admin or tester on the app while it is unreviewed.',
        where: 'App → Roles',
        otherwise: 'Unreviewed apps only work for up to 25 users with a role on the app.',
      },
    ],
  },

  threads: {
    browserProfile:
      'Threads authorises through its own login, which follows the Instagram session in the browser.',
    credentials: ['META_APP_ID', 'META_APP_SECRET'],
    items: [
      {
        requirement: 'A Threads profile exists for the Instagram account.',
        where: 'threads.net',
        otherwise: 'The token exchange succeeds and /me returns nothing usable.',
      },
      {
        requirement: 'The Meta app has the Threads API product added, with threads_basic and threads_content_publish.',
        where: 'developers.facebook.com → App → Add product → Threads API',
        otherwise: 'Scopes are silently dropped and publishing 403s.',
      },
    ],
  },

  pinterest: {
    browserProfile: 'Sign into the Pinterest business account that owns the boards.',
    credentials: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'],
    items: [
      {
        requirement: 'The account is a Pinterest business account.',
        where: 'pinterest.com/business/convert',
        otherwise: 'Personal accounts cannot create pins through the API.',
      },
      {
        requirement: 'At least one board exists, and you know which one pins should land on.',
        where: 'pinterest.com',
        otherwise: 'Every pin create fails: board_id is required and there is no default.',
      },
      {
        requirement: 'The app is registered and the redirect URI matches exactly, including the trailing slash.',
        where: 'developers.pinterest.com → Apps',
        otherwise: 'Pinterest is stricter about this than any other platform here.',
      },
    ],
  },

  youtube: {
    browserProfile:
      'Use a private window and pick the channel deliberately on the consent screen. A Google account often owns a personal channel and several brand channels, and the default is rarely the one you want.',
    credentials: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    items: [
      {
        requirement: 'The YouTube Data API v3 is enabled on the Google Cloud project.',
        where: 'console.cloud.google.com → APIs & Services → Library',
        otherwise: 'Every call returns 403 accessNotConfigured.',
      },
      {
        requirement: 'The OAuth consent screen is configured and your account is a test user while it is unverified.',
        where: 'console.cloud.google.com → OAuth consent screen',
        otherwise: 'Sign-in is blocked with "app is not verified".',
      },
      {
        requirement: 'The channel exists and is verified for uploads longer than 15 minutes.',
        where: 'youtube.com/verify',
        otherwise: 'Long uploads are rejected after the whole file has been sent.',
      },
    ],
  },

  tiktok: {
    browserProfile: 'Sign into TikTok as the account that will post.',
    credentials: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    items: [
      {
        requirement: 'The app has the Content Posting API product with video.publish, and Login Kit.',
        where: 'developers.tiktok.com → Manage apps',
        otherwise: 'The token cannot reach the publish endpoints at all.',
      },
      {
        requirement: 'The domain hosting your videos is verified with TikTok.',
        where: 'developers.tiktok.com → App → URL properties',
        otherwise: 'PULL_FROM_URL uploads are rejected; only direct file upload works.',
      },
      {
        requirement: 'You accept that uploads land in drafts.',
        otherwise:
          'Unaudited clients can only post SELF_ONLY, and the API cannot attach trending audio even after the audit. Halyard uploads to drafts on purpose.',
      },
    ],
  },

  bluesky: {
    browserProfile: 'No OAuth. This uses an app password, which you paste in.',
    credentials: [],
    items: [
      {
        requirement: 'An app password exists, and it is an app password rather than the account password.',
        where: 'bsky.app → Settings → App passwords',
        otherwise: 'Using the real password works and is a bad idea: it cannot be revoked in isolation.',
      },
      {
        requirement: 'You know the full handle, including its domain.',
        otherwise: 'Sessions are created against the handle; a bare username fails to resolve.',
      },
    ],
  },
};

/**
 * A token that expires within a week needs attention before it takes a slot
 * down. Seven days is chosen so a warning is always seen at least once during a
 * normal working week.
 */
export const TOKEN_EXPIRY_WARNING_DAYS = 7;

export function tokenExpiryState(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): { level: 'none' | 'warn' | 'expired'; days: number | null; message: string | null } {
  if (!expiresAt) return { level: 'none', days: null, message: null };
  const days = Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) {
    return {
      level: 'expired',
      days,
      message: 'The token expired. Publishing on this account fails until it is reconnected.',
    };
  }
  if (days <= TOKEN_EXPIRY_WARNING_DAYS) {
    return {
      level: 'warn',
      days,
      message: `The token expires in ${days === 0 ? 'less than a day' : `${days} day${days === 1 ? '' : 's'}`}. Reconnect before it does, or scheduled posts on this account will fail.`,
    };
  }
  return { level: 'none', days, message: null };
}
