import { RecipeFixConnector } from './recipefix.js';
import type { ProductConnector } from './types.js';

export * from './types.js';
export * from './mcpClient.js';
export * from './recipefix.js';
export * from './artifactCache.js';
export * from './github.js';

export interface ConnectorConfigRow {
  id: string;
  connector_type: 'mcp' | 'rest' | 'none';
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

  // Kinolog later implements the same three methods over whatever it exposes.
  return null;
}
