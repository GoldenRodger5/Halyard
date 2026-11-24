/**
 * Proof and visual assets, each with provenance and licence, read from the
 * product repo at a pinned commit. Rights are decided here, at load time, so a
 * blocked asset never reaches a renderer (brand.md §4; QUALITY §3 "Rights").
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type AssetKind = 'stored_output' | 'originals_photo' | 'product_capture' | 'audio' | 'diagram';

export interface AssetRecord {
  id: string;
  kind: AssetKind;
  /** `git:<repo-name>@<commit>:<path>` or a local path for captures. */
  location: string;
  sha256: string;
  provenance: string;
  licence: string;
  /** What a viewer must be told when this asset is shown. */
  disclosure?: string;
  capturedAt?: string;
}

export interface GitRef {
  repo: string;
  commit: string;
}

/** Hosts and paths that are never marketing assets (publisher og:images, unprovenanced examples). */
export const BLOCKED_ASSET_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /^https?:\/\//i, why: 'remote image: publisher og:images and hotlinks are never marketing assets (brand.md §4)' },
  { pattern: /saved_recipes|image_url|og[:_-]?image/i, why: 'publisher image field (brand.md §4, DISTRIBUTION.md)' },
  { pattern: /\/images\/examples\//, why: 'example photos without recorded provenance (brand.md §4)' },
];

export class BlockedAssetError extends Error {
  constructor(location: string, why: string) {
    super(`Blocked asset ${location}: ${why}`);
    this.name = 'BlockedAssetError';
  }
}

export function assertAllowed(location: string): void {
  for (const b of BLOCKED_ASSET_PATTERNS) if (b.pattern.test(location)) throw new BlockedAssetError(location, b.why);
}

export function gitBytes(ref: GitRef, file: string): Buffer {
  return execFileSync('git', ['-C', ref.repo, 'show', `${ref.commit}:${file}`], { maxBuffer: 64 * 1024 * 1024 });
}

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * A stored real product output kept as a TypeScript constant (RecipeFix's
 * `LANDING_REAL_RESULT`). The object literal is JSON (keys quoted), so it is
 * parsed, not evaluated.
 */
export function loadStoredOutput(
  ref: GitRef,
  file: string,
  exportName: string,
): { data: Record<string, unknown>; capturedOn: string | null; record: AssetRecord } {
  const src = gitBytes(ref, file).toString('utf8');
  const start = src.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`${file} has no export ${exportName}`);
  const open = src.indexOf('{', src.indexOf('=', start));
  let depth = 0;
  let end = -1;
  let inString = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const data = JSON.parse(src.slice(open, end + 1)) as Record<string, unknown>;
  const captured = src.match(/CAPTURED_ON\s*=\s*"(\d{4}-\d{2}-\d{2})"/);
  return {
    data,
    capturedOn: captured?.[1] ?? null,
    record: {
      id: `${exportName}`,
      kind: 'stored_output',
      location: `git:${ref.repo.split('/').pop()}@${ref.commit}:${file}#${exportName}`,
      sha256: sha256(src),
      provenance: `Verbatim production response stored in the product repo${captured ? `, captured ${captured[1]}` : ''}`,
      licence: 'first-party',
      disclosure: captured ? `Real RecipeFix result, captured ${captured[1]}` : 'Real RecipeFix result',
      ...(captured ? { capturedAt: captured[1] } : {}),
    },
  };
}

/** A product-repo photo whose provenance is recorded in a provenance doc row. */
export function loadProvenancedPhoto(
  ref: GitRef,
  file: string,
  provenanceDoc: string,
  rowMatch: RegExp,
  licence: string,
  disclosure: string,
): { bytes: Buffer; record: AssetRecord } {
  assertAllowed(file);
  const doc = gitBytes(ref, provenanceDoc).toString('utf8');
  const row = doc.split('\n').find((l) => rowMatch.test(l));
  if (!row) throw new BlockedAssetError(file, `no provenance row in ${provenanceDoc} matching ${rowMatch}`);
  const bytes = gitBytes(ref, file);
  return {
    bytes,
    record: {
      id: file.split('/').pop()!,
      kind: 'originals_photo',
      location: `git:${ref.repo.split('/').pop()}@${ref.commit}:${file}`,
      sha256: sha256(bytes),
      provenance: `${provenanceDoc}: ${row.trim()}`,
      licence,
      disclosure,
    },
  };
}

export function loadLocalAsset(file: string, kind: AssetKind, provenance: string, licence: string, disclosure?: string): {
  bytes: Buffer;
  record: AssetRecord;
} {
  assertAllowed(file);
  const bytes = readFileSync(file);
  return {
    bytes,
    record: { id: file.split('/').pop()!, kind, location: file, sha256: sha256(bytes), provenance, licence, ...(disclosure ? { disclosure } : {}) },
  };
}
