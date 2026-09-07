/**
 * §567. The release identity has to be right about the thing it is trusted for.
 *
 * These are the states an operator reads a status page to distinguish, so each
 * one is asserted rather than assumed — particularly the two that must never be
 * confused: a database *behind* the code (broken now) and a database *ahead* of
 * it (a migration landing, which is the safe order).
 */
import { describe, expect, it } from 'vitest';
import { compareRevisions, compareSchema, releaseIdentity } from './identity.js';

describe('releaseIdentity', () => {
  it('reads Railway’s commit, shortened, and says so', () => {
    const id = releaseIdentity({
      RAILWAY_GIT_COMMIT_SHA: '33bdf5431411a4a12eca0704678bd88143babc1f',
      RAILWAY_ENVIRONMENT_NAME: 'production',
    } as NodeJS.ProcessEnv);

    expect(id.commit).toBe('33bdf5431411');
    expect(id.environment).toBe('production');
    expect(id.source).toBe('RAILWAY_GIT_COMMIT_SHA');
  });

  it('reads Vercel’s commit and environment', () => {
    const id = releaseIdentity({
      VERCEL_GIT_COMMIT_SHA: '09b9d3d04d4c5d89aaadedb547fb18b4d2ba84a6',
      VERCEL_ENV: 'preview',
    } as NodeJS.ProcessEnv);

    expect(id.commit).toBe('09b9d3d04d4c');
    expect(id.environment).toBe('preview');
  });

  it('prefers the stamp next.config bakes at build time', () => {
    const id = releaseIdentity({
      HALYARD_RELEASE: 'aaaaaaaaaaaaaaaa',
      VERCEL_GIT_COMMIT_SHA: 'bbbbbbbbbbbbbbbb',
    } as NodeJS.ProcessEnv);

    expect(id.commit).toBe('aaaaaaaaaaaa');
    expect(id.source).toBe('HALYARD_RELEASE');
  });

  it("treats next.config's literal 'unknown' stamp as absent, not as a commit", () => {
    // next.config.ts bakes HALYARD_RELEASE='unknown' when Vercel gave no SHA.
    // Rendering that as the running commit is confidently wrong.
    const id = releaseIdentity({
      HALYARD_RELEASE: 'unknown',
      VERCEL_GIT_COMMIT_SHA: 'bbbbbbbbbbbbbbbb',
    } as NodeJS.ProcessEnv);

    expect(id.commit).toBe('bbbbbbbbbbbb');
    expect(id.source).toBe('VERCEL_GIT_COMMIT_SHA');
  });

  it('reports null rather than inventing a version when nothing says', () => {
    const id = releaseIdentity({} as NodeJS.ProcessEnv);

    expect(id.commit).toBeNull();
    expect(id.builtAt).toBeNull();
    expect(id.environment).toBe('unknown');
    expect(id.source).toBe('none');
  });

  it('treats an empty variable as absent, because dotenv parses `KEY=` to ""', () => {
    // Gotcha 3, one layer along: `??` does not fall back on an empty string.
    const id = releaseIdentity({ VERCEL_GIT_COMMIT_SHA: '   ' } as NodeJS.ProcessEnv);
    expect(id.commit).toBeNull();
  });

  it('normalises a build time and refuses one that is not a date', () => {
    expect(
      releaseIdentity({ HALYARD_BUILT_AT: '2026-09-07T12:00:00Z' } as NodeJS.ProcessEnv).builtAt,
    ).toBe('2026-09-07T12:00:00.000Z');

    expect(
      releaseIdentity({ HALYARD_BUILT_AT: 'whenever' } as NodeJS.ProcessEnv).builtAt,
    ).toBeNull();
  });

  it('does not call an unrecognised environment production', () => {
    const id = releaseIdentity({ RAILWAY_ENVIRONMENT_NAME: 'isaac-branch' } as NodeJS.ProcessEnv);
    expect(id.environment).toBe('unknown');
  });
});

describe('compareRevisions', () => {
  it('agrees when both are on the same commit', () => {
    expect(compareRevisions('abc123abc123', 'abc123abc123').state).toBe('ok');
  });

  it('warns rather than fails on a mismatch, because a deploy in flight looks like this', () => {
    const finding = compareRevisions('abc123abc123', 'def456def456');
    expect(finding.state).toBe('warn');
    expect(finding.detail).toContain('abc123abc123');
    expect(finding.detail).toContain('def456def456');
  });

  it('is unknown, never ok, when a side does not report', () => {
    expect(compareRevisions('abc123abc123', null).state).toBe('unknown');
    expect(compareRevisions(null, null).state).toBe('unknown');
  });
});

describe('compareSchema', () => {
  it('agrees when the database is stamped with the migration this build expects', () => {
    expect(compareSchema('0082', '0082').state).toBe('ok');
  });

  it('fails when the database is behind the code — the columns are not there', () => {
    const finding = compareSchema('0082', '0080');
    expect(finding.state).toBe('fail');
    expect(finding.detail).toContain('unapplied migrations');
  });

  it('only warns when the database is ahead, which is the safe deploy order', () => {
    expect(compareSchema('0080', '0082').state).toBe('warn');
  });

  it('is unknown on a database too old to carry the marker', () => {
    const finding = compareSchema('0082', null);
    expect(finding.state).toBe('unknown');
    expect(finding.detail).toContain('predates migration 0082');
  });
});
