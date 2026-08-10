/**
 * Handle availability. Milestone 50.
 *
 * The spec asks for read-only public endpoints and no scraping behind auth, and
 * adds: "If a platform cannot be checked cleanly, say so rather than guessing."
 *
 * That last clause is the whole design. Only **one** of the seven platforms has
 * a real public API for this — Bluesky's `resolveHandle`, which answers the exact
 * question and nothing else. Everywhere else the only signal available without
 * authenticating is whether a public profile page returns 404, and that signal
 * is corrupted by bot walls, consent interstitials, login redirects and soft-404s
 * that return 200 with an error body.
 *
 * So each platform declares its method and how much that method can be trusted,
 * and an ambiguous response resolves to `unknown` rather than to `available`.
 * Telling somebody a handle is free when it is not costs them a rebrand across
 * six profiles; telling them to spend fifteen seconds checking by hand costs
 * fifteen seconds.
 */
import type { PlatformId } from '../adapters/types.js';

export type HandleStatus = 'available' | 'taken' | 'invalid' | 'unknown';

export type CheckMethod =
  /** A real API that answers this question. Trust it. */
  | 'api'
  /** A public profile URL that 404s when nobody holds the handle. Indicative. */
  | 'public_page'
  /** No usable signal without logging in. Never guessed. */
  | 'manual';

export interface HandleCheck {
  platform: PlatformId;
  handle: string;
  status: HandleStatus;
  method: CheckMethod;
  /** In the operator's language: what was learned and how much to trust it. */
  detail: string;
  /** Where to check by hand. Always present, even when the check succeeded. */
  checkUrl: string;
}

interface PlatformProbe {
  method: CheckMethod;
  /** The page a human should open. */
  profileUrl: (handle: string) => string;
  /** The URL actually requested, when there is one. */
  probeUrl?: (handle: string) => string;
  /** Why a platform is manual-only, stated rather than implied. */
  manualReason?: string;
  /** Legality of the handle itself, checked before any network call. */
  validate?: (handle: string) => string | null;
}

const alnumUnderscore = (max: number) => (handle: string): string | null => {
  if (handle.length === 0) return 'Empty.';
  if (handle.length > max) return `Longer than ${max} characters.`;
  if (!/^[A-Za-z0-9_]+$/.test(handle)) return 'Only letters, numbers and underscores are allowed.';
  return null;
};

const PROBES: Record<PlatformId, PlatformProbe> = {
  bluesky: {
    method: 'api',
    profileUrl: (h) => `https://bsky.app/profile/${encodeURIComponent(normaliseBluesky(h))}`,
    probeUrl: (h) =>
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(
        normaliseBluesky(h),
      )}`,
    validate: (handle) => {
      const full = normaliseBluesky(handle);
      if (full.length > 253) return 'Longer than a domain name may be.';
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(full)) {
        return 'A Bluesky handle is a domain — either name.bsky.social or a domain you own.';
      }
      return null;
    },
  },
  x: {
    method: 'manual',
    profileUrl: (h) => `https://x.com/${encodeURIComponent(h)}`,
    manualReason:
      'X serves a login wall to unauthenticated requests, so a 404 means nothing. There is no public availability endpoint.',
    validate: alnumUnderscore(15),
  },
  instagram: {
    method: 'public_page',
    profileUrl: (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`,
    probeUrl: (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`,
    validate: (handle) => {
      if (handle.length === 0) return 'Empty.';
      if (handle.length > 30) return 'Longer than 30 characters.';
      if (!/^[A-Za-z0-9._]+$/.test(handle)) {
        return 'Only letters, numbers, periods and underscores are allowed.';
      }
      return null;
    },
  },
  threads: {
    method: 'public_page',
    profileUrl: (h) => `https://www.threads.com/@${encodeURIComponent(h)}`,
    probeUrl: (h) => `https://www.threads.com/@${encodeURIComponent(h)}`,
    validate: (handle) => {
      if (handle.length === 0) return 'Empty.';
      if (handle.length > 30) return 'Longer than 30 characters.';
      if (!/^[A-Za-z0-9._]+$/.test(handle)) {
        return 'Only letters, numbers, periods and underscores are allowed.';
      }
      return null;
    },
  },
  tiktok: {
    method: 'manual',
    profileUrl: (h) => `https://www.tiktok.com/@${encodeURIComponent(h)}`,
    manualReason:
      'TikTok answers automated requests with a bot check that returns 200 whether or not the handle exists, so a probe cannot distinguish the two.',
    validate: (handle) => {
      if (handle.length === 0) return 'Empty.';
      if (handle.length > 24) return 'Longer than 24 characters.';
      if (!/^[A-Za-z0-9._]+$/.test(handle)) {
        return 'Only letters, numbers, periods and underscores are allowed.';
      }
      return null;
    },
  },
  youtube: {
    method: 'public_page',
    profileUrl: (h) => `https://www.youtube.com/@${encodeURIComponent(h)}`,
    probeUrl: (h) => `https://www.youtube.com/@${encodeURIComponent(h)}`,
    validate: (handle) => {
      if (handle.length < 3) return 'Shorter than 3 characters.';
      if (handle.length > 30) return 'Longer than 30 characters.';
      if (!/^[A-Za-z0-9._-]+$/.test(handle)) {
        return 'Only letters, numbers, underscores, hyphens and periods are allowed.';
      }
      return null;
    },
  },
  pinterest: {
    method: 'public_page',
    profileUrl: (h) => `https://www.pinterest.com/${encodeURIComponent(h)}/`,
    probeUrl: (h) => `https://www.pinterest.com/${encodeURIComponent(h)}/`,
    validate: (handle) => {
      if (handle.length === 0) return 'Empty.';
      if (handle.length > 30) return 'Longer than 30 characters.';
      if (!/^[A-Za-z0-9]+$/.test(handle)) return 'Only letters and numbers are allowed.';
      return null;
    },
  },
};

