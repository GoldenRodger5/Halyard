/**
 * §146. MCP for any product, not for one product.
 *
 * `createConnector` used to branch on `product.id === 'recipefix'`, so every
 * other `connector_type: 'mcp'` row resolved to `null` — the connector existed,
 * the config was valid, and nothing was ever built from it. That failure is
 * silent by construction: a `null` connector is also what "no connector
 * configured" looks like.
 */
import { describe, expect, it } from 'vitest';
import { createConnector } from './index.js';
import { McpProductConnector } from './mcp.js';
import { RecipeFixConnector } from './recipefix.js';
import { ConnectorUnavailableError } from './types.js';

const TOOLS = [
  { name: 'search_films', description: 'Search the catalogue' },
  { name: 'log_watch', description: 'Record that a film was watched' },
];

const stubClient = {
  listTools: async () => TOOLS,
  initialize: async () => undefined,
};

describe('createConnector, for an arbitrary product', () => {
  it('builds a working MCP connector for a product that is not RecipeFix', () => {
    const connector = createConnector(
      { id: 'kinolog', connector_type: 'mcp', connector_config: {} },
      { KINOLOG_MCP_URL: 'https://kinolog.app/mcp', KINOLOG_MCP_TOKEN: 't' },
    );

    expect(connector).toBeInstanceOf(McpProductConnector);
    expect(connector!.describeSurface).toBeDefined();
  });

  it('still routes RecipeFix to its artifact adapter', () => {
    const connector = createConnector(
      { id: 'recipefix', connector_type: 'mcp', connector_config: {} },
      { RECIPEFIX_MCP_URL: 'https://example.test/mcp' },
    );
    expect(connector).toBeInstanceOf(RecipeFixConnector);
  });

  it('resolves the adapter by config, so a product can be renamed', () => {
    const connector = createConnector(
      { id: 'recipefix_staging', connector_type: 'mcp', connector_config: { adapter: 'recipefix' } },
      { RECIPEFIX_STAGING_MCP_URL: 'https://example.test/mcp' },
    );
    expect(connector).toBeInstanceOf(RecipeFixConnector);
  });

  it('returns null when the named variable is not set in this environment', () => {
    // Configured in the database, absent from this process. Not an error —
    // `discoverEvidenceSources` is what explains it.
    expect(
      createConnector({ id: 'kinolog', connector_type: 'mcp', connector_config: {} }, {}),
    ).toBeNull();
  });

  it('leaves a product with no connector alone', () => {
    expect(
      createConnector({ id: 'kinolog', connector_type: 'none', connector_config: {} }, {}),
    ).toBeNull();
  });
});

describe('McpProductConnector', () => {
  const connector = new McpProductConnector('kinolog', {
    url: 'https://kinolog.app/mcp',
    client: stubClient,
  });

  it('reads the tool surface without knowing what the product is', async () => {
    expect(await connector.describeSurface()).toEqual(TOOLS);
  });

  it('reports health from a real round trip, with the tool count as the detail', async () => {
    const health = await connector.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.detail).toContain('2 tools');
  });

  it('reports an unreachable server as unhealthy rather than throwing', async () => {
    const broken = new McpProductConnector('kinolog', {
      url: 'https://kinolog.app/mcp',
      client: {
        initialize: async () => {
          throw new Error('ECONNREFUSED');
        },
        listTools: async () => [],
      },
    });
    const health = await broken.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain('ECONNREFUSED');
  });

  it('refuses to invent a product artifact', async () => {
    /*
     * The load-bearing refusal. A tool list does not say which tool produces
     * the product's characteristic output or how to read it, and generation
     * pauses on this error rather than writing about output that never existed.
     */
    await expect(connector.generateSample()).rejects.toBeInstanceOf(ConnectorUnavailableError);
  });

  it('reports no activity feed rather than failing over one', async () => {
    // Most products publish neither, and MCP standardises neither.
    expect(await connector.listRecentActivity()).toEqual([]);
    expect(await connector.getChangelog()).toEqual([]);
  });
});
