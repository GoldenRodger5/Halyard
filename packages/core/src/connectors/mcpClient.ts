/**
 * A very small MCP client over streamable HTTP.
 *
 * Authenticates with a bearer token (RECIPEFIX_MCP_TOKEN). 2026-10-26: the
 * static service token this was written for belonged to RecipeFix's
 * `mcp-service`, which was retired on 2026-10-20 and now answers 404. The only
 * RecipeFix server is `<supabase>/functions/v1/mcp`, which accepts ONLY an
 * OAuth access token issued to a registered client (it checks the client_id
 * claim) — there is no headless path. So RECIPEFIX_MCP_URL must point at
 * `/functions/v1/mcp` and the token must be an OAuth access token for a
 * dedicated RecipeFix test account; until one exists, the marketing lane reads
 * proof from stored real outputs and committed tool snapshots instead.
 *
 * Only `initialize`, `tools/list` and `tools/call` are implemented, because that
 * is all a server-side consumer needs.
 */

export interface McpToolResultContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpToolResult {
  content?: McpToolResultContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface McpClientOptions {
  url: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  clientName?: string;
}

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export class McpClient {
  private nextId = 1;
  private sessionId: string | null = null;
  private initialised = false;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: McpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async initialize(): Promise<void> {
    if (this.initialised) return;
    await this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: this.options.clientName ?? 'halyard', version: '0.1.0' },
    });
    // The notification is fire-and-forget; a server that rejects it is still usable.
    await this.notify('notifications/initialized').catch(() => undefined);
    this.initialised = true;
  }

  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    await this.initialize();
    const result = (await this.rpc('tools/list', {})) as {
      tools?: Array<{ name: string; description?: string }>;
    };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.initialize();
    const result = (await this.rpc('tools/call', { name, arguments: args })) as McpToolResult;
    if (result.isError) {
      throw new McpError(`Tool '${name}' returned an error: ${extractText(result)}`);
    }
    return result;
  }

  /**
   * Tool results arrive as content blocks. Servers that return JSON usually put
   * it in a text block; newer ones use structuredContent. Handle both.
   */
  async callToolJson<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.callTool(name, args);
    if (result.structuredContent !== undefined) return result.structuredContent as T;
    const text = extractText(result);
    if (!text) throw new McpError(`Tool '${name}' returned no content.`);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new McpError(`Tool '${name}' returned non-JSON content: ${text.slice(0, 200)}`);
    }
  }

  private async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    await this.send({ jsonrpc: '2.0', method, params });
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const body = await this.send({ jsonrpc: '2.0', id, method, params });
    if (body === null) throw new McpError(`No response body for '${method}'.`);
    if (body.error) {
      throw new McpError(body.error.message ?? 'Unknown MCP error', body.error.code);
    }
    return body.result;
  }

  private async send(
    payload: Record<string, unknown>,
  ): Promise<{ result?: unknown; error?: { message?: string; code?: number } } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 120_000);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

    try {
      const response = await this.fetchImpl(this.options.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const returnedSession = response.headers.get('mcp-session-id');
      if (returnedSession) this.sessionId = returnedSession;

      if (response.status === 202) return null; // notification accepted
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new McpError(`HTTP ${response.status} from MCP server: ${text.slice(0, 200)}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const text = await response.text();
      if (contentType.includes('text/event-stream')) return parseSseEnvelope(text);
      if (!text) return null;
      return JSON.parse(text);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractText(result: McpToolResult): string {
  return (result.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n');
}

/** Pull the first JSON-RPC envelope out of an SSE stream body. */
export function parseSseEnvelope(
  body: string,
): { result?: unknown; error?: { message?: string; code?: number } } | null {
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      return JSON.parse(payload);
    } catch {
      // Multi-line data frames are rare here; skip anything unparseable.
    }
  }
  return null;
}
