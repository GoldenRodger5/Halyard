/**
 * §420. Meta has two scope families that both grant publishing.
 *
 * *Instagram API with Instagram Login* grants
 * `instagram_business_content_publish`. *Facebook Login for Business* grants
 * `instagram_content_publish`. Which one an account carries depends on the flow
 * it was connected through, and checking only one calls a working account
 * unauthorised.
 *
 * Found live: @recipe.fix holds the second family, is connected with a valid
 * token, and was written with `supported_formats = {}` — so `generate.ts`
 * skipped it with "account cannot take any format Halyard produces". A
 * connected, publishable account that could not be drafted for, on the platform
 * the operator most wanted.
 */
import { describe, expect, it } from 'vitest';
import { InstagramAdapter } from './instagram.js';

/** The capability report, with the network calls stubbed out. */
async function reportFor(scopes: string[]) {
  const adapter = new InstagramAdapter();
  const anyAdapter = adapter as unknown as {
    get: (path: string, account: unknown) => Promise<unknown>;
  };
  anyAdapter.get = async (path: string) => {
    if (path.includes('accounts')) {
      return { data: [{ instagram_business_account: { id: '1' }, id: 'p1' }] };
    }
    return { username: 'recipe.fix', media_count: 3 };
  };
  return adapter.verifyCapabilities({
    handle: 'recipe.fix',
    platformUserId: '17841400000000000',
    tokens: { accessToken: 'tok', scopes },
    meta: {},
  } as never);
}

describe('which Instagram scopes count as publishable', () => {
  it('accepts the Instagram Login family', async () => {
    const r = await reportFor(['instagram_business_basic', 'instagram_business_content_publish']);
    expect(r.state).not.toBe('pending_auth');
    expect(r.supportedFormats.length).toBeGreaterThan(0);
  });

  it('accepts the Facebook Login for Business family', async () => {
    /* What @recipe.fix actually holds. */
    const r = await reportFor([
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
    ]);
    expect(r.state).not.toBe('pending_auth');
    expect(r.supportedFormats.length).toBeGreaterThan(0);
  });

  it('still refuses an account with neither', async () => {
    const r = await reportFor(['instagram_basic', 'pages_show_list']);
    expect(r.state).toBe('pending_auth');
    expect(r.supportedFormats).toEqual([]);
  });

  it('names both families when it refuses, so the fix is obvious', async () => {
    const r = await reportFor(['instagram_basic']);
    expect(r.detail).toContain('instagram_content_publish');
    expect(r.detail).toContain('instagram_business_content_publish');
  });

  it('reports formats a generator can act on, never an empty list, when publishable', async () => {
    /*
     * `supported_formats = {}` is what made `generate.ts` skip the account
     * entirely. An empty list from a publishable account is the defect.
     */
    const r = await reportFor(['instagram_content_publish']);
    expect(r.supportedFormats).toContain('image');
  });
});
