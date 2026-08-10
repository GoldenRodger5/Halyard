/**
 * The account setup kit. Milestone 50.
 *
 * Two things here are worth testing hard. The handle checker must never turn an
 * ambiguous response into "available", because acting on that means a rebrand
 * across seven profiles. And the ZIP must be a real ZIP, because there is no
 * partial credit — an archive with one wrong offset does not open at all.
 */
import { describe, expect, it } from 'vitest';
import {
  CREATION_ORDER,
  PROFILE_SPECS,
  SETUP_CHECKLISTS,
  buildZip,
  checkHandle,
  checkHandleEverywhere,
  crc32,
  normaliseBluesky,
  profileUrl,
  summariseChecks,
  generateProfileCopy,
} from './index.js';
import type { LlmClient, LlmRequest, LlmResponse } from '../generation/llm.js';
import { allAdapters } from '../adapters/index.js';

const respondWith = (status: number): typeof fetch =>
  (async () => new Response(null, { status })) as unknown as typeof fetch;

// ── the specs ───────────────────────────────────────────────────────────────

describe('profile specs', () => {
  it('covers every platform that has an adapter', () => {
    for (const adapter of allAdapters()) {
      expect(PROFILE_SPECS[adapter.platform]).toBeTruthy();
      expect(SETUP_CHECKLISTS[adapter.platform].length).toBeGreaterThan(0);
    }
    expect(CREATION_ORDER).toHaveLength(allAdapters().length);
  });

  it('puts Instagram before Threads, because Threads inherits its handle', () => {
    expect(CREATION_ORDER.indexOf('instagram')).toBeLessThan(CREATION_ORDER.indexOf('threads'));
  });

  it('marks the requirements that make API publishing impossible, not merely worse', () => {
    // The Instagram ones are the reason this list exists: a Creator account
    // cannot be published to however approved the app is.
    const instagram = SETUP_CHECKLISTS.instagram.filter((step) => step.blocking);
    expect(instagram.length).toBeGreaterThanOrEqual(3);
    expect(SETUP_CHECKLISTS.instagram.some((s) => /Professional/i.test(s.label))).toBe(true);
    expect(SETUP_CHECKLISTS.instagram.some((s) => /Facebook Page/i.test(s.label))).toBe(true);
  });

  it('gives every platform a real avatar size and only some a banner', () => {
    for (const spec of Object.values(PROFILE_SPECS)) {
      expect(spec.avatar.width).toBeGreaterThan(0);
      expect(spec.avatar.width).toBe(spec.avatar.height);
      expect(spec.bioMaxChars).toBeGreaterThan(0);
    }
    expect(PROFILE_SPECS.x.banner).toBeTruthy();
    expect(PROFILE_SPECS.youtube.banner).toBeTruthy();
    expect(PROFILE_SPECS.instagram.banner).toBeUndefined();
    expect(PROFILE_SPECS.tiktok.banner).toBeUndefined();
  });
});

// ── handles ─────────────────────────────────────────────────────────────────

