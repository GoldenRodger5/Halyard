import 'server-only';
import { headers } from 'next/headers';

/**
 * The origin a stranger would use to reach this app. Milestone 50.
 *
 * Nothing needed this before: every link Halyard publishes is built by the
 * worker from a configured product URL, and the dashboard only ever linked to
 * itself with relative paths. The setup kit is the first thing that has to hand
 * the operator an absolute URL to paste into a real profile.
 *
 * Derived from the request rather than from configuration, because the request
 * is the one source that cannot be stale. Configuration is the fallback for
 * contexts with no request.
 */
export async function publicOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';

  if (host && !isLocal(host)) return `${proto}://${host}`;

  const configured =
    process.env.PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  if (configured && !isLocal(configured)) return configured.replace(/\/$/, '');

  // Deliberately null rather than localhost. A profile bio pointing at
  // http://localhost:3200 is worse than one with no link, and the setup kit's
  // whole premise is that the link is live before the profiles exist.
  return null;
}

function isLocal(value: string): boolean {
  return /localhost|127\.0\.0\.1|\[::1\]|\.local(?::|$)/i.test(value);
}

/** The link-in-bio URL for a product, or null if this deployment is not public. */
export async function linkInBioUrl(productId: string): Promise<string | null> {
  const origin = await publicOrigin();
  return origin ? `${origin}/l/${productId}` : null;
}
