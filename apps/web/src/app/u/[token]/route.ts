/**
 * Unsubscribe. The route the newsletter footer has always pointed at and that
 * never existed.
 *
 * ## Why a route handler rather than a page
 *
 * RFC 8058 one-click requires that the *same* URI answer a human's GET and a
 * mail provider's POST — Gmail and Apple Mail show their own unsubscribe
 * control and send a POST to whatever `List-Unsubscribe` names. A `page.tsx`
 * cannot also export POST at the same path, so this is a route handler and the
 * GET returns its own small document.
 *
 * ## Why GET does not unsubscribe
 *
 * Mail clients, security scanners and link previewers fetch every URL in a
 * message. If GET performed the unsubscribe, a proportion of subscribers would
 * be silently removed for opening the mail. So GET only asks, and the button
 * posts.
 *
 * The one exception is deliberate: a POST carrying `List-Unsubscribe=One-Click`
 * is the provider acting on a person who clicked the provider's own control, so
 * it needs no second confirmation.
 *
 * ## The token is the whole credential
 *
 * There is no session here and there must not be — the person unsubscribing is
 * a subscriber, not an operator, and requiring them to log in to stop receiving
 * mail is how unlawful sending happens. Knowing a 256-bit token proves they
 * received the message. It is per-subscriber and never derived from the email
 * address, so it cannot be used to unsubscribe anybody else.
 */
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

function page(title: string, body: string, action?: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center;
         background:#f6f3ec; color:#2a2320;
         font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  main { max-width:32rem; padding:2rem; background:#fdfbf7; border:1px solid #e2d9cb;
         border-radius:12px; margin:1rem; }
  h1 { font-size:1.5rem; margin:0 0 .5rem; }
  p { color:#736760; margin:0 0 1rem; }
  button { font:inherit; font-weight:600; color:#fff; background:#a85c39;
           border:0; border-radius:8px; padding:.6rem 1.1rem; cursor:pointer; }
  button:hover { background:#8f4c2e; }
  @media (prefers-color-scheme: dark) {
    body { background:#1a1614; color:#f2ede4; }
    main { background:#221d1a; border-color:#3a322c; }
    p { color:#b5a89e; }
  }
</style></head><body><main>
<h1>${title}</h1>
<p>${body}</p>
${action ? `<form method="post"><button type="submit">Unsubscribe</button></form>` : ''}
</main></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

async function findSubscriber(token: string) {
  if (!token || token.length < 16) return null;
  const rows = await query<{ id: string; email: string; unsubscribed_at: string | null }>(
    'select id, email, unsubscribed_at from subscribers where unsubscribe_token = $1',
    [token],
  );
  return rows[0] ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const subscriber = await findSubscriber(token);

  if (!subscriber) {
    return page(
      'That link is not valid',
      'It may have already been used, or the address may have been removed. If you are still receiving mail, reply to any issue and it will be stopped by hand.',
    );
  }
  if (subscriber.unsubscribed_at) {
    return page('You are already unsubscribed', 'No further issues will be sent to this address.');
  }
  return page(
    'Unsubscribe?',
    'You will stop receiving the newsletter at this address. Nothing else changes.',
    'confirm',
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const subscriber = await findSubscriber(token);

  if (!subscriber) {
    /*
     * 200 rather than 404. A provider's one-click POST treats a non-2xx as a
     * failure and may keep showing the control or retry; there is nothing the
     * subscriber can do about an unknown token, and nothing here worth
     * defending — the token is unguessable, so answering the same either way
     * costs nothing and avoids a confusing error in a mail client.
     */
    return page('That link is not valid', 'It may have already been used.');
  }

  /*
   * Idempotent: `unsubscribed_at` is set only once, so a second click does not
   * move the record of when they left. Re-subscribing is a deliberate act
   * elsewhere, not an accident of clicking twice.
   */
  await query(
    `update subscribers set unsubscribed_at = coalesce(unsubscribed_at, now())
      where unsubscribe_token = $1`,
    [token],
  );

  return page('Unsubscribed', 'You will not receive any further issues at this address.');
}