/** `handle` → `handle.bsky.social`, unless it already looks like a domain. */
export function normaliseBluesky(handle: string): string {
  const trimmed = handle.trim().replace(/^@/, '').toLowerCase();
  return trimmed.includes('.') ? trimmed : `${trimmed}.bsky.social`;
}

/** Every platform's public profile URL for a handle, for the "check by hand" links. */
export function profileUrl(platform: PlatformId, handle: string): string {
  return PROBES[platform].profileUrl(handle.trim().replace(/^@/, ''));
}

/**
 * Check one handle on one platform.
 *
 * Never throws: a network failure is a `unknown` result with the reason in it,
 * because a checker that dies halfway leaves the operator with a partial table
 * and no idea which half is missing.
 */
export async function checkHandle(
  platform: PlatformId,
  rawHandle: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HandleCheck> {
  const handle = rawHandle.trim().replace(/^@/, '');
  const probe = PROBES[platform];
  const checkUrl = probe.profileUrl(handle);
  const base = { platform, handle, checkUrl };

  const invalid = probe.validate?.(platform === 'bluesky' ? handle : handle);
  if (invalid) {
    return { ...base, status: 'invalid', method: probe.method, detail: invalid };
  }

  if (probe.method === 'manual' || !probe.probeUrl) {
    return {
      ...base,
      status: 'unknown',
      method: 'manual',
      detail: probe.manualReason ?? 'No public endpoint answers this question.',
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(probe.probeUrl(handle), {
      method: probe.method === 'api' ? 'GET' : 'HEAD',
      redirect: 'manual',
      headers: { 'user-agent': 'Halyard/1.0 (+https://recipefix.app) handle-availability-check' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return {
      ...base,
      status: 'unknown',
      method: probe.method,
      detail: `The check could not complete: ${(err as Error).message}. Open the link and look.`,
    };
  }

  if (probe.method === 'api') {
    // Bluesky answers the actual question: resolved means somebody holds it.
    if (response.status === 200) {
      return {
        ...base,
        status: 'taken',
        method: 'api',
        detail: `${normaliseBluesky(handle)} resolves to an existing account.`,
      };
    }
    if (response.status === 400) {
      return {
        ...base,
        status: 'available',
        method: 'api',
        detail: `${normaliseBluesky(handle)} resolves to nothing. Bluesky's own resolver was asked, so this one is reliable.`,
      };
    }
    return {
      ...base,
      status: 'unknown',
      method: 'api',
      detail: `Bluesky answered ${response.status}, which is neither a resolution nor a refusal.`,
    };
  }

  // A public page. 404 is the only trustworthy answer; everything else is a
  // maybe, and a maybe is recorded as unknown.
  if (response.status === 404) {
    return {
      ...base,
      status: 'available',
      method: 'public_page',
      detail:
        'No public profile exists at that URL. Reserved, suspended and private handles can also look like this, so confirm when you create it.',
    };
  }
  if (response.status === 200) {
    return {
      ...base,
      status: 'taken',
      method: 'public_page',
      detail: 'A public profile already exists at that URL.',
    };
  }
  if (response.status >= 300 && response.status < 400) {
    return {
      ...base,
      status: 'unknown',
      method: 'public_page',
      detail: `Redirected (${response.status}) — usually a login or consent wall rather than an answer.`,
    };
  }
  if (response.status === 429) {
    return {
      ...base,
      status: 'unknown',
      method: 'public_page',
      detail: 'Rate limited. Wait a minute, or open the link and look.',
    };
  }
  return {
    ...base,
    status: 'unknown',
    method: 'public_page',
    detail: `Answered ${response.status}, which does not distinguish a free handle from a taken one.`,
  };
}

/**
 * Check one handle everywhere at once.
 *
 * Concurrent because they are independent, and `checkHandle` cannot reject, so
 * one slow platform never costs the others their answer.
 */
export async function checkHandleEverywhere(
  handle: string,
  platforms: PlatformId[],
  fetchImpl: typeof fetch = fetch,
): Promise<HandleCheck[]> {
  return Promise.all(platforms.map((platform) => checkHandle(platform, handle, fetchImpl)));
}

/** One sentence for the top of the table, so the caveats are read before the results. */
export function summariseChecks(checks: HandleCheck[]): string {
  const available = checks.filter((c) => c.status === 'available').length;
  const taken = checks.filter((c) => c.status === 'taken').length;
  const unknown = checks.filter((c) => c.status === 'unknown').length;
  const invalid = checks.filter((c) => c.status === 'invalid').length;

  const parts: string[] = [];
  if (available > 0) parts.push(`${available} look free`);
  if (taken > 0) parts.push(`${taken} taken`);
  if (invalid > 0) parts.push(`${invalid} not a legal handle there`);
  if (unknown > 0) {
    parts.push(
      `${unknown} could not be checked without logging in — those are unknown, not free`,
    );
  }
  return parts.length > 0 ? `${parts.join(', ')}.` : 'Nothing checked.';
}
