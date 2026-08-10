/**
 * Review ingestion. Milestone 45.
 *
 * Two sources, both read-only:
 *   · App Store reviews, through App Store Connect's customer-reviews endpoint,
 *     authenticated with the same ES256 JWT the attribution collector uses.
 *   · In-app `user_feedback` and `beta_feedback`, through the product connector.
 *
 * Nothing is summarised, cleaned up or rephrased on the way in. The row stores
 * exactly what the person wrote, because the whole verification design rests on
 * being able to compare a quote against it.
 */
import {
  AppStoreCredentialsMissing,
  createConnector,
  credentialsFromEnv,
  mintAppStoreJwt,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';

const API = 'https://api.appstoreconnect.apple.com/v1';

export async function collectReviewsHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');

  const { rows: products } = await ctx.pool.query<{
    id: string;
    name: string;
    connector_type: 'mcp' | 'rest' | 'github' | 'none';
    connector_config: Record<string, unknown>;
  }>('select * from products where id = $1', [productId]);
  const product = products[0];
  if (!product) return;

  let stored = 0;
  stored += await collectAppStoreReviews(ctx, productId);
  stored += await collectProductFeedback(ctx, product);

  if (stored > 0) {
    await ctx.pool.query(
      `insert into notifications (kind, severity, title, body, dedupe_key)
       values ('digest', 'info', $1, $2, $3)
       on conflict (dedupe_key) do nothing`,
      [
        `${stored} new piece${stored === 1 ? '' : 's'} of social proof`,
        'Review them on /social-proof. Anything quoted in a post is checked against these rows verbatim.',
        `social_proof:${productId}:${new Date().toISOString().slice(0, 10)}`,
      ],
    );
  }

  ctx.log('collected social proof', { productId, stored });
}

async function collectAppStoreReviews(ctx: HandlerContext, productId: string): Promise<number> {
  let credentials;
  try {
    credentials = credentialsFromEnv();
  } catch (err) {
    if (err instanceof AppStoreCredentialsMissing) {
      ctx.log('app store reviews skipped', { reason: 'credentials missing' });
      return 0;
    }
    throw err;
  }

  const response = await fetch(
    `${API}/apps/${credentials.appId}/customerReviews?limit=200&sort=-createdDate`,
    { headers: { authorization: `Bearer ${mintAppStoreJwt(credentials)}` } },
  );

  if (!response.ok) {
    throw new Error(
      `App Store customer reviews returned HTTP ${response.status}. ` +
        (response.status === 403
          ? 'The API key needs the Customer Support or Admin role to read reviews — Sales and Reports alone is not enough.'
          : ''),
    );
  }

  const body = (await response.json()) as {
    data?: Array<{
      id: string;
      attributes?: {
        rating?: number;
        title?: string;
        body?: string;
        reviewerNickname?: string;
        createdDate?: string;
        territory?: string;
      };
    }>;
  };

  let stored = 0;
  for (const review of body.data ?? []) {
    const attributes = review.attributes;
    if (!attributes?.body) continue;

    const result = await ctx.pool.query(
      `insert into social_proof (product_id, source, source_id, source_url, author_display,
                                 rating, title, body, posted_at, consent_state)
       values ($1,'app_store',$2,$3,$4,$5,$6,$7,$8,'public_by_default')
       on conflict (product_id, source, source_id) do nothing`,
      [
        productId,
        review.id,
        `https://apps.apple.com/app/id${credentials.appId}`,
        attributes.reviewerNickname ?? null,
        attributes.rating ?? null,
        attributes.title ?? null,
        // Verbatim. Never trimmed, never tidied.
        attributes.body,
        attributes.createdDate ? new Date(attributes.createdDate) : null,
      ],
    );
    stored += result.rowCount ?? 0;
  }

  return stored;
}

/**
 * In-app feedback, over whatever connector the product has.
 *
 * A product with no connector simply has no in-app feedback to read, which is a
 * supported configuration rather than an error.
 */
async function collectProductFeedback(
  ctx: HandlerContext,
  product: {
    id: string;
    name: string;
    connector_type: 'mcp' | 'rest' | 'github' | 'none';
    connector_config: Record<string, unknown>;
  },
): Promise<number> {
  const connector = createConnector(product);
  if (!connector) return 0;

  let activity;
  try {
    activity = await connector.listRecentActivity(new Date(Date.now() - 30 * 86_400_000));
  } catch (err) {
    ctx.log('product feedback unavailable', { error: (err as Error).message });
    return 0;
  }

  let stored = 0;
  for (const item of activity) {
    if (!/feedback/i.test(item.kind)) continue;

    const result = await ctx.pool.query(
      `insert into social_proof (product_id, source, source_id, body, posted_at, consent_state)
       values ($1, $2, $3, $4, $5, 'not_asked')
       on conflict (product_id, source, source_id) do nothing`,
      [
        product.id,
        item.kind.includes('beta') ? 'beta_feedback' : 'user_feedback',
        item.id,
        item.summary,
        item.occurredAt,
      ],
    );
    stored += result.rowCount ?? 0;
  }

  return stored;
}
