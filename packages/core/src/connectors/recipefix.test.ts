import { describe, expect, it, vi } from 'vitest';
import fixture from './__fixtures__/recipeAdaptation.json' with { type: 'json' };
import { RecipeFixConnector, toArtifact, type RecipeFixAdaptation } from './recipefix.js';
import { McpClient, parseSseEnvelope } from './mcpClient.js';
import { ConnectorUnavailableError } from './types.js';

const adaptation = fixture as unknown as RecipeFixAdaptation;

describe('toArtifact', () => {
  const artifact = toArtifact(adaptation);

  it('keeps the raw response verbatim', () => {
    expect(artifact.raw).toBe(adaptation);
    expect(artifact.kind).toBe('recipe_adaptation');
    expect(artifact.headline).toBe("Sally's Artisan Bread, gluten-free");
  });

  it('drops purely scaled ingredients — arithmetic is not insight', () => {
    const swaps = artifact.highlights.filter((h) => h.type === 'swap');
    expect(swaps.map((s) => s.after)).not.toContain('1 3/4 teaspoons instant yeast');
    expect(swaps.map((s) => s.after)).toContain('1 teaspoon apple cider vinegar');
  });

  it('gives every highlight a resolvable source path', () => {
    for (const h of artifact.highlights) {
      expect(h.sourcePath).toMatch(/^(ingredients|steps|explanations)\[\d+\]/);
    }
  });

  it('extracts step notes, which are the highest-value payload content', () => {
    const techniques = artifact.highlights.filter((h) => h.type === 'technique');
    expect(techniques).toHaveLength(4);
    expect(techniques[2]?.note).toContain('450');
  });

  it('carries the alternative through when the product offered one', () => {
    const vinegar = artifact.highlights.find((h) => h.after?.includes('vinegar'));
    expect(vinegar?.alternative).toBe('Lemon juice, same quantity');
  });

  it('suggests templates that match what the artifact actually contains', () => {
    expect(artifact.visualHints).toContain('carousel_6');
    expect(artifact.visualHints).toContain('substitution_ratio');
    expect(artifact.visualHints).toContain('chef_note_quote');
  });

  it('survives a minimal artifact with no highlights at all', () => {
    const bare = toArtifact({ recipeName: 'Toast', ingredients: [], steps: [] });
    expect(bare.highlights).toEqual([]);
    expect(bare.visualHints.length).toBeGreaterThan(0);
  });
});

describe('RecipeFixConnector', () => {
  it('calls adapt_recipe and maps the response', async () => {
    const callToolJson = vi.fn().mockResolvedValue(adaptation);
    const connector = new RecipeFixConnector({
      url: 'https://example.test/mcp',
      client: { callToolJson, listTools: vi.fn() } as never,
    });

    const artifact = await connector.generateSample({
      intent: 'gluten-free artisan bread, show the vinegar change',
      params: { url: 'https://example.test/bread', dietary: ['gluten_free'] },
    });

    expect(callToolJson).toHaveBeenCalledWith('adapt_recipe', {
      url: 'https://example.test/bread',
      dietary: ['gluten_free'],
      servings: undefined,
      notes: 'gluten-free artisan bread, show the vinegar change',
    });
    expect(artifact.headline).toContain('Artisan Bread');
  });

  it('raises ConnectorUnavailableError so generation pauses rather than inventing', async () => {
    const connector = new RecipeFixConnector({
      url: 'https://example.test/mcp',
      client: {
        callToolJson: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        listTools: vi.fn(),
      } as never,
    });
    await expect(
      connector.generateSample({ intent: 'x', params: {} }),
    ).rejects.toBeInstanceOf(ConnectorUnavailableError);
  });

  it('reports unhealthy when adapt_recipe is missing rather than claiming ok', async () => {
    const connector = new RecipeFixConnector({
      url: 'https://example.test/mcp',
      client: {
        callToolJson: vi.fn(),
        listTools: vi.fn().mockResolvedValue([{ name: 'search_recipes' }]),
      } as never,
    });
    const health = await connector.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain('adapt_recipe');
  });

  it('reports healthy when the tool is exposed', async () => {
    const connector = new RecipeFixConnector({
      url: 'https://example.test/mcp',
      client: {
        callToolJson: vi.fn(),
        listTools: vi.fn().mockResolvedValue([{ name: 'adapt_recipe' }, { name: 'save_recipe' }]),
      } as never,
    });
    const health = await connector.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('McpClient', () => {
  function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', ...headers },
    });
  }

  it('initialises once, then calls the tool with a bearer token', async () => {
    const calls: Array<{ method: string; auth: string | null }> = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const headers = new Headers(init?.headers);
      calls.push({ method: payload.method, auth: headers.get('authorization') });
      if (payload.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: payload.id, result: { capabilities: {} } });
      }
      return jsonResponse({
        jsonrpc: '2.0',
        id: payload.id,
        result: { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
      });
    });

    const client = new McpClient({
      url: 'https://example.test/mcp',
      token: 'secret-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.callToolJson<{ ok: boolean }>('adapt_recipe', { url: 'u' });

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.method).toBe('initialize');
    expect(calls.every((c) => c.auth === 'Bearer secret-token')).toBe(true);

    await client.callToolJson('adapt_recipe', { url: 'u2' });
    expect(calls.filter((c) => c.method === 'initialize')).toHaveLength(1);
  });

  it('reads structuredContent when the server provides it', async () => {
    const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (payload.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: payload.id, result: {} });
      }
      return jsonResponse({
        jsonrpc: '2.0',
        id: payload.id,
        result: { structuredContent: { recipeName: 'Toast' } },
      });
    });
    const client = new McpClient({
      url: 'https://example.test/mcp',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.callToolJson('adapt_recipe', {})).resolves.toEqual({ recipeName: 'Toast' });
  });

  it('surfaces a tool-level error rather than returning junk', async () => {
    const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      if (payload.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: payload.id, result: {} });
      }
      return jsonResponse({
        jsonrpc: '2.0',
        id: payload.id,
        result: { isError: true, content: [{ type: 'text', text: 'rate limited' }] },
      });
    });
    const client = new McpClient({
      url: 'https://example.test/mcp',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.callToolJson('adapt_recipe', {})).rejects.toThrow(/rate limited/);
  });

  it('parses a JSON-RPC envelope out of an SSE body', () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
    expect(parseSseEnvelope(body)).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
  });
});

