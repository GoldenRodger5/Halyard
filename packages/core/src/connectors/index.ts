import { GitHubConnector } from './github.js';
import { RecipeFixConnector } from './recipefix.js';
import { ConnectorUnavailableError, type ProductConnector } from './types.js';

export * from './types.js';
export * from './mcpClient.js';
export * from './recipefix.js';
export * from './artifactCache.js';
export * from './github.js';

export interface ConnectorConfigRow {
  id: string;
  connector_type: 'mcp' | 'rest' | 'github' | 'none';
  connector_config: Record<string, unknown>;
}

/**
 * Resolve a product row to a live connector.
 *
 * `connector_config` stores the *names* of environment variables rather than
 * their values (see supabase/seed.sql), so credentials never live in the
 * database — v1 §10: "API keys: env vars on Vercel + Railway. Never in the
 * database."
 */
export function createConnector(
  product: ConnectorConfigRow,
  env: NodeJS.ProcessEnv = process.env,
): ProductConnector | null {
  if (product.connector_type === 'none') return null;

  if (product.id === 'recipefix') {
    const urlEnv = String(product.connector_config.url_env ?? 'RECIPEFIX_MCP_URL');
    const tokenEnv = String(product.connector_config.token_env ?? 'RECIPEFIX_MCP_TOKEN');
    const url = env[urlEnv];
    if (!url) return null;
    return new RecipeFixConnector({ url, token: env[tokenEnv] });
  }

  if (product.connector_type === 'github') {
    // A product with no API still ships. Merged pull requests and releases are
    // the product activity, which is enough for shipped-feature content and for
    // the changelog the idea engine reads.
    const tokenEnv = String(product.connector_config.token_env ?? 'GITHUB_TOKEN');
    const token = env[tokenEnv];
    const owner = product.connector_config.owner;
    const repo = product.connector_config.repo;
    if (!token || typeof owner !== 'string' || typeof repo !== 'string') return null;
    return new GitHubProductConnector(product.id, { token, config: { owner, repo } });
  }

  // Kinolog later implements the same three methods over whatever it exposes.
  return null;
}

/**
 * The GitHub connector, adapted to the product-connector interface.
 *
 * `generateSample` throws rather than inventing: a repository has no product
 * output to sample, and the honest failure is what makes generation pause
 * instead of writing about a transformation that never happened.
 */
class GitHubProductConnector implements ProductConnector {
  private readonly github: GitHubConnector;

  constructor(
    public readonly id: string,
    options: ConstructorParameters<typeof GitHubConnector>[0],
  ) {
    this.github = new GitHubConnector(options);
  }

  async generateSample(): Promise<never> {
    throw new ConnectorUnavailableError(
      this.id,
      'A GitHub-backed product has no sample output to generate. Content for this product comes ' +
        'from shipped features and the brief rather than from product runs.',
    );
  }

  async listRecentActivity(since: Date) {
    const pulls = await this.github.listMergedPullRequests(since);
    return pulls.map((pull) => ({
      id: `pr-${pull.number}`,
      occurredAt: pull.mergedAt,
      kind: 'shipped_feature',
      summary: pull.title,
      raw: pull,
    }));
  }

  getChangelog() {
    return this.github.getChangelog();
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      await this.github.listReleases(new Date(Date.now() - 30 * 86_400_000));
      return { ok: true, latencyMs: Date.now() - startedAt, checkedAt: new Date() };
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
