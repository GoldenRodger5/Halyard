/**
 * Destinations and link routing. Milestone 42.
 *
 * The question this answers is "where should this specific post send someone",
 * and the wrong answer costs almost every click. Two failures dominate:
 *
 *   · Sending iOS traffic to the App Store when the app is already installed.
 *     The user bounces through a store page for an app they have, and lands
 *     nowhere near the thing the post was about.
 *   · Sending a post about one exact adapted recipe to the homepage. The reader
 *     has to reproduce the thing they just read about, and most will not.
 *
 * recipefix.app serves `/.well-known/apple-app-site-association` with
 * `"paths": ["NOT /auth/callback", "NOT /forgot-password", "NOT /delete-account", "*"]`,
 * so every content URL already opens in the installed app through a universal
 * link. That single fact is why iOS goes to the web URL rather than the store:
 * installed users land inside the app, and everyone else lands on a working web
 * page with an App Store banner already on it.
 */

export type DeviceClass = 'ios' | 'android' | 'desktop' | 'bot' | 'unknown';

export type DestinationType = 'share_link' | 'app_store' | 'web' | 'link_in_bio';

export interface ProductDestinations {
  web?: string;
  app_store?: string;
  app_store_id?: string;
  play_store?: string;
  universal_link_domain?: string;
  deep_link_scheme?: string;
  /**
   * A template with `{shareToken}` in it. RecipeFix's is
   * `https://recipefix.app/recipe/{shareToken}` — a public page for one saved
   * adaptation, which is the most specific destination the product has.
   */
  share_url_template?: string;
  /**
   * The App Analytics provider token: a static identifier for the Apple
   * Developer account, found in App Store Connect under Analytics → Campaigns.
   * Without it every App Store install reads as organic.
   */
  app_analytics_provider_token?: string;
}

/**
 * Classify the device from a user agent.
 *
 * Bots are separated rather than dropped: a preview crawler fetching the link is
 * a real event, and counting it as a human click inflates every click-through
 * rate on the analytics screen.
 */
export function classifyDevice(userAgent: string | null | undefined): DeviceClass {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return 'unknown';

  if (
    /bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|linkedinbot|embedly|quora link preview|pinterest|redditbot|telegrambot|applebot|bingpreview|headlesschrome|lighthouse/.test(
      ua,
    )
  ) {
    return 'bot';
  }

  // iPadOS 13+ reports a desktop Safari UA, so the touch hint is what separates
  // an iPad from a Mac. Without this every iPad reads as desktop.
  if (/iphone|ipod/.test(ua)) return 'ios';
  if (/ipad/.test(ua)) return 'ios';
  if (/macintosh/.test(ua) && /mobile\/|touch/.test(ua)) return 'ios';

  if (/android/.test(ua)) return 'android';
  if (/windows|macintosh|linux|cros/.test(ua)) return 'desktop';
  return 'unknown';
}

export interface RouteInput {
  device: DeviceClass;
  destinations: ProductDestinations;
  /** Where the post said it was pointing, before device routing. */
  destinationType: DestinationType;
  /** The specific web URL for this item, if it has one. */
  destinationUrl?: string | null;
  /** Everything the incoming link carried, forwarded verbatim. */
  incomingParams?: URLSearchParams;
  /** For App Store campaign parameters. Trimmed to Apple's 40-char limit. */
  campaignToken?: string | null;
  /** True when the post is about something only the native app can do. */
  nativeOnly?: boolean;
}

export interface RouteDecision {
  url: string;
  /** What the router actually chose, which may differ from destinationType. */
  resolved: DestinationType;
  /** Why, in the operator's language, for the click log and the detail screen. */
  reason: string;
}

const APPLE_CAMPAIGN_TOKEN_MAX = 40;

/**
 * Apple's campaign link parameters, verified against App Store Connect's
 * Analytics help (Acquisition → Campaign links): `pt` is the provider token,
 * static for the developer account; `ct` is the campaign token, a string you
 * choose, capped at 40 characters; `mt=8` is the media type for apps.
 */
export function appStoreCampaignUrl(
  appStoreUrl: string,
  options: { providerToken?: string | null; campaignToken?: string | null },
): string {
  const url = new URL(appStoreUrl);
  if (options.providerToken) url.searchParams.set('pt', options.providerToken);
  if (options.campaignToken) {
    url.searchParams.set('ct', options.campaignToken.slice(0, APPLE_CAMPAIGN_TOKEN_MAX));
  }
  url.searchParams.set('mt', '8');
  return url.toString();
}

/**
 * Decide where one click goes.
 *
 * Pure, so the whole matrix is testable without a request.
 */
