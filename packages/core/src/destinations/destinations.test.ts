/**
 * Link routing. Milestone 42.
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  campaignTokenFor,
  credentialsFromEnv,
  mintAppStoreJwt,
  parseCampaignTsv,
} from './appStore.js';
import {
  appStoreCampaignUrl,
  classifyDevice,
  extractShareToken,
  resolveDestination,
  routeClick,
  routerUrlFor,
  type ProductDestinations,
} from './router.js';

/** RecipeFix's real configuration, as served today. */
const RECIPEFIX: ProductDestinations = {
  web: 'https://recipefix.app',
  app_store: 'https://apps.apple.com/app/id6759676502',
  app_store_id: '6759676502',
  universal_link_domain: 'recipefix.app',
  deep_link_scheme: 'recipefix',
  share_url_template: 'https://recipefix.app/recipe/{shareToken}',
  app_analytics_provider_token: '1234567',
};

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
  ipad:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 Mobile/15E148',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  twitterbot: 'Twitterbot/1.0',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
};

describe('classifyDevice', () => {
  it('reads the obvious cases', () => {
    expect(classifyDevice(UA.iphone)).toBe('ios');
    expect(classifyDevice(UA.android)).toBe('android');
    expect(classifyDevice(UA.mac)).toBe('desktop');
    expect(classifyDevice(null)).toBe('unknown');
  });

  it('catches an iPad, which reports itself as a Mac', () => {
    // iPadOS 13+ sends a desktop Safari UA. Without the mobile hint every iPad
    // reads as desktop, and iPad is a real share of recipe traffic.
    expect(classifyDevice(UA.ipad)).toBe('ios');
  });

  it('separates preview crawlers from people', () => {
    expect(classifyDevice(UA.twitterbot)).toBe('bot');
    expect(classifyDevice(UA.facebook)).toBe('bot');
  });
});

describe('routeClick', () => {
  const share = 'https://recipefix.app/recipe/be1b2a5f-5015-4e0c-9194-8bae735e9e01';

  it('sends iOS to the web URL, not the App Store, because universal links are configured', () => {
    const decision = routeClick({
      device: 'ios',
      destinations: RECIPEFIX,
      destinationType: 'share_link',
      destinationUrl: share,
    });
    expect(decision.url).toBe(share);
    expect(decision.resolved).toBe('share_link');
    expect(decision.reason).toMatch(/universal links/);
  });

  it('sends iOS to the App Store only when the post is about a native-only feature', () => {
    const decision = routeClick({
      device: 'ios',
      destinations: RECIPEFIX,
      destinationType: 'app_store',
      nativeOnly: true,
      campaignToken: 'launch-week',
    });
    expect(decision.resolved).toBe('app_store');
    expect(decision.url).toContain('apps.apple.com');
    expect(decision.url).toContain('pt=1234567');
    expect(decision.url).toContain('ct=launch-week');
    expect(decision.url).toContain('mt=8');
  });

  it('sends Android to the web app', () => {
    const decision = routeClick({
      device: 'android',
      destinations: RECIPEFIX,
      destinationType: 'share_link',
      destinationUrl: share,
    });
    expect(decision.url).toBe(share);
    expect(decision.reason).toMatch(/PWA/);
  });

  it('sends desktop to the web page', () => {
    expect(
      routeClick({
        device: 'desktop',
        destinations: RECIPEFIX,
        destinationType: 'web',
      }).url,
    ).toBe(RECIPEFIX.web);
  });

  it('sends a preview crawler to the canonical page even for a native-only post', () => {
    // Otherwise the link preview on X shows an App Store listing.
    const decision = routeClick({
      device: 'bot',
      destinations: RECIPEFIX,
      destinationType: 'app_store',
      nativeOnly: true,
    });
    expect(decision.resolved).toBe('web');
    expect(decision.url).not.toContain('apps.apple.com');
  });

  it('forwards UTMs to whatever it picks', () => {
    const decision = routeClick({
      device: 'desktop',
      destinations: RECIPEFIX,
      destinationType: 'share_link',
      destinationUrl: share,
      incomingParams: new URLSearchParams({ utm_source: 'x', utm_content: 'ci-1' }),
    });
    expect(decision.url).toContain('utm_source=x');
    expect(decision.url).toContain('utm_content=ci-1');
  });

  it('does not let a forwarded parameter overwrite one the destination already carries', () => {
    const decision = routeClick({
      device: 'desktop',
      destinations: RECIPEFIX,
      destinationType: 'web',
      destinationUrl: 'https://recipefix.app/adapt?diet=gluten-free',
      incomingParams: new URLSearchParams({ diet: 'vegan', utm_source: 'x' }),
    });
    expect(decision.url).toContain('diet=gluten-free');
    expect(decision.url).toContain('utm_source=x');
  });

  it('says what is missing rather than producing a dead link', () => {
    const decision = routeClick({
      device: 'ios',
      destinations: {},
      destinationType: 'web',
    });
    expect(decision.reason).toMatch(/No destination is configured/);
  });
});

