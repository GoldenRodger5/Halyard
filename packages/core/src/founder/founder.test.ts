import { describe, expect, it, vi } from 'vitest';
import {
  STORY_TTL_HOURS,
  clusterItems,
  clusterKey,
  isExpired,
  parseFeed,
  rankStories,
  titleSimilarity,
  type ClusteredItem,
} from './rss.js';
import {
  TakeRequiresInput,
  draftTake,
  factCheckTake,
  opinionPreserved,
  runTakeLoop,
} from './dailyTake.js';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Anthropic ships a new model</title><link>https://example.test/a</link>
<description><![CDATA[<p>It is <b>faster</b>.</p>]]></description>
<pubDate>Mon, 10 Aug 2026 09:00:00 GMT</pubDate><guid>a-1</guid></item>
<item><title>OpenAI responds</title><link>https://example.test/b</link>
<description>A short summary &amp; nothing more</description>
<pubDate>Mon, 10 Aug 2026 11:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Hugging Face releases tooling</title><link href="https://example.test/c"/>
<summary>Tooling for evaluation</summary><updated>2026-08-10T08:00:00Z</updated><id>c-1</id></entry>
</feed>`;

/**
 * The real Hacker News description: no prose, four fields of link markup.
 */
const HN = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>A 3D fruit fly on macOS powered by the FlyWire connectome</title>
<link>https://news.ycombinator.com/item?id=49353221</link>
<description>&lt;a href="https://github.com/DenisSergevitch/desktop-fly"&gt;Article URL&lt;/a&gt;: &lt;a href="https://github.com/DenisSergevitch/desktop-fly"&gt;https://github.com/DenisSergevitch/desktop-fly&lt;/a&gt; &lt;p&gt;Comments URL: &lt;a href="https://news.ycombinator.com/item?id=49353221"&gt;https://news.ycombinator.com/item?id=49353221&lt;/a&gt;&lt;/p&gt; &lt;p&gt;Points: 180&lt;/p&gt; &lt;p&gt;# Comments: 48&lt;/p&gt;</description>
<guid>hn-49353221</guid></item>
</channel></rss>`;

