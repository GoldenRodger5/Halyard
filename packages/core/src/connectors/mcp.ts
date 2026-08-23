/**
 * An MCP server as a product connector, for any product.
 *
 * §146. MCP is the one product surface that describes *itself*. A server lists
 * its tools, each with a name and a description written by the people who built
 * the product, and that list is implementation truth: a tool the server
 * advertises is a capability the product really has, whatever its landing page
 * says about itself.
 *
 * That property is completely generic, so this connector is too. It needs no
 * knowledge of what the product does.
 *
 * ## What it deliberately cannot do
 *
 * `generateSample` throws. Producing a *product artifact* — the thing a post is
 * built around — means knowing which tool to call and what its response means,
 * and no amount of reading a tool list tells you that. `adapt_recipe` returning
 * an adapted recipe is RecipeFix knowledge, not MCP knowledge.
 *
 * So the split is: **evidence is generic, artifacts are product-specific.** A
 * product with an MCP server and no artifact adapter still gets the richest
 * evidence source Halyard has. It simply cannot generate posts *about its own
 * output* until someone teaches Halyard what its output is — and the honest
 * failure here is what makes generation refuse rather than invent.
 */
import { McpClient, type McpClientOptions } from './mcpClient.js';
import {
  ConnectorUnavailableError,
  type ActivityItem,
  type ChangelogEntry,
  type ConnectorHealth,
  type ProductConnector,
} from './types.js';

export interface McpProductConnectorOptions extends Omit<McpClientOptions, 'clientName'> {
  /** Injectable for tests. */
  client?: Pick<McpClient, 'listTools' | 'initialize'>;
}

export class McpProductConnector implements ProductConnector {
  private readonly client: Pick<McpClient, 'listTools' | 'initialize'>;

  constructor(
    public readonly id: string,
    options: McpProductConnectorOptions,
  ) {
    this.client =
      options.client ??
      new McpClient({
        ...options,
        timeoutMs: options.timeoutMs ?? 30_000,
        clientName: `halyard-${id}-connector`,
      });
  }

  /**
   * The tool list, which is the whole point of this connector.
   *
   * Read by `collectConnectorSurface` and reasoned over by `code-intelligence`.
   */
  async describeSurface(): Promise<Array<{ name: string; description?: string }>> {
    return this.client.listTools();
  }

  /**
   * Refused, not faked.
   *
   * See the note above: a tool list does not say which tool produces the
   * product's characteristic output, or how to read it. `generate` catches this
   * and pauses generation for the product rather than writing about a
   * transformation that never happened.
   */
  async generateSample(): Promise<never> {
    throw new ConnectorUnavailableError(
      this.id,
      `no artifact adapter is registered for '${this.id}', so Halyard can read this product's ` +
        'API surface but cannot produce a sample of its output. Evidence collection and the ' +
        'Product Brain work; content built around real product output does not.',
    );
  }

  /**
   * MCP has no standard for activity or changelogs.
   *
   * Empty rather than throwing: "this product publishes no activity feed" is a
   * true statement about most products, and the callers already treat an empty
   * list as nothing to say. Throwing would turn a normal configuration into an
   * error on the dashboard.
   */
  async listRecentActivity(): Promise<ActivityItem[]> {
    return [];
  }

  async getChangelog(): Promise<ChangelogEntry[]> {
    return [];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const startedAt = Date.now();
    try {
      await this.client.initialize();
      const tools = await this.client.listTools();
      return {
        ok: true,
        detail: `${tools.length} tools advertised`,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
      };
    } catch (err) {
      return {
        ok: false,
        detail: (err as Error).message,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
      };
    }
  }
}

/**
 * The environment variables a product's MCP connector reads.
 *
 * Exported because three places need the same defaulting rule — the connector
 * factory, the evidence-source discovery the operator is shown, and the setup
 * screen that suggests the names. A second copy is how they drift apart.
 *
 * Names only. The values are read from the environment at the point of use and
 * never stored in the database.
 */
export function mcpEnvNames(product: {
  id: string;
  connector_config?: Record<string, unknown> | null;
}): { urlEnv: string; tokenEnv: string } {
  const config = product.connector_config ?? {};
  return {
    urlEnv: String(config.url_env ?? `${product.id.toUpperCase()}_MCP_URL`),
    tokenEnv: String(config.token_env ?? `${product.id.toUpperCase()}_MCP_TOKEN`),
  };
}
