import { describe, expect, it } from 'vitest';
import { assessReadiness, type ReadinessInput } from './readiness.js';
import { SCHEMA_EXPECTATIONS } from './schema.js';

function input(over: Partial<ReadinessInput['pipeline']> = {}): ReadinessInput {
  return {
    product: null,
    onboarding: null,
    accounts: [],
    pipeline: {
      workerSeenSecondsAgo: 10,
      queuedJobs: 0,
      deadJobs: 0,
      renderSuccessRate: 1,
      flowsVerified: 3,
      flowsBroken: 0,
      flowsNeverRun: 0,
      pendingApproval: 0,
      ...over,
    },
    attribution: { utmStampedPosts: 0, attributionRows: 0, appStoreConfigured: false, routedClicks: 0 },
    safety: {
      publishingEnabled: false,
      tokenEncryptionKeySet: true,
      devUnauthenticated: false,
      sentryConfigured: false,
      release: 'test',
    },
    env: {},
  };
}

const schemaCheck = (i: ReadinessInput) =>
  assessReadiness(i)
    .find((s) => s.id === 'pipeline')!
    .checks.find((c) => c.id === 'pipeline.schema')!;

describe('§492 the database has every column this build reads', () => {
  it('is a red row that names the migration when a column is missing', () => {
    const check = schemaCheck(input({ schemaMissing: [SCHEMA_EXPECTATIONS[1]!] }));
    expect(check.state).toBe('fail');
    expect(check.detail).toMatch(/renders\.treatment/);
    expect(check.fix).toMatch(/supabase\/migrations\/0071_\*\.sql/);
    expect(check.needsYou).toBe(true);
  });
  it('passes when nothing is missing', () => {
    const check = schemaCheck(input({ schemaMissing: [] }));
    expect(check.state).toBe('pass');
    expect(check.fix).toBeUndefined();
  });
  it('warns, never passes, when the database could not be asked', () => {
    expect(schemaCheck(input()).state).toBe('warn');
  });
});