describe('appStoreCampaignUrl', () => {
  it('uses the parameters App Store Connect actually reads', () => {
    const url = new URL(
      appStoreCampaignUrl('https://apps.apple.com/app/id6759676502', {
        providerToken: '1234567',
        campaignToken: 'gf-bread',
      }),
    );
    expect(url.searchParams.get('pt')).toBe('1234567');
    expect(url.searchParams.get('ct')).toBe('gf-bread');
    expect(url.searchParams.get('mt')).toBe('8');
  });

  it('trims the campaign token to Apple’s 40-character limit', () => {
    const url = new URL(
      appStoreCampaignUrl('https://apps.apple.com/app/id1', {
        campaignToken: 'x'.repeat(60),
      }),
    );
    expect(url.searchParams.get('ct')).toHaveLength(40);
  });

  it('still marks the media type when there is no provider token yet', () => {
    const url = new URL(appStoreCampaignUrl('https://apps.apple.com/app/id1', {}));
    expect(url.searchParams.get('mt')).toBe('8');
    expect(url.searchParams.has('pt')).toBe(false);
  });
});

describe('resolveDestination', () => {
  it('points a specific adaptation at its own share page', () => {
    const resolved = resolveDestination({
      category: 'transformation',
      destinations: RECIPEFIX,
      artifact: { raw: { share_token: 'tok-1' } },
    });
    expect(resolved).toMatchObject({
      type: 'share_link',
      url: 'https://recipefix.app/recipe/tok-1',
    });
  });

  it('names exactly what is missing when a specific post cannot be linked precisely', () => {
    const resolved = resolveDestination({
      category: 'transformation',
      destinations: RECIPEFIX,
      artifact: { raw: { recipeName: 'Bread' } },
    });
    expect(resolved.type).toBe('web');
    expect(resolved.blockedBy).toMatch(/share_token when a recipe is saved/);
  });

  it('does not complain about a general post pointing at the web page', () => {
    const resolved = resolveDestination({ category: 'education', destinations: RECIPEFIX });
    expect(resolved.type).toBe('web');
    expect(resolved.blockedBy).toBeUndefined();
  });

  it('lets an operator override win', () => {
    const resolved = resolveDestination({
      category: 'transformation',
      destinations: RECIPEFIX,
      artifact: { raw: { share_token: 'tok-1' } },
      override: 'app_store',
    });
    expect(resolved.type).toBe('app_store');
    expect(resolved.url).toBe(RECIPEFIX.app_store);
  });
});

describe('extractShareToken', () => {
  it('reads the field RecipeFix actually returns', () => {
    expect(extractShareToken({ share_token: 'abc' })).toBe('abc');
  });

  it('accepts the other spellings another product might use', () => {
    expect(extractShareToken({ shareToken: 'abc' })).toBe('abc');
    expect(extractShareToken({ shareId: 'abc' })).toBe('abc');
  });

  it('returns null rather than an empty string', () => {
    expect(extractShareToken({ share_token: '' })).toBeNull();
    expect(extractShareToken(null)).toBeNull();
    expect(extractShareToken('not an object')).toBeNull();
  });
});

