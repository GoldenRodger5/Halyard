/**
 * App Store Connect attribution. Milestone 42, item 4.
 *
 * Campaign links carry `pt` (the provider token, static for the developer
 * account), `ct` (a campaign token you choose, 40 characters), and `mt=8`.
 * Apple then reports impressions, product page views, downloads and sales
 * against each campaign token in App Store Connect → Analytics → Campaigns.
 *
 * Reading those numbers back is a three-step asynchronous API, not a GET:
 *
 *   1. Create an `analyticsReportRequest` for the app. Apple starts generating.
 *   2. Poll `analyticsReports` for the report whose name matches, then list its
 *      instances, then its segments. This can take a day for the first request.
 *   3. Download the segment — a gzipped TSV at a signed URL — and read it.
 *
 * Authentication is a short-lived ES256 JWT signed with a private key from
 * App Store Connect. There is no long-lived token; the JWT is minted per call
 * and expires in twenty minutes.
 *
 * None of this is guessable from an error message, so every failure here names
 * the exact thing that is missing and where to get it.
 */
import { createSign } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const API = 'https://api.appstoreconnect.apple.com/v1';

export interface AppStoreCredentials {
  /** Key ID from App Store Connect → Users and Access → Integrations → Keys. */
  keyId: string;
  /** Issuer ID, on the same page. One per team. */
  issuerId: string;
  /** Contents of the .p8 private key, downloadable exactly once. */
  privateKeyPem: string;
  /** Numeric app id, e.g. 6759676502 for RecipeFix. */
  appId: string;
}

export class AppStoreCredentialsMissing extends Error {
  constructor(missing: string[]) {
    super(
      `App Store attribution needs ${missing.join(', ')}. ` +
        'Create an API key in App Store Connect → Users and Access → Integrations → App Store Connect API, ' +
        'with the Sales and Reports role. The .p8 downloads once and cannot be downloaded again. ' +
        'Set APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APP_STORE_PRIVATE_KEY (the whole PEM, newlines and all) ' +
        'and APP_STORE_APP_ID. Until then every install reads as organic and mobile-first platforms are under-scored.',
    );
    this.name = 'AppStoreCredentialsMissing';
  }
}

export class AppStoreReportPending extends Error {
  constructor(reportName: string) {
    super(
      `App Store report "${reportName}" has been requested but Apple has not produced an instance yet. ` +
        'The first request for a new report can take up to 24 hours, and reports are daily thereafter. ' +
        'This is expected on the first run; the job will pick it up on the next pass.',
    );
    this.name = 'AppStoreReportPending';
  }
}

