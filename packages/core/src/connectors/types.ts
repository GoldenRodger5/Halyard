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

/**
 * What an image from a product is *for*, in the story. §211.
 *
 * Roles rather than positions, so a planner can ask for "the thing after the
 * change" without knowing which product it is talking to. A recipe adapter
 * emits a finished dish as `after`; a fitness product emits a completed
 * session; a design tool emits the exported artboard. None of them needs this
 * file to know what they are.
 */
export type ArtifactImageRole = 'hero' | 'before' | 'after' | 'step' | 'detail';

export interface ArtifactImage {
  /**
   * Publicly reachable at render time.
   *
   * Remotion fetches it during the render, so a signed URL with a short expiry
   * fails the same way Meta's cURL does — the same trap `PublishAsset` carries.
   */
  url: string;
  role: ArtifactImageRole;
  /** Required. An image with no alt text cannot be published accessibly. */
  alt: string;
  /** Where in the raw payload this came from, for the same provenance as a highlight. */
  sourcePath: string;
  width?: number;
  height?: number;
  /**
   * Where it came from, and what may be done with it. §216.
   *
   * Two fields because they answer different questions and RecipeFix proved
   * they can disagree: a publisher's og:image is `product` provenance — the
   * product's API returned it and it depicts something real — and
   * `attribution_required` licence, because the photograph belongs to Budget
   * Bytes. Reading provenance alone would conclude it was free to use.
   *
   * Defaulted by consumers to the conservative reading when an adapter written
   * before this omits them: unknown provenance is not evidence, and unknown
   * licence is not owned.
   */
  provenance?: import('../imagery/types.js').ImageProvenance;
  license?: import('../imagery/types.js').ImageLicense;
  attribution?: import('../imagery/types.js').ImageAttribution;
  /** When it was retrieved, for the same freshness reasoning discovery uses. */
  retrievedAt?: Date;
}

export interface ProductArtifact {
  kind: string; // 'recipe_adaptation'
  /** The full API response, stored verbatim on content_items.product_artifact. */
  raw: unknown;
  headline: string;
  highlights: Highlight[];
  /** Which templates suit this artifact. */
  visualHints: string[];
  /**
   * Imagery the product itself supplies. §211.
   *
   * Optional and product-agnostic. Halyard's video was card-first because the
   * artifact contract had nowhere to put a picture — every frame was type on a
   * flat ground, which is a defensible editorial look and a poor short-form
   * one. An adapter that has images emits them here and the planners use them;
   * one that does not is unchanged, and its content still renders.
   *
   * **Never generated.** An image here is one the product returned. Illustrating
   * a claim with a stock photograph of something that is not the product is the
   * same class of fabrication as inventing a capability.
   */
  imagery?: ArtifactImage[];
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

  /**
   * What this product's API actually advertises.
   *
   * Optional, because it only means something for a connector talking to a
   * self-describing surface — an MCP server lists its tools, a GitHub repo does
   * not. Used by the Product Brain as implementation truth: a tool the server
   * advertises is a capability the product really has, whatever its landing
   * page says about itself.
   *
   * Added rather than reaching past the interface into a connector's private
   * client, which would make the Brain depend on one connector's internals.
   */
  describeSurface?(): Promise<Array<{ name: string; description?: string }>>;
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
