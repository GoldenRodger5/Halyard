/**
 * Adaptation caching and rate limiting. Milestone 22.
 *
 * A RecipeFix adaptation takes about 26 seconds cold and spends a real credit.
 * Two consequences the rest of the system depends on:
 *
 *   · Never pay for the same request twice. The cache key is the request, not
 *     the response, so an idea that reuses a source recipe resolves instantly.
 *     RecipeFix caches upstream too — a repeat came back in under 10 seconds —
 *     but a cache hit there still spends a credit, so this cache is about money
 *     rather than latency.
 *   · Twenty adaptations an hour, hard. This is the operator's money.
 *
 * The limit is deliberately unchanged by the faster timing. It was never a
 * throughput ceiling derived from duration; it is a spend ceiling, and
 * adaptations got cheaper in seconds, not in credits.
 *
 * The store is injected rather than imported so this is testable without a
 * database and usable from both the worker and a route handler.
 */
import { createHash } from 'node:crypto';
import type { ProductArtifact, SampleSpec } from './types.js';

export interface CachedArtifact {
  id: string;
  artifact: ProductArtifact;
  fetchedAt: Date;
  hitCount: number;
}

export interface ArtifactStore {
  get(productId: string, requestKey: string): Promise<CachedArtifact | null>;
  put(input: {
    productId: string;
    requestKey: string;
    request: Record<string, unknown>;
    artifact: ProductArtifact;
    durationMs: number;
    ttlHours: number;
  }): Promise<CachedArtifact>;
  /** Calls in the trailing window, used by the rate limiter. */
  countCalls(productId: string, sinceMinutes: number): Promise<number>;
  logCall(input: {
    productId: string;
    tool: string;
    ok: boolean;
    durationMs: number;
    cached: boolean;
    error?: string;
  }): Promise<void>;
}

/**
 * A stable key for a sample request. Object key order must not change the key,
 * or the cache silently never hits.
 */
export function requestKey(spec: SampleSpec): string {
  const canonical = JSON.stringify(canonicalise({ intent: spec.intent, ...spec.params }));
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalise(v)]),
    );
  }
  if (typeof value === 'string') return value.trim().toLowerCase();
  return value;
}

export class RateLimitExceeded extends Error {
  constructor(
    public readonly used: number,
    public readonly limit: number,
    public readonly windowMinutes: number,
  ) {
    super(
      `Adaptation rate limit reached: ${used} of ${limit} in the last ${windowMinutes} minutes. ` +
        'This spends real credits, so the limit is a hard stop rather than a warning.',
    );
    this.name = 'RateLimitExceeded';
  }
}

export interface CachedConnectorOptions {
  productId: string;
  store: ArtifactStore;
  /** Milestone 22: 20 adaptations per hour. */
  callsPerHour?: number;
  /** How long a cached adaptation stays fresh. */
  ttlHours?: number;
}

/**
 * Wraps `generateSample` with the cache, the rate limiter and the call log.
 * Kept as a function over a connector rather than a subclass so it composes
 * with any `ProductConnector`, including Kinolog's.
 */
export function withArtifactCache(
  generateSample: (spec: SampleSpec) => Promise<ProductArtifact>,
  options: CachedConnectorOptions,
): (spec: SampleSpec, force?: boolean) => Promise<{ artifact: ProductArtifact; cached: boolean; id: string }> {
  const limit = options.callsPerHour ?? 20;
  const ttlHours = options.ttlHours ?? 24 * 14;

  return async (spec, force = false) => {
    const key = requestKey(spec);

    if (!force) {
      const hit = await options.store.get(options.productId, key);
      if (hit) {
        await options.store.logCall({
          productId: options.productId,
          tool: 'adapt_recipe',
          ok: true,
          durationMs: 0,
          cached: true,
        });
        return { artifact: hit.artifact, cached: true, id: hit.id };
      }
    }

    const used = await options.store.countCalls(options.productId, 60);
    if (used >= limit) throw new RateLimitExceeded(used, limit, 60);

    const startedAt = Date.now();
    try {
      const artifact = await generateSample(spec);
      const durationMs = Date.now() - startedAt;

      const stored = await options.store.put({
        productId: options.productId,
        requestKey: key,
        request: { intent: spec.intent, ...spec.params },
        artifact,
        durationMs,
        ttlHours,
      });

      await options.store.logCall({
        productId: options.productId,
        tool: 'adapt_recipe',
        ok: true,
        durationMs,
        cached: false,
      });

      return { artifact, cached: false, id: stored.id };
    } catch (err) {
      await options.store.logCall({
        productId: options.productId,
        tool: 'adapt_recipe',
        ok: false,
        durationMs: Date.now() - startedAt,
        cached: false,
        error: (err as Error).message.slice(0, 500),
      });
      throw err;
    }
  };
}