describe('routerUrlFor', () => {
  it('builds a link that goes through the router, whatever the base', () => {
    expect(routerUrlFor('https://halyard.example', 'ci-1')).toBe('https://halyard.example/r/ci-1');
    expect(routerUrlFor('https://halyard.example/', 'ci-1')).toBe('https://halyard.example/r/ci-1');
  });
});

// ── App Store Connect ──────────────────────────────────────────────────────

describe('App Store credentials', () => {
  it('names every missing variable and where the key comes from', () => {
    expect(() => credentialsFromEnv({})).toThrow(/APP_STORE_KEY_ID/);
    expect(() => credentialsFromEnv({})).toThrow(/downloads once/);
    expect(() => credentialsFromEnv({})).toThrow(/reads as organic/);
  });

  it('restores the newlines an environment variable flattens', () => {
    const credentials = credentialsFromEnv({
      APP_STORE_KEY_ID: 'K',
      APP_STORE_ISSUER_ID: 'I',
      APP_STORE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
      APP_STORE_APP_ID: '6759676502',
    });
    // A PEM without newlines is not a PEM, and the resulting 401 says nothing.
    expect(credentials.privateKeyPem).toContain('\n');
  });
});

describe('mintAppStoreJwt', () => {
  const privateKeyPem = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  it('produces a token Apple would accept: ES256, kid, and a short expiry', () => {
    const token = mintAppStoreJwt(
      {
        keyId: 'ABC123',
        issuerId: 'issuer-1',
        privateKeyPem: privateKeyPem.privateKey,
        appId: '1',
      },
      1_700_000_000,
    );

    const [header, payload, signature] = token.split('.');
    const decode = (part: string): Record<string, unknown> =>
      JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

    expect(decode(header!)).toMatchObject({ alg: 'ES256', kid: 'ABC123', typ: 'JWT' });
    expect(decode(payload!)).toMatchObject({ iss: 'issuer-1', aud: 'appstoreconnect-v1' });
    // Apple rejects anything over twenty minutes.
    expect(Number(decode(payload!).exp) - 1_700_000_000).toBeLessThanOrEqual(20 * 60);

    // The signature must be the raw 64-byte r||s form, not Node's DER output.
    expect(Buffer.from(signature!, 'base64url')).toHaveLength(64);
  });
});

describe('parseCampaignTsv', () => {
  it('reads a campaign report and totals repeated days per token', () => {
    const tsv = [
      'Date\tCampaign\tImpressions\tProduct Page Views\tTotal Downloads',
      '2026-08-01\tci-abc\t100\t40\t9',
      '2026-08-02\tci-abc\t50\t20\t4',
      '2026-08-01\tci-def\t10\t2\t0',
    ].join('\n');

    const rows = parseCampaignTsv(tsv);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.campaignToken === 'ci-abc')).toMatchObject({
      impressions: 150,
      productPageViews: 60,
      installs: 13,
    });
  });

  it('tolerates the column-name variations Apple has shipped', () => {
    const rows = parseCampaignTsv(
      'Campaign Token\tFirst-Time Downloads\tRedownloads\n' + 'tok\t7\t3\n',
    );
    expect(rows[0]).toMatchObject({ campaignToken: 'tok', firstTimeDownloads: 7, redownloads: 3 });
  });

  it('returns nothing rather than guessing when there is no campaign column', () => {
    expect(parseCampaignTsv('Date\tImpressions\n2026-08-01\t100\n')).toEqual([]);
    expect(parseCampaignTsv('')).toEqual([]);
  });
});

describe('campaignTokenFor', () => {
  it('fits inside Apple’s 40-character limit', () => {
    expect(campaignTokenFor('be1b2a5f-5015-4e0c-9194-8bae735e9e01')).toHaveLength(36);
    expect(campaignTokenFor('x'.repeat(80))).toHaveLength(40);
  });
});