export function credentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): AppStoreCredentials {
  const missing: string[] = [];
  if (!env.APP_STORE_KEY_ID) missing.push('APP_STORE_KEY_ID');
  if (!env.APP_STORE_ISSUER_ID) missing.push('APP_STORE_ISSUER_ID');
  if (!env.APP_STORE_PRIVATE_KEY) missing.push('APP_STORE_PRIVATE_KEY');
  if (!env.APP_STORE_APP_ID) missing.push('APP_STORE_APP_ID');
  if (missing.length > 0) throw new AppStoreCredentialsMissing(missing);

  return {
    keyId: env.APP_STORE_KEY_ID!,
    issuerId: env.APP_STORE_ISSUER_ID!,
    // Env vars flatten newlines; the PEM is worthless without them.
    privateKeyPem: env.APP_STORE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    appId: env.APP_STORE_APP_ID!,
  };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * A signed ES256 JWT, which is the only accepted credential.
 *
 * Node's ES256 signature comes out DER-encoded; JWS wants the raw 64-byte
 * r||s concatenation. Skipping that conversion produces a token Apple rejects
 * with a completely unhelpful 401.
 */
export function mintAppStoreJwt(
  credentials: AppStoreCredentials,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = { alg: 'ES256', kid: credentials.keyId, typ: 'JWT' };
  const payload = {
    iss: credentials.issuerId,
    iat: nowSeconds,
    // Apple rejects anything longer than twenty minutes.
    exp: nowSeconds + 19 * 60,
    aud: 'appstoreconnect-v1',
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const der = createSign('SHA256').update(signingInput).sign(credentials.privateKeyPem);
  return `${signingInput}.${base64url(derToJose(der))}`;
}

/** DER SEQUENCE { INTEGER r, INTEGER s } → the 64-byte r||s JWS form. */
export function derToJose(der: Buffer): Buffer {
  let offset = 2;
  // A length byte over 0x80 means the length itself is multi-byte.
  if (der[1]! & 0x80) offset += der[1]! & 0x7f;

  const readInt = (): Buffer => {
    if (der[offset] !== 0x02) throw new Error('Malformed ECDSA signature from the signing key.');
    const length = der[offset + 1]!;
    let value = der.subarray(offset + 2, offset + 2 + length);
    offset += 2 + length;
    // DER prefixes a zero byte when the high bit is set; JOSE does not.
    while (value.length > 32 && value[0] === 0) value = value.subarray(1);
    return Buffer.concat([Buffer.alloc(32 - value.length), value]);
  };

  return Buffer.concat([readInt(), readInt()]);
}

export interface AppStoreCampaignRow {
  campaignToken: string;
  impressions?: number;
  productPageViews?: number;
  installs?: number;
  firstTimeDownloads?: number;
  redownloads?: number;
  proceedsUsd?: number;
}

interface ApiOptions {
  fetchImpl?: typeof fetch;
}

async function apiGet(
  path: string,
  credentials: AppStoreCredentials,
  options: ApiOptions,
): Promise<Record<string, unknown>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${API}${path}`, {
    headers: { authorization: `Bearer ${mintAppStoreJwt(credentials)}` },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `App Store Connect ${path} returned HTTP ${response.status}. ${describeStatus(response.status)} ${body.slice(0, 300)}`,
    );
  }
  return JSON.parse(body) as Record<string, unknown>;
}

function describeStatus(status: number): string {
  if (status === 401) {
    return 'The JWT was rejected — usually a wrong issuer id, or a private key that lost its newlines when it went into the environment.';
  }
  if (status === 403) {
    return 'The API key lacks the Sales and Reports role. Change it in App Store Connect → Users and Access → Integrations.';
  }
  if (status === 404) return 'Check APP_STORE_APP_ID against the numeric id in your App Store URL.';
  if (status === 429) return 'Rate limited. Apple allows a small number of report requests per hour.';
  return '';
}

/**
 * Ensure a campaign report exists, and return the rows from its newest segment.
 *
 * Idempotent: creating a report request that already exists returns a 409, which
 * is treated as success because the report is what we wanted.
 */
export async function fetchCampaignReport(
  credentials: AppStoreCredentials,
  options: ApiOptions = {},
): Promise<{ rows: AppStoreCampaignRow[]; collectedAt: Date }> {
  const fetchImpl = options.fetchImpl ?? fetch;

  // 1 — a standing ONGOING request for this app.
  const existing = (await apiGet(
    `/apps/${credentials.appId}/analyticsReportRequests?filter[accessType]=ONGOING&limit=50`,
    credentials,
    options,
  )) as { data?: Array<{ id: string }> };

  let requestId = existing.data?.[0]?.id;
  if (!requestId) {
    const created = await fetchImpl(`${API}/analyticsReportRequests`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${mintAppStoreJwt(credentials)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'analyticsReportRequests',
          attributes: { accessType: 'ONGOING' },
          relationships: { app: { data: { type: 'apps', id: credentials.appId } } },
        },
      }),
    });
    if (!created.ok && created.status !== 409) {
      throw new Error(
        `Could not request an App Store analytics report: HTTP ${created.status}. ${describeStatus(created.status)}`,
      );
    }
    const body = (await created.json().catch(() => ({}))) as { data?: { id: string } };
    requestId = body.data?.id;
    if (!requestId) throw new AppStoreReportPending('App Store Engagement / Acquisition');
  }

  // 2 — the acquisition report, then its newest instance, then its segments.
  const reports = (await apiGet(
    `/analyticsReportRequests/${requestId}/reports?filter[category]=APP_STORE_ENGAGEMENT&limit=200`,
    credentials,
    options,
  )) as { data?: Array<{ id: string; attributes?: { name?: string } }> };

  const report = reports.data?.find((r) =>
    /app store discovery and engagement|app store installation and deletion/i.test(
      r.attributes?.name ?? '',
    ),
  );
  if (!report) throw new AppStoreReportPending('App Store Discovery and Engagement');

  const instances = (await apiGet(
    `/analyticsReports/${report.id}/instances?filter[granularity]=DAILY&limit=1`,
    credentials,
    options,
  )) as { data?: Array<{ id: string; attributes?: { processingDate?: string } }> };

  const instance = instances.data?.[0];
  if (!instance) throw new AppStoreReportPending(report.attributes?.name ?? 'campaign report');

  const segments = (await apiGet(
    `/analyticsReportInstances/${instance.id}/segments?limit=50`,
    credentials,
    options,
  )) as { data?: Array<{ attributes?: { url?: string } }> };

  const rows: AppStoreCampaignRow[] = [];
  for (const segment of segments.data ?? []) {
    const url = segment.attributes?.url;
    if (!url) continue;
    // Segment URLs are pre-signed and must be fetched without the JWT.
    const download = await fetchImpl(url);
    if (!download.ok) continue;
    const gz = Buffer.from(await download.arrayBuffer());
    rows.push(...parseCampaignTsv(gunzipSync(gz).toString('utf8')));
  }

  return {
    rows,
    collectedAt: instance.attributes?.processingDate
      ? new Date(instance.attributes.processingDate)
      : new Date(),
  };
}

/**
 * Apple ships these as gzipped TSV with a header row. Column names have changed
 * between report versions, so each metric accepts the spellings seen in the
 * wild rather than one exact string.
 */
export function parseCampaignTsv(tsv: string): AppStoreCampaignRow[] {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0]!.split('\t').map((h) => h.trim().toLowerCase());
  const index = (...names: string[]): number =>
    header.findIndex((h) => names.some((n) => h === n || h.replace(/[^a-z]/g, '') === n));

  const campaignAt = index('campaign', 'campaignid', 'campaigntoken', 'sourceinfo');
  if (campaignAt < 0) return [];

  const impressionsAt = index('impressions', 'impressionsunique');
  const viewsAt = index('productpageviews', 'productpageviewsunique');
  const installsAt = index('totaldownloads', 'installs', 'units');
  const firstAt = index('firsttimedownloads');
  const redownloadAt = index('redownloads');
  const proceedsAt = index('proceedsinusd', 'proceeds');

  const totals = new Map<string, AppStoreCampaignRow>();

  for (const line of lines.slice(1)) {
    const cells = line.split('\t');
    const token = (cells[campaignAt] ?? '').trim();
    if (!token) continue;

    const row = totals.get(token) ?? { campaignToken: token };
    const add = (at: number, key: keyof AppStoreCampaignRow): void => {
      if (at < 0) return;
      const value = Number((cells[at] ?? '').replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(value)) return;
      (row[key] as number) = ((row[key] as number | undefined) ?? 0) + value;
    };

    add(impressionsAt, 'impressions');
    add(viewsAt, 'productPageViews');
    add(installsAt, 'installs');
    add(firstAt, 'firstTimeDownloads');
    add(redownloadAt, 'redownloads');
    add(proceedsAt, 'proceedsUsd');

    totals.set(token, row);
  }

  return [...totals.values()];
}

/**
 * The campaign token a content item carries.
 *
 * Apple caps this at 40 characters and it is the only key linking an install
 * back to a post, so it has to be both short and unique. The item's id is a
 * uuid — 36 characters — which fits with room for a prefix.
 */
export function campaignTokenFor(contentItemId: string): string {
  return contentItemId.slice(0, 40);
}