describe('RSS parsing — Part A', () => {
  it('parses RSS 2.0, including CDATA and entities', () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('Anthropic ships a new model');
    expect(items[0]?.summary).toBe('It is faster .');
    expect(items[1]?.summary).toBe('A short summary & nothing more');
    expect(items[0]?.publishedAt?.toISOString()).toBe('2026-08-10T09:00:00.000Z');
  });

  it('parses Atom, where the link is an attribute', () => {
    const items = parseFeed(ATOM);
    expect(items[0]?.url).toBe('https://example.test/c');
    expect(items[0]?.guid).toBe('c-1');
  });

  it('falls back to the url when a feed omits a guid', () => {
    expect(parseFeed(RSS)[1]?.guid).toBe('https://example.test/b');
  });

  it('returns nothing rather than throwing on rubbish', () => {
    expect(parseFeed('<html>not a feed</html>')).toEqual([]);
  });

  /**
   * Hacker News is the highest-volume Daily Take source and it has no summary
   * to give. Its description is a link block, and it was rendering under every
   * headline as though it were prose. The fixture is the real shape.
   */
  it('reports no summary when the feed gave a link block instead of one', () => {
    const items = parseFeed(HN);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('A 3D fruit fly on macOS powered by the FlyWire connectome');
    expect(items[0]?.summary).toBeNull();
  });

  it('keeps a terse summary that happens to be shorter than a URL', () => {
    // Both conditions must hold. This one has no URLs at all, so the clause
    // test never runs and three words survive.
    expect(parseFeed(ATOM)[0]?.summary).toBe('Tooling for evaluation');
  });

  it('keeps prose that merely cites a long link', () => {
    const feed = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Paper</title><link>https://example.test/p</link>
<description>Researchers found the effect holds across every cohort they measured, see https://example.test/a/very/long/path/that/is/longer/than/the/sentence/itself/x.pdf</description>
</item></channel></rss>`;
    expect(parseFeed(feed)[0]?.summary).toContain('Researchers found the effect holds');
  });
});

describe('deduplication — the same story from five feeds', () => {
  it('groups near-identical headlines and counts the feeds', () => {
    const clustered = clusterItems([
      { guid: '1', url: 'https://a.test', title: 'Anthropic ships Claude 5 today', summary: null, author: null, publishedAt: new Date('2026-08-10T09:00:00Z'), sourceName: 'HN' },
      { guid: '2', url: 'https://b.test', title: 'Claude 5 ships from Anthropic', summary: null, author: null, publishedAt: new Date('2026-08-10T10:00:00Z'), sourceName: 'The Verge' },
      { guid: '3', url: 'https://c.test', title: 'A completely different story about chips', summary: null, author: null, publishedAt: new Date('2026-08-10T09:30:00Z'), sourceName: 'TLDR' },
    ]);

    expect(clustered).toHaveLength(2);
    const merged = clustered.find((c) => c.feedCount > 1)!;
    expect(merged.feedCount).toBe(2);
    expect(merged.sourceNames).toEqual(['HN', 'The Verge']);
    // The earliest publication wins: the first feed to carry it is the story.
    expect(merged.publishedAt?.toISOString()).toBe('2026-08-10T09:00:00.000Z');
  });

  it('drops stop words from the cluster key', () => {
    expect(clusterKey('The new model is here')).not.toContain('the');
    expect(titleSimilarity('Anthropic ships Claude', 'Claude ships from Anthropic')).toBeGreaterThan(0.5);
  });
});

describe('ranking — B.1', () => {
  function story(over: Partial<ClusteredItem> = {}): ClusteredItem {
    return {
      guid: 'g', url: 'https://example.test', title: 'An AI developer tools story',
      summary: 'About agents and developer tools', author: null,
      publishedAt: new Date('2026-08-10T09:00:00Z'),
      clusterKey: 'k', feedCount: 1, sourceNames: ['HN'], ...over,
    };
  }

  const now = new Date('2026-08-10T12:00:00Z');

  it('ranks on relevance, convergence and freshness, and says why', () => {
    const ranked = rankStories(
      [
        story({ clusterKey: 'a', title: 'Agents ship in developer tools', feedCount: 3 }),
        story({ clusterKey: 'b', title: 'Unrelated sports result', summary: 'nothing to do with work' }),
      ],
      { interests: ['ai', 'developer tools', 'agents'], recentTitles: [], now },
    );

    expect(ranked[0]?.title).toContain('Agents');
    expect(ranked[0]?.rankReason).toContain('carried by 3 feeds');
    expect(ranked[0]?.rankReason).toContain('broke in the last 12 hours');
  });

  it('drops a story already posted about', () => {
    const ranked = rankStories([story({ title: 'Agents ship in developer tools' })], {
      interests: ['agents'],
      recentTitles: ['Agents shipping in developer tools'],
      now,
    });
    expect(ranked).toHaveLength(0);
  });

  it('decays old news rather than keeping it around', () => {
    const ranked = rankStories(
      [
        story({ clusterKey: 'fresh', title: 'Fresh agents story', publishedAt: new Date('2026-08-10T09:00:00Z') }),
        story({ clusterKey: 'old', title: 'Old agents story', publishedAt: new Date('2026-08-07T09:00:00Z') }),
      ],
      { interests: ['agents'], recentTitles: [], now },
    );
    expect(ranked[0]?.title).toContain('Fresh');
    expect(ranked[1]?.rankReason).toMatch(/days old, decaying/);
  });

  it('expires a story after 72 hours', () => {
    expect(STORY_TTL_HOURS).toBe(72);
    expect(isExpired(new Date('2026-08-06T00:00:00Z'), now)).toBe(true);
    expect(isExpired(new Date('2026-08-09T00:00:00Z'), now)).toBe(false);
  });

  it('surfaces five, not everything', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      story({ clusterKey: `k${i}`, title: `Agents story number ${i}` }),
    );
    expect(rankStories(many, { interests: ['agents'], recentTitles: [], now })).toHaveLength(5);
  });
});

// ── The input gate ─────────────────────────────────────────────────────────

function stubLlm(replies: string[]): { complete: ReturnType<typeof vi.fn> } {
  let i = 0;
  return {
    complete: vi.fn().mockImplementation(async () => ({
      text: replies[Math.min(i++, replies.length - 1)]!,
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    })),
  };
}

const CLEAN_CHECK = JSON.stringify({
  claims: [{ claim: 'models are commoditising', verdict: 'supported', note: 'three sources agree', sources: ['a', 'b', 'c'] }],
  story_verified: true,
  story_note: 'accurate as published',
});
const REINFORCE = JSON.stringify({
  supporting: [{ point: 'inference prices fell 90% in 18 months', source: 'x' }],
  strongest_counter: 'Frontier capability gaps still determine what workflows are possible at all.',
  risk_flags: [],
});
const DRAFT = JSON.stringify({
  body: 'The moat is not the model any more. It is the workflow around it.',
  likely_pushback: ['Models still differentiate at the frontier', 'This is the commoditisation argument again'],
});

describe('the Daily Take is input-gated — Part B and the operating model', () => {
  it('refuses to draft anything without the founder\'s input', async () => {
    const llm = stubLlm([DRAFT]);
    await expect(
      draftTake(
        { rawInput: '   ', storyTitle: 't', storyUrl: 'u', corrections: [], strongestCounter: '', voiceDescription: 'v' },
        llm,
      ),
    ).rejects.toBeInstanceOf(TakeRequiresInput);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('returns needs_input rather than inventing an opinion', async () => {
    const llm = stubLlm([CLEAN_CHECK]);
    const result = await runTakeLoop(
      { rawInput: '', storyTitle: 't', storyUrl: 'u', voiceDescription: 'v' },
      llm,
    );
    expect(result.stage).toBe('needs_input');
    expect(llm.complete).not.toHaveBeenCalled();
  });
});

describe('fact-checking runs before drafting — B.5', () => {
  it('stops at needs_revision when the central claim is contradicted', async () => {
    const contradicted = JSON.stringify({
      claims: [{ claim: 'X shipped this week', verdict: 'contradicted', note: 'It was announced in June.', sources: ['s'] }],
      story_verified: true,
    });
    const llm = stubLlm([contradicted, REINFORCE, DRAFT]);

    const result = await runTakeLoop(
      { rawInput: 'X shipped this week and it changes everything', storyTitle: 't', storyUrl: 'u', voiceDescription: 'v' },
      llm,
    );

    expect(result.stage).toBe('needs_revision');
    // One call only: nothing was drafted.
    expect(llm.complete).toHaveBeenCalledTimes(1);
    if (result.stage === 'needs_revision') {
      expect(result.verification.blockingReason).toMatch(/announced in June/);
    }
  });

  it('stops when the story itself does not hold up', async () => {
    const badStory = JSON.stringify({ claims: [], story_verified: false, story_note: 'The headline was corrected.' });
    const result = await runTakeLoop(
      { rawInput: 'this is huge', storyTitle: 't', storyUrl: 'u', voiceDescription: 'v' },
      stubLlm([badStory]),
    );
    expect(result.stage).toBe('needs_revision');
  });

  it('runs the whole loop when the claim holds up', async () => {
    const result = await runTakeLoop(
      {
        rawInput: "the moat isn't the model anymore its the workflow around it",
        storyTitle: 'Model prices fall again',
        storyUrl: 'https://example.test',
        voiceDescription: 'direct and specific',
      },
      stubLlm([CLEAN_CHECK, REINFORCE, DRAFT]),
    );

    expect(result.stage).toBe('drafted');
    if (result.stage === 'drafted') {
      expect(result.draft.body).toContain('workflow');
      expect(result.draft.likelyPushback).toHaveLength(2);
      expect(result.reinforcement.strongestCounter).toMatch(/Frontier capability/);
    }
  });

  it('passes corrections into the draft so they are applied silently', async () => {
    const imprecise = JSON.stringify({
      claims: [{ claim: 'X shipped this week', verdict: 'imprecise', note: 'announced in June', sources: [], correction: 'It was announced in June, not this week.' }],
      story_verified: true,
    });
    const llm = stubLlm([imprecise, REINFORCE, DRAFT]);
    await runTakeLoop(
      { rawInput: 'X shipped this week', storyTitle: 't', storyUrl: 'u', voiceDescription: 'v' },
      llm,
    );
    const draftSystem = llm.complete.mock.calls[2]![0].system as string;
    expect(draftSystem).toContain('It was announced in June, not this week.');
  });
});

describe('the draft must not sand the opinion off — B.3 step 5', () => {
  it('tells the model so, explicitly', async () => {
    const llm = stubLlm([DRAFT]);
    await draftTake(
      { rawInput: 'the moat is the workflow', storyTitle: 't', storyUrl: 'u', corrections: [], strongestCounter: 'c', voiceDescription: 'v' },
      llm,
    );
    const system = llm.complete.mock.calls[0]![0].system as string;
    expect(system).toContain('sand nothing');
    expect(system).toMatch(/balanced non-statement is the failure mode/);
    expect(system).toMatch(/Do not pre-empt it unless the founder did/);
  });

  it('measures whether the draft still carries the original claim', () => {
    const kept = opinionPreserved(
      "the moat isn't the model anymore its the workflow around it",
      'The moat is not the model any more. It is the workflow around it.',
    );
    expect(kept.preserved).toBe(true);

    const sanded = opinionPreserved(
      "the moat isn't the model anymore its the workflow around it",
      'There are interesting developments in how companies think about competitive advantage.',
    );
    expect(sanded.preserved).toBe(false);
    expect(sanded.note).toMatch(/sand the opinion off/);
  });
});

describe('fact-check evidence gathering', () => {
  it('survives a search backend that is down', async () => {
    const search = vi.fn().mockRejectedValue(new Error('search unavailable'));
    const result = await factCheckTake(
      { rawInput: 'claim', storyTitle: 't', storyUrl: 'u' },
      stubLlm([CLEAN_CHECK]),
      search,
    );
    expect(result.ok).toBe(true);
  });
});
