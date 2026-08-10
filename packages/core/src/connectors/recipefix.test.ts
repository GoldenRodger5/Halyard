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
