import { NextResponse, type NextRequest } from 'next/server';
import {
  classifyDevice,
  routeClick,
  type DestinationType,
  type ProductDestinations,
} from '@halyard/core';
import { one, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The smart router. Milestone 42.
 *
 * Every link Halyard publishes points here rather than at a destination, so the
 * device decision happens at click time and every click is counted. It is
 * deliberately outside the dashboard's auth: this is the one public surface in
 * the whole application, and it must answer a stranger's request in one hop.
 *
 * It never fails closed. A missing item, an unconfigured product, a malformed
 * id — all of them land on the product's homepage rather than showing an error
 * to someone who clicked a link on X.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const userAgent = request.headers.get('user-agent');
  const device = classifyDevice(userAgent);
  const incomingParams = new URLSearchParams(request.nextUrl.search);

  const item = await loadItem(id);

  if (!item) {
    // Not a known item. Send them somewhere real rather than to a 404.
    const fallback = await one<{ destinations: ProductDestinations }>(
      `select destinations from products where kind = 'product' order by created_at limit 1`,
    );
    const home = fallback?.destinations?.web;
    if (!home) {
      return NextResponse.json(
        {
          error: 'This link does not resolve to anything.',
          fix: 'No product has a web destination configured. Set one on the product screen.',
        },
        { status: 404 },
      );
    }
    return NextResponse.redirect(home, 302);
  }

  const decision = routeClick({
    device,
    destinations: item.destinations ?? {},
    destinationType: (item.destination_type ?? 'web') as DestinationType,
    destinationUrl: item.destination_url ?? item.final_link_url ?? item.link_url,
    incomingParams,
    campaignToken: item.campaign_name ?? item.category,
    nativeOnly: item.destination_type === 'app_store',
  });

  // Logged before the redirect, and never allowed to block it: an analytics
  // write failing is not a reason to break someone's click.
  logClick(item, device, decision, request).catch(() => undefined);

  if (!decision.url) {
    return NextResponse.json(
      {
        error: 'This post has no destination.',
        fix: `Set destinations on the ${item.product_id} product screen, then reschedule this item.`,
      },
      { status: 404 },
    );
  }

  // 302 rather than 301: the destination for one post changes when the product's
  // destinations change, and a browser that cached a permanent redirect would
  // keep sending people to the old one forever.
  const response = NextResponse.redirect(decision.url, 302);
  response.headers.set('cache-control', 'no-store');
  return response;
}

interface RouterItem {
  id: string;
  product_id: string;
  category: string;
  destination_type: string | null;
  destination_url: string | null;
  final_link_url: string | null;
  link_url: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  destinations: ProductDestinations;
}

async function loadItem(id: string): Promise<RouterItem | null> {
  // A malformed uuid in the path is a bad link, not a server error.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  return one<RouterItem>(
    `select ci.id, ci.product_id, ci.category, ci.destination_type, ci.destination_url,
            ci.final_link_url, ci.link_url, ci.campaign_id, c.name as campaign_name,
            p.destinations
       from content_items ci
       join products p on p.id = ci.product_id
       left join campaigns c on c.id = ci.campaign_id
      where ci.id = $1`,
    [id],
  );
}

async function logClick(
  item: RouterItem,
  device: string,
  decision: { url: string; resolved: string },
  request: NextRequest,
): Promise<void> {
  const referrer = request.headers.get('referer');
  await query(
    `insert into link_clicks (content_item_id, campaign_id, device_class, platform, referrer,
                              user_agent, destination_type, destination_url, country)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      item.id,
      item.campaign_id,
      device,
      // utm_source is set by stampUtm at schedule time, so it names the platform
      // the click came from even when the referrer is stripped, which it usually
      // is on mobile apps.
      request.nextUrl.searchParams.get('utm_source'),
      referrer,
      request.headers.get('user-agent')?.slice(0, 400) ?? null,
      decision.resolved,
      decision.url.slice(0, 1000),
      request.headers.get('x-vercel-ip-country'),
    ],
  );
}