describe('handle availability', () => {
  it('never reports a platform it cannot check as available', async () => {
    for (const platform of ['x', 'tiktok'] as const) {
      const check = await checkHandle(platform, 'recipefix', respondWith(404));
      expect(check.status).toBe('unknown');
      expect(check.method).toBe('manual');
      // And it says why, rather than leaving the operator to wonder.
      expect(check.detail.length).toBeGreaterThan(20);
    }
  });

  it('reads a 404 on a public profile as free, and says what else looks like that', async () => {
    const check = await checkHandle('youtube', 'recipefix', respondWith(404));
    expect(check.status).toBe('available');
    expect(check.detail).toMatch(/reserved|suspended/i);
  });

  it('reads a 200 as taken', async () => {
    expect((await checkHandle('pinterest', 'recipefix', respondWith(200))).status).toBe('taken');
  });

  it('treats a redirect as unknown, because it is usually a login wall', async () => {
    const check = await checkHandle('instagram', 'recipefix', respondWith(302));
    expect(check.status).toBe('unknown');
  });

  it('treats a rate limit as unknown rather than as an answer', async () => {
    expect((await checkHandle('threads', 'recipefix', respondWith(429))).status).toBe('unknown');
  });

  it('uses Bluesky’s real resolver, where 400 genuinely means nobody holds it', async () => {
    const free = await checkHandle('bluesky', 'recipefix', respondWith(400));
    expect(free.status).toBe('available');
    expect(free.method).toBe('api');
    expect(free.detail).toContain('reliable');

    const taken = await checkHandle('bluesky', 'recipefix', respondWith(200));
    expect(taken.status).toBe('taken');
  });

  it('appends bsky.social only when the handle is not already a domain', () => {
    expect(normaliseBluesky('recipefix')).toBe('recipefix.bsky.social');
    expect(normaliseBluesky('@RecipeFix')).toBe('recipefix.bsky.social');
    expect(normaliseBluesky('recipefix.app')).toBe('recipefix.app');
  });

  it('rejects an illegal handle before making any request', async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const check = await checkHandle('x', 'way-too-long-for-x-by-far', spy);
    expect(check.status).toBe('invalid');
    expect(called).toBe(false);
  });

  it('survives a network failure without losing the other platforms', async () => {
    const flaky = (async (url: string) => {
      if (String(url).includes('youtube')) throw new Error('ECONNRESET');
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const checks = await checkHandleEverywhere('recipefix', [...CREATION_ORDER], flaky);
    expect(checks).toHaveLength(CREATION_ORDER.length);
    const youtube = checks.find((c) => c.platform === 'youtube')!;
    expect(youtube.status).toBe('unknown');
    expect(youtube.detail).toContain('ECONNRESET');
  });

  it('always hands back somewhere to look, even when it answered confidently', async () => {
    const checks = await checkHandleEverywhere('recipefix', [...CREATION_ORDER], respondWith(404));
    for (const check of checks) {
      expect(check.checkUrl).toMatch(/^https:\/\//);
    }
  });

  it('summarises unknowns as unknown rather than folding them into free', async () => {
    const checks = await checkHandleEverywhere('recipefix', [...CREATION_ORDER], respondWith(404));
    const summary = summariseChecks(checks);
    expect(summary).toContain('unknown, not free');
  });

  it('builds a profile URL per platform', () => {
    expect(profileUrl('x', '@recipefix')).toBe('https://x.com/recipefix');
    expect(profileUrl('youtube', 'recipefix')).toBe('https://www.youtube.com/@recipefix');
    expect(profileUrl('bluesky', 'recipefix')).toContain('recipefix.bsky.social');
  });
});

// ── the archive ─────────────────────────────────────────────────────────────

describe('buildZip', () => {
  const read = (zip: Buffer, offset: number) => zip.readUInt32LE(offset);

  it('writes the signatures a ZIP reader looks for', () => {
    const zip = buildZip([{ path: 'a.txt', content: 'hello' }]);
    expect(read(zip, 0)).toBe(0x04034b50); // local header
    expect(read(zip, zip.length - 22)).toBe(0x06054b50); // end of central directory
  });

  it('records the entry count in both places the format asks for', () => {
    const zip = buildZip([
      { path: 'a.txt', content: 'one' },
      { path: 'b/c.txt', content: 'two' },
    ]);
    const end = zip.length - 22;
    expect(zip.readUInt16LE(end + 8)).toBe(2);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
  });

  it('points the central directory at the right offset', () => {
    const zip = buildZip([{ path: 'a.txt', content: 'hello' }]);
    const end = zip.length - 22;
    const centralOffset = zip.readUInt32LE(end + 16);
    expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50);
  });

  it('stores content verbatim, so the bytes can be found in the archive', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const zip = buildZip([{ path: 'images/x-avatar.png', content: png }]);
    expect(zip.includes(png)).toBe(true);
  });

  it('computes a CRC that matches the known value for a known input', () => {
    // The standard check value for "123456789".
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('is byte-identical across runs, so downloading twice gives one file', () => {
    const entries = [{ path: 'profiles.txt', content: 'bios' }];
    expect(buildZip(entries).equals(buildZip(entries))).toBe(true);
  });

  it('refuses a duplicate path rather than writing an archive that opens oddly', () => {
    expect(() =>
      buildZip([
        { path: 'a.txt', content: '1' },
        { path: 'a.txt', content: '2' },
      ]),
    ).toThrow(/Duplicate/);
  });

  it('handles an empty archive without producing garbage', () => {
    const zip = buildZip([]);
    expect(zip).toHaveLength(22);
    expect(read(zip, 0)).toBe(0x06054b50);
  });

  it('marks names as UTF-8 so a non-ASCII product name survives', () => {
    const zip = buildZip([{ path: 'café/bio.txt', content: 'x' }]);
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(zip.includes(Buffer.from('café', 'utf8'))).toBe(true);
  });
});

// ── generation ──────────────────────────────────────────────────────────────

function stubLlm(replies: string[]): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  let index = 0;
  return {
    calls,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      calls.push(request);
      const text = replies[Math.min(index, replies.length - 1)]!;
      index += 1;
      return { text, model: 'stub', inputTokens: 0, outputTokens: 0, costUsd: 0 };
    },
  };
}