export function routeClick(input: RouteInput): RouteDecision {
  const { destinations, device } = input;
  const webBase = input.destinationUrl ?? destinations.web ?? null;

  const withParams = (url: string): string => {
    if (!input.incomingParams || [...input.incomingParams.keys()].length === 0) return url;
    const target = new URL(url);
    // Forward everything, and never overwrite a parameter the destination
    // already carries — the specific link knows better than the click.
    for (const [key, value] of input.incomingParams) {
      if (!target.searchParams.has(key)) target.searchParams.set(key, value);
    }
    return target.toString();
  };

  // A crawler fetching the link for a preview card should see the canonical web
  // page, never a store redirect, or the preview shows an App Store listing.
  if (device === 'bot') {
    return {
      url: withParams(webBase ?? destinations.web ?? ''),
      resolved: 'web',
      reason: 'A preview crawler, so the canonical web page rather than a store redirect.',
    };
  }

  // Only a native-only feature justifies sending an iOS user to the store.
  if (input.nativeOnly && device === 'ios' && destinations.app_store) {
    return {
      url: appStoreCampaignUrl(destinations.app_store, {
        providerToken: destinations.app_analytics_provider_token,
        campaignToken: input.campaignToken,
      }),
      resolved: 'app_store',
      reason:
        'The post is about something only the app can do, so iOS goes to the App Store with campaign parameters attached.',
    };
  }
  if (input.nativeOnly && device === 'android' && destinations.play_store) {
    return {
      url: withParams(destinations.play_store),
      resolved: 'app_store',
      reason: 'The post is about a native feature, and this is Android.',
    };
  }

  if (device === 'ios' && webBase) {
    return {
      url: withParams(webBase),
      resolved: input.destinationType === 'share_link' ? 'share_link' : 'web',
      reason: destinations.universal_link_domain
        ? `iOS goes to the web URL: ${destinations.universal_link_domain} is configured for universal links, so the installed app opens it directly and nobody bounces through a store page for an app they already have.`
        : 'iOS goes to the web URL. No universal-link domain is configured, so this opens in the browser.',
    };
  }

  if (device === 'android' && webBase) {
    return {
      url: withParams(webBase),
      resolved: input.destinationType === 'share_link' ? 'share_link' : 'web',
      reason: 'Android goes to the web app, which is installable as a PWA.',
    };
  }

  if (webBase) {
    return {
      url: withParams(webBase),
      resolved: input.destinationType === 'share_link' ? 'share_link' : 'web',
      reason: 'Desktop goes to the web page.',
    };
  }

  // Nothing usable. Better to say so than to send someone to a dead link.
  return {
    url: destinations.web ?? '',
    resolved: 'web',
    reason:
      'No destination is configured for this product beyond its homepage. Set destinations on the product screen.',
  };
}

// ── Resolving what a post should point at ──────────────────────────────────

export interface ResolveInput {
  category: string;
  destinations: ProductDestinations;
  /** The stored product artifact, if the item came from one. */
  artifact?: { raw?: unknown } | null;
  /** True when the post is about a feature the web app does not have. */
  nativeOnly?: boolean;
  /** An explicit choice made by the operator always wins. */
  override?: DestinationType | null;
  overrideUrl?: string | null;
}

export interface ResolvedDestination {
  type: DestinationType;
  url: string | null;
  reason: string;
  /** What is missing, when the best destination could not be built. */
  blockedBy?: string;
}

/**
 * What should this post point at?
 *
 * A post about one exact adapted recipe should point at that recipe, not at the
 * homepage. That needs a share token from the product, and when there is not one
 * the fallback is honest about why rather than silently pointing at the front
 * page.
 */
export function resolveDestination(input: ResolveInput): ResolvedDestination {
  const { destinations } = input;

  if (input.override) {
    return {
      type: input.override,
      url: input.overrideUrl ?? destinationUrlFor(input.override, destinations, input.artifact),
      reason: 'Set by hand on the queue detail screen.',
    };
  }

  const shareToken = extractShareToken(input.artifact?.raw);
  if (shareToken && destinations.share_url_template) {
    return {
      type: 'share_link',
      url: destinations.share_url_template.replace('{shareToken}', shareToken),
      reason:
        'The post is about one specific adaptation and the product gave it a public share page, so the link goes straight there.',
    };
  }

  if (input.nativeOnly && destinations.app_store) {
    return {
      type: 'app_store',
      url: destinations.app_store,
      reason: 'The feature this post is about only exists in the native app.',
    };
  }

  const specific = SPECIFIC_CATEGORIES.has(input.category);
  return {
    type: 'web',
    url: destinations.web ?? null,
    reason: specific
      ? 'Falling back to the web page.'
      : 'A general post, so the web page is the right destination.',
    blockedBy:
      specific && !shareToken
        ? 'This post is about one specific transformation, but the artifact carries no share token, so there is no page for that exact recipe to link to. RecipeFix issues a share_token when a recipe is saved — have the connector save the adaptation, or set a destination by hand.'
        : specific && !destinations.share_url_template
          ? 'This post is about one specific transformation, but the product has no share_url_template configured. Set it on the product screen: https://recipefix.app/recipe/{shareToken}.'
          : undefined,
  };
}

/**
 * Categories where a post is about one particular thing, and the homepage is
 * therefore the wrong destination.
 */
const SPECIFIC_CATEGORIES = new Set(['transformation', 'product']);

function destinationUrlFor(
  type: DestinationType,
  destinations: ProductDestinations,
  artifact?: { raw?: unknown } | null,
): string | null {
  switch (type) {
    case 'app_store':
      return destinations.app_store ?? null;
    case 'share_link': {
      const token = extractShareToken(artifact?.raw);
      return token && destinations.share_url_template
        ? destinations.share_url_template.replace('{shareToken}', token)
        : null;
    }
    case 'link_in_bio':
    case 'web':
    default:
      return destinations.web ?? null;
  }
}

/** RecipeFix returns `share_token` on a saved recipe; other products may differ. */
export function extractShareToken(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const candidate =
    record.share_token ?? record.shareToken ?? record.shareId ?? record.share_id ?? null;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

/**
 * The router URL for one content item. Milestone 42.
 *
 * Posts carry this rather than the destination itself, so the device decision
 * happens at click time and every click is logged. UTMs stamped on the outgoing
 * post ride along and are forwarded to whatever the router picks.
 */
export function routerUrlFor(baseUrl: string, contentItemId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/r/${contentItemId}`;
}
