/**
 * Newsletter drafting and sending. Milestone 45.
 *
 * Drafting produces a row in `newsletters` with status `pending_approval` — the
 * same gate as every other piece of content. Sending only ever runs on a row a
 * human has approved, which is why the two are separate jobs rather than one.
 */
import {
  ResendNotConfigured,
  composeNewsletter,
  renderNewsletter,
  sendNewsletter,
  type NewsletterSource,
  UNSUBSCRIBE_PLACEHOLDER,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';

export async function draftNewsletterHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');
  const days = Number(job.payload.days ?? 7);

  const { rows: products } = await ctx.pool.query<{
    name: string;
    destinations: { web?: string };
  }>('select name, destinations from products where id = $1', [productId]);
  const product = products[0];
  if (!product) return;

  /**
   * No confirmed subscribers, no issue.
   *
   * This runs weekly whether or not anyone can receive the result, and nothing
   * writes `subscribers` except the unsubscribe route — there is no signup
   * surface, so the count is zero and drafting produces a row in
   * `pending_approval` that no one could ever be sent.
   *
   * Cheap rather than free: `composeNewsletter` is deterministic and spends no
   * model credits, so this is about not filling the operator's approval queue
   * with issues for an audience of nobody. The moment a subscriber exists the
   * drafter resumes on its own.
   *
   * Deliberately not a decision about whether Halyard should have a newsletter
   * — see `DECISIONS.md` §129.
   */
  const { rows: audience } = await ctx.pool.query<{ n: string }>(
    `select count(*) as n from subscribers
      where product_id = $1 and confirmed_at is not null and unsubscribed_at is null`,
    [productId],
  );
  if (Number(audience[0]?.n ?? 0) === 0) {
    ctx.log('no confirmed subscribers, not drafting a newsletter', { productId });
    return;
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - days * 86_400_000);

  // Best first, by the score the performance job already computed. Nothing is
  // re-ranked here: the newsletter reports what happened, it does not re-judge.
  const { rows: posts } = await ctx.pool.query<NewsletterSource & { published_at: string }>(
    `select ci.id as "contentItemId", ci.title, ci.body, ci.category,
            ci.published_at, ci.destination_url as "destinationUrl",
            ps.score
       from content_items ci
       left join publications p on p.content_item_id = ci.id
       left join lateral (select * from performance_scores ps
                           where ps.content_item_id = ci.id
                           order by computed_at desc limit 1) ps on true
      where ci.product_id = $1 and ci.status = 'published'
        and ci.published_at between $2 and $3
      order by coalesce(ps.score, 0) desc, ci.published_at desc`,
    [productId, periodStart, periodEnd],
  );

  if (posts.length === 0) {
    ctx.log('no published posts in the period, no newsletter drafted', { productId, days });
    return;
  }

  const draft = composeNewsletter({
    productName: product.name,
    periodStart,
    periodEnd,
    posts: posts.map((post) => ({ ...post, publishedAt: new Date(post.published_at) })),
    leadMagnet: job.payload.leadMagnet as { title: string; url: string; description: string } | null,
    webUrl: product.destinations?.web,
  });
  if (!draft) return;

  const { html, text } = renderNewsletter(draft.bodyMarkdown, {
    unsubscribeUrl: `${product.destinations?.web ?? ''}/u/${UNSUBSCRIBE_PLACEHOLDER}`,
    productName: product.name,
  });

  await ctx.pool.query(
    `insert into newsletters (product_id, subject, preheader, body_markdown, body_html,
                              status, period_start, period_end, source_item_ids)
     values ($1,$2,$3,$4,$5,'pending_approval',$6,$7,$8)`,
    [
      productId,
      draft.subject,
      draft.preheader,
      draft.bodyMarkdown,
      html,
      periodStart,
      periodEnd,
      draft.sourceItemIds,
    ],
  );

  ctx.log('newsletter drafted', { productId, posts: posts.length, subject: draft.subject });
  void text;
}

/**
 * Send an approved issue.
 *
 * Refuses anything not explicitly approved, because "nothing publishes without
 * an explicit human action" has no exception for email.
 */
export async function sendNewsletterHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const newsletterId = String(job.payload.newsletterId);

  const { rows } = await ctx.pool.query<{
    id: string;
    product_id: string;
    subject: string;
    body_markdown: string;
    body_html: string | null;
    status: string;
    product_name: string;
    web: string | null;
  }>(
    `select n.*, p.name as product_name, p.destinations ->> 'web' as web
       from newsletters n join products p on p.id = n.product_id
      where n.id = $1`,
    [newsletterId],
  );
  const newsletter = rows[0];
  if (!newsletter) return;

  if (newsletter.status !== 'approved') {
    ctx.log('refusing to send a newsletter that was not approved', {
      newsletterId,
      status: newsletter.status,
    });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM;
  if (!apiKey || !from) throw new ResendNotConfigured();

  const { rows: subscribers } = await ctx.pool.query<{
    email: string;
    unsubscribe_token: string;
  }>(
    `select email, unsubscribe_token from subscribers
      where product_id = $1 and confirmed_at is not null and unsubscribed_at is null`,
    [newsletter.product_id],
  );

  await ctx.pool.query(`update newsletters set status = 'sending' where id = $1`, [newsletterId]);

  try {
    /**
     * The unsubscribe link is the one part of the mail that differs per
     * recipient, and it is what makes the send lawful rather than merely
     * possible.
     *
     * The draft already renders its footer as `/u/{{unsubscribe}}` — a
     * placeholder waiting for exactly this. It used to be replaced by a
     * re-render carrying the *newsletter* id, which is identical for every
     * recipient and identifies nobody, pointed at a route that did not exist.
     *
     * Substituting per recipient means the body is no longer one string for
     * everybody, so the transport can no longer BCC a hundred people at once.
     * That is the cost of a working opt-out, and it is not optional.
     */
    const { html, text } = renderNewsletter(newsletter.body_markdown, {
      unsubscribeUrl: `${newsletter.web ?? ''}/u/${UNSUBSCRIBE_PLACEHOLDER}`,
      productName: newsletter.product_name,
    });
    const baseHtml = newsletter.body_html ?? html;

    const result = await sendNewsletter({
      subject: newsletter.subject,
      html: baseHtml,
      text,
      recipients: subscribers.map((s) => ({
        email: s.email,
        unsubscribeUrl: `${newsletter.web ?? ''}/u/${s.unsubscribe_token}`,
      })),
      from,
      apiKey,
      tags: { newsletter_id: newsletterId, product: newsletter.product_id },
    });

    await ctx.pool.query(
      `update newsletters
          set status = 'sent', sent_at = now(), recipient_count = $2, provider_id = $3, error = null
        where id = $1`,
      [newsletterId, result.recipientCount, result.providerId],
    );

    ctx.log('newsletter sent', { newsletterId, recipients: result.recipientCount });
  } catch (err) {
    await ctx.pool.query(
      `update newsletters set status = 'failed', error = $2 where id = $1`,
      [newsletterId, (err as Error).message.slice(0, 1000)],
    );
    throw err;
  }
}
