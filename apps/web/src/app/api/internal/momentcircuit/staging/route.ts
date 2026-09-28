import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'momentcircuit-halyard-staging';
const ALLOWED_REPOSITORY = 'GoldenRodger5/MomentCircuit';
const BUCKET = 'halyard-assets';
const PREFIX = 'momentcircuit/';

interface Claims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  repository?: string;
  repository_owner?: string;
  ref?: string;
  event_name?: string;
  [key: string]: unknown;
}

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

function decodePart(part: string): Uint8Array {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return Uint8Array.from(Buffer.from(padded, 'base64'));
}

function decodeJson<T>(part: string): T {
  return JSON.parse(Buffer.from(decodePart(part)).toString('utf8')) as T;
}

async function verifyGithubOidc(token: string): Promise<Claims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_token_shape');
  const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]!);
  const claims = decodeJson<Claims>(parts[1]!);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unsupported_token_header');

  const configResponse = await fetch(`${ISSUER}/.well-known/openid-configuration`, {
    cache: 'force-cache',
  });
  if (!configResponse.ok) throw new Error('oidc_config_unavailable');
  const config = (await configResponse.json()) as { jwks_uri?: string };
  if (!config.jwks_uri) throw new Error('oidc_jwks_missing');

  const jwksResponse = await fetch(config.jwks_uri, { cache: 'force-cache' });
  if (!jwksResponse.ok) throw new Error('oidc_jwks_unavailable');
  const jwks = (await jwksResponse.json()) as { keys?: Jwk[] };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('oidc_signing_key_not_found');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = decodePart(parts[2]!);
  const signatureBuffer = new Uint8Array(signature.byteLength);
  signatureBuffer.set(signature);
  const signedBuffer = new Uint8Array(signed.byteLength);
  signedBuffer.set(signed);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signatureBuffer.buffer,
    signedBuffer.buffer,
  );
  if (!valid) throw new Error('invalid_signature');

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) throw new Error('invalid_issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(AUDIENCE)) throw new Error('invalid_audience');
  if (!claims.exp || claims.exp < now - 30) throw new Error('token_expired');
  if (claims.nbf && claims.nbf > now + 30) throw new Error('token_not_active');
  if (claims.repository !== ALLOWED_REPOSITORY) throw new Error('repository_not_allowed');
  return claims;
}

async function requireMomentCircuit(request: NextRequest): Promise<Claims> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) throw new Error('missing_bearer_token');
  return verifyGithubOidc(token);
}

function safeSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 100);
}

function storageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('storage_not_configured');
  return { url: url.replace(/\/$/, ''), client: createClient(url, key, { auth: { persistSession: false } }) };
}

export async function POST(request: NextRequest) {
  try {
    const claims = await requireMomentCircuit(request);
    const body = (await request.json()) as {
      jobId?: string;
      filename?: string;
      contentType?: string;
    };
    const jobId = safeSegment(body.jobId ?? '');
    const filename = safeSegment(body.filename ?? '');
    const contentType = body.contentType ?? 'video/mp4';
    if (!jobId || !filename) return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
    if (!['video/mp4', 'image/jpeg', 'application/json'].includes(contentType)) {
      return NextResponse.json({ error: 'unsupported_content_type' }, { status: 400 });
    }

    const ext = contentType === 'video/mp4' ? '.mp4' : contentType === 'image/jpeg' ? '.jpg' : '.json';
    const normalized = filename.endsWith(ext) ? filename : `${filename}${ext}`;
    const objectPath = `${PREFIX}${jobId}/${crypto.randomUUID()}-${normalized}`;
    const { url, client } = storageClient();
    const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(objectPath, {
      upsert: false,
    });
    if (error || !data?.token) {
      console.error('MomentCircuit signed upload mint failed', { error: error?.message });
      return NextResponse.json({ error: 'signed_upload_failed' }, { status: 502 });
    }

    const projectRef = new URL(url).hostname.split('.')[0]!;
    return NextResponse.json({
      bucket: BUCKET,
      path: objectPath,
      token: data.token,
      signedUrl: data.signedUrl,
      resumableUrl: `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
      publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${objectPath}`,
      expiresInSeconds: 7200,
      repository: claims.repository,
    });
  } catch (error) {
    console.error('MomentCircuit staging authorization failed', { error: String(error) });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireMomentCircuit(request);
    const body = (await request.json()) as { path?: string };
    const objectPath = body.path ?? '';
    if (!objectPath.startsWith(PREFIX) || objectPath.includes('..')) {
      return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
    }
    const { client } = storageClient();
    const { error } = await client.storage.from(BUCKET).remove([objectPath]);
    if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('MomentCircuit staging delete authorization failed', { error: String(error) });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}