/**
 * §148. Found the first time generation ran against the live MCP server.
 *
 * `generate` passes `params: sampleParams ?? {}` and nothing supplies
 * `sampleParams`, so every real call sent `dietary: undefined` — and the tool
 * requires an array of at least one. The server refused it, generation paused,
 * and the video path had therefore never once run against the real connector.
 */
describe('choosing what to adapt', () => {
  const DISCOVER = {
    recipes: [
      { title: 'Black Bean Tacos', source_url: 'https://example.test/tacos', suggested_diet: 'Vegan' },
      { title: 'Shrimp and Grits', source_url: 'https://example.test/grits', suggested_diet: 'Vegetarian' },
    ],
  };

  function connectorWith(calls: Array<[string, Record<string, unknown>]>, discover = DISCOVER) {
    return new RecipeFixConnector({
      url: 'https://example.test/mcp',
      client: {
        listTools: async () => [],
        callToolJson: (async (name: string, args: Record<string, unknown>) => {
          calls.push([name, args]);
          if (name === 'get_discover_recipes') return discover;
          if (name === 'adapt_recipe') return adaptation;
          return {};
        }) as never,
      },
      adaptRetries: 0,
      sleep: async () => undefined,
    });
  }

  it('sends a dietary array taken from the product’s own catalogue', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await connectorWith(calls).generateSample({ intent: 'Gummy bread', params: {} });

    const adapt = calls.find(([n]) => n === 'adapt_recipe')![1];
    expect(Array.isArray(adapt.dietary)).toBe(true);
    expect((adapt.dietary as string[]).length).toBeGreaterThan(0);
    // The URL and the diet come from the same catalogue entry — the pairing is
    // the product's, not ours.
    const chosen = DISCOVER.recipes.find((r) => r.source_url === adapt.url)!;
    expect(adapt.dietary).toEqual([chosen.suggested_diet]);
  });

  it('never sends url and text together, because the tool refuses both', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await connectorWith(calls).generateSample({
      intent: 'From text',
      params: { text: 'A long enough recipe body to be accepted.', dietary: ['gluten-free'] },
    });

    const adapt = calls.find(([n]) => n === 'adapt_recipe')![1];
    expect(adapt.text).toBeDefined();
    expect(adapt.url).toBeUndefined();
  });

  it('prefers an explicit url and diet over the catalogue, and does not fetch it', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await connectorWith(calls).generateSample({
      intent: 'Explicit',
      params: { url: 'https://example.test/mine', dietary: ['dairy-free'] },
    });

    expect(calls.some(([n]) => n === 'get_discover_recipes')).toBe(false);
    const adapt = calls.find(([n]) => n === 'adapt_recipe')![1];
    expect(adapt.url).toBe('https://example.test/mine');
    expect(adapt.dietary).toEqual(['dairy-free']);
  });

  it('wraps a bare dietary string rather than refusing an unambiguous request', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await connectorWith(calls).generateSample({
      intent: 'Bare string',
      params: { url: 'https://example.test/mine', dietary: 'vegan' },
    });
    expect(calls.find(([n]) => n === 'adapt_recipe')![1].dietary).toEqual(['vegan']);
  });

  it('gives the same intent the same recipe, and different intents different ones', async () => {
    // Deterministic, so a retry re-adapts the same thing and does not spend a
    // second credit on a different recipe.
    const a: Array<[string, Record<string, unknown>]> = [];
    const b: Array<[string, Record<string, unknown>]> = [];
    const c: Array<[string, Record<string, unknown>]> = [];
    await connectorWith(a).generateSample({ intent: 'one', params: {} });
    await connectorWith(b).generateSample({ intent: 'one', params: {} });
    await connectorWith(c).generateSample({ intent: 'a completely different idea', params: {} });

    const urlOf = (calls: typeof a) => calls.find(([n]) => n === 'adapt_recipe')![1].url;
    expect(urlOf(a)).toBe(urlOf(b));
    expect([urlOf(a), urlOf(c)].filter(Boolean)).toHaveLength(2);
  });

  it('pauses generation rather than adapting something invented', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await expect(
      connectorWith(calls, { recipes: [] }).generateSample({ intent: 'nothing', params: {} }),
    ).rejects.toBeInstanceOf(ConnectorUnavailableError);
    expect(calls.some(([n]) => n === 'adapt_recipe')).toBe(false);
  });
});

