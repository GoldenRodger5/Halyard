/**
 * The abstraction that makes Kinolog a config change (v1 §3).
 *
 * Content is built from real product output — actual `changeReason` strings,
 * actual `updated_note` text. Nothing is invented, so nothing can be wrong about
 * what the product does. The brief gives context; the connector gives ground
 * truth.
 */

export interface SampleSpec {
  /** Natural-language intent, e.g. 'gluten-free lemon bars, show crust change'. */
  intent: string;
  params: Record<string, unknown>;
}

export type HighlightType = 'swap' | 'technique' | 'chef_note' | 'scaling' | 'metric';

export interface Highlight {
  type: HighlightType;
  /** Where in the raw artifact this came from. The claim verifier resolves it. */
  sourcePath: string;
  before?: string;
  after?: string;
  reason?: string;
  alternative?: string | null;
  title?: string;
  note?: string;
  text?: string;
}

export interface ProductArtifact {
  kind: string; // 'recipe_adaptation'
  /** The full API response, stored verbatim on content_items.product_artifact. */
  raw: unknown;
  headline: string;
  highlights: Highlight[];
  /** Which templates suit this artifact. */
  visualHints: string[];
}

export interface ActivityItem {
  id: string;
  occurredAt: Date;
  kind: string;
  summary: string;
  raw?: unknown;
}

export interface ChangelogEntry {
  version: string;
  releasedAt: Date;
  title: string;
  body: string;
}

export interface ConnectorHealth {
  ok: boolean;
  detail?: string;
  latencyMs?: number;
  checkedAt: Date;
}

export interface ProductConnector {
  id: string;
  generateSample(spec: SampleSpec): Promise<ProductArtifact>;
  listRecentActivity(since: Date): Promise<ActivityItem[]>;
  getChangelog(): Promise<ChangelogEntry[]>;
  healthCheck(): Promise<ConnectorHealth>;
}

export class ConnectorUnavailableError extends Error {
  constructor(
    public readonly connectorId: string,
    message: string,
  ) {
    // build pack §3: generation for that product pauses; the existing queue is
    // unaffected and the health check surfaces it on the dashboard.
    super(`Connector '${connectorId}' unreachable: ${message}`);
    this.name = 'ConnectorUnavailableError';
  }
}
