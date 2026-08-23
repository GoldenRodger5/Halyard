/**
 * The badge must never call an unusable account healthy.
 *
 * CLAUDE.md gotcha 5: `capability_state = 'live'` records that an operator
 * marked the account past platform review. It says nothing about whether a
 * credential exists. The accounts screen has resolved that through
 * `accountStatus` since §64; the dashboard and health screens were badging the
 * raw column, and `@isaacmineo` sits in the database right now as `live` with
 * no token and no identity confirmation — rendering as healthy on the two
 * screens an operator looks at first.
 */
import { describe, expect, it } from 'vitest';
import { accountBadge } from './accountBadge';
import type { AccountRow } from './queries';

function row(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'a', product_id: 'recipefix', product_name: 'RecipeFix', product_kind: 'app',
    platform: 'x', persona: 'brand', handle: '@brand', display_name: null, avatar_url: null,
    follower_count: null, capability_state: 'live', capability_detail: null,
    supported_formats: ['text'], link_strategy: 'inline', bio_link_url: null,
    token_expires_at: null, last_verified_at: null, last_error: null,
    identity_confirmed_at: '2026-01-01T00:00:00Z', identity_warning: null,
    last_self_test_at: null, last_self_test_ok: null, last_self_test_detail: null,
    last_published_at: null, has_token: true, transport: 'direct', provider_account_id: null,
    ...over,
  } as AccountRow;
}

describe('accountBadge', () => {
  it('does not report a live account with no token as good', () => {
    /*
     * The exact row in the database today. This is the assertion the whole file
     * exists for: `live` plus no credential must not read as healthy.
     */
    const badge = accountBadge(row({ capability_state: 'live', has_token: false, identity_confirmed_at: null }));
    expect(badge.tone).not.toBe('good');
    expect(badge.label.toLowerCase()).not.toContain('live');
  });

  it('does not report a live account whose identity was never confirmed as good', () => {
    expect(accountBadge(row({ has_token: true, identity_confirmed_at: null })).tone).not.toBe('good');
  });

  it('reports a genuinely connected account as good', () => {
    // The negative cases above are only meaningful if the positive one passes.
    expect(accountBadge(row()).tone).toBe('good');
  });

  it('does not report an expired token as good', () => {
    const badge = accountBadge(row({ token_expires_at: '2020-01-01T00:00:00Z' }));
    expect(badge.tone).not.toBe('good');
  });

  it('carries an explanation, so the badge is not the whole story', () => {
    expect(accountBadge(row({ has_token: false })).explanation.length).toBeGreaterThan(10);
  });
});