/**
 * §149. The defect that produced empty artifacts while everything looked green.
 *
 * The live server wraps the adaptation in `{ persisted, adaptation }`. The
 * fixture is the bare body. `toArtifact` read the envelope, found no
 * `ingredients`, and built an artifact with no highlights — so no video
 * composition could be chosen and the claim verifier had nothing to resolve
 * against. The job still succeeded.
 */
describe('the adaptation envelope', () => {
  function connectorReturning(payload: unknown) {
    return new RecipeFixConnector({
      url: 'https://example.test/mcp',
      client: {
        listTools: async () => [],
        callToolJson: (async (name: string) =>
          name === 'adapt_recipe' ? payload : { recipes: [] }) as never,
      },
      adaptRetries: 0,
      sleep: async () => undefined,
    });
  }

  it('reads the adaptation out of the envelope the live server sends', async () => {
    const artifact = await connectorReturning({
      persisted: { id: 'abc' },
      adaptation,
    }).generateSample({
      intent: 'enveloped',
      params: { url: 'https://example.test/r', dietary: ['gluten-free'] },
    });

    expect(artifact.headline).toBe(adaptation.recipeName);
    // The half that was silently empty: without unwrapping there are none.
    expect(artifact.highlights.length).toBeGreaterThan(0);
    expect(artifact.highlights.some((h) => h.type === 'swap')).toBe(true);
  });

  it('still accepts a bare adaptation body', async () => {
    const artifact = await connectorReturning(adaptation).generateSample({
      intent: 'bare',
      params: { url: 'https://example.test/r', dietary: ['gluten-free'] },
    });
    expect(artifact.headline).toBe(adaptation.recipeName);
    expect(artifact.highlights.length).toBeGreaterThan(0);
  });

  it('stores the adaptation as raw, so a claim sourcePath resolves', async () => {
    // `raw` is what lands in `content_items.product_artifact` and what the
    // claim verifier walks. The envelope would put every path one level too deep.
    const artifact = await connectorReturning({ adaptation }).generateSample({
      intent: 'raw',
      params: { url: 'https://example.test/r', dietary: ['gluten-free'] },
    });
    expect((artifact.raw as { ingredients?: unknown[] }).ingredients).toBeDefined();
  });
});

describe('retrying a recipe the server cannot handle', () => {
  it('adapts a different recipe on the retry, not the one that just failed', async () => {
    /*
     * §148. Some Discover entries cannot be scraped and the server answers
     * non-2xx for them every time. Re-adapting the same URL spends a second
     * credit to learn what the first attempt already proved.
     */
    const attempted: string[] = [];
    const connector = new RecipeFixConnector({
      url: 'https://example.test/mcp',
      client: {
        listTools: async () => [],
        callToolJson: (async (name: string, args: Record<string, unknown>) => {
          if (name === 'get_discover_recipes') {
            return {
              recipes: [
                { source_url: 'https://example.test/a', suggested_diet: 'Vegan' },
                { source_url: 'https://example.test/b', suggested_diet: 'Vegetarian' },
              ],
            };
          }
          attempted.push(String(args.url));
          if (attempted.length === 1) throw new Error('Edge Function returned a non-2xx status code');
          return adaptation;
        }) as never,
      },
      adaptRetries: 1,
      sleep: async () => undefined,
    });

    const artifact = await connector.generateSample({ intent: 'unscrapeable', params: {} });

    expect(attempted).toHaveLength(2);
    expect(attempted[0]).not.toBe(attempted[1]);
    expect(artifact.highlights.length).toBeGreaterThan(0);
  });
});