const request = {
  platform: 'x' as const,
  persona: 'brand' as const,
  productName: 'RecipeFix',
  productTagline: 'Recipes that work for how you actually eat',
  productBrief: 'RecipeFix adapts any recipe to a dietary need. It does not guarantee allergy safety.',
  voice: { displayName: 'RecipeFix', description: 'Plain, specific.', doRules: [], dontRules: [] },
  linkInBioUrl: 'https://recipefix.app/l/recipefix',
};

const goodReply = JSON.stringify({
  bios: [
    { text: 'Your gluten-free loaf is gummy. We fix the recipe, not your resolve.', angle: 'problem' },
    { text: 'Adapts any recipe to how you actually eat. Built by one person.', angle: 'plain' },
    { text: 'For anybody cooking around a restriction and tired of guessing.', angle: 'audience' },
  ],
  display_names: ['RecipeFix', 'RecipeFix App', 'RecipeFix by Isaac'],
  pinned_post: 'This account is about one thing. Recipes that survive a dietary swap.',
});

describe('generateProfileCopy', () => {
  it('returns the variants when everything fits', async () => {
    const llm = stubLlm([goodReply]);
    const result = await generateProfileCopy(request, llm);
    expect(result.bios).toHaveLength(3);
    expect(result.displayNames).toHaveLength(3);
    expect(result.pinnedPost).toBeTruthy();
    expect(llm.calls).toHaveLength(1);
  });

  it('puts the real character limit in the prompt, not a rounded one', async () => {
    const llm = stubLlm([goodReply]);
    await generateProfileCopy(request, llm);
    expect(llm.calls[0]!.messages[0]!.content).toContain(
      `${PROFILE_SPECS.x.bioMaxChars} characters`,
    );
  });

  it('regenerates an over-length bio instead of truncating it mid-word', async () => {
    const tooLong = JSON.stringify({
      bios: [{ text: 'x'.repeat(400), angle: 'problem' }],
      display_names: ['RecipeFix'],
      pinned_post: 'Hello.',
    });
    const llm = stubLlm([tooLong, goodReply]);
    const result = await generateProfileCopy(request, llm);

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]!.messages[0]!.content).toContain('over the 160 limit');
    expect(result.bios.every((bio) => bio.length <= PROFILE_SPECS.x.bioMaxChars)).toBe(true);
  });

  it('runs a bio through the same lint every post goes through', async () => {
    // An em dash is rejected everywhere else in the system. A bio outlives a
    // post, so it is the last place it should be allowed through.
    const slop = JSON.stringify({
      bios: [{ text: 'Not just recipes — a whole new way to unlock your kitchen.', angle: 'x' }],
      display_names: ['RecipeFix'],
      pinned_post: 'Hello there, this is the account.',
    });
    const llm = stubLlm([slop, goodReply]);
    await generateProfileCopy(request, llm);
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]!.messages[0]!.content).toMatch(/FIX THIS/);
  });

  it('gives up after the attempt limit and says so, rather than looping or throwing', async () => {
    const alwaysBad = JSON.stringify({
      bios: [{ text: 'y'.repeat(400), angle: 'x' }],
      display_names: [],
      pinned_post: '',
    });
    const llm = stubLlm([alwaysBad]);
    const result = await generateProfileCopy({ ...request, maxAttempts: 2 }, llm);

    expect(llm.calls).toHaveLength(2);
    expect(result.notes.join(' ')).toContain('Gave up');
    // Nothing usable survived, and nothing unusable was returned as if it had.
    expect(result.bios).toHaveLength(0);
  });

  it('names the forbidden claims so the bio cannot assert one', async () => {
    const llm = stubLlm([goodReply]);
    await generateProfileCopy(
      { ...request, forbiddenClaims: ['medical or allergy-safety guarantee'] },
      llm,
    );
    expect(llm.calls[0]!.system).toContain('allergy-safety guarantee');
  });

  it('tells the model not to paste the URL into a bio that has its own link field', async () => {
    const llm = stubLlm([goodReply]);
    await generateProfileCopy(request, llm);
    expect(llm.calls[0]!.messages[0]!.content).toContain('it has its own field');
  });

  it('tells the model when a platform has no link field at all', async () => {
    const llm = stubLlm([goodReply]);
    await generateProfileCopy(
      { ...request, platform: 'bluesky', linkInBioUrl: null },
      llm,
    );
    expect(llm.calls[0]!.messages[0]!.content).toContain('no link field');
  });
});
