/**
 * The newsletter. Milestone 45.
 *
 * Sent through RecipeFix's existing Resend account rather than a second email
 * system — the milestone is explicit about that, and it is right: a second
 * sending domain means a second reputation to warm and a second place for
 * unsubscribes to get lost.
 *
 * The draft goes into the same approval queue as everything else. A newsletter
 * is content, and the rule that nothing publishes without an explicit human
 * action does not have an exception for email.
 */

export interface NewsletterSource {
  contentItemId: string;
  title: string | null;
  body: string;
  category: string;
  publishedAt: Date;
  /** Whatever the metric collector last saw. Ordering only, never printed. */
  score?: number | null;
  destinationUrl?: string | null;
}

export interface NewsletterDraft {
  subject: string;
  preheader: string;
  bodyMarkdown: string;
  sourceItemIds: string[];
}

export interface ComposeNewsletterInput {
  productName: string;
  periodStart: Date;
  periodEnd: Date;
  /** Published posts from the period, best first. */
  posts: NewsletterSource[];
  /** Evergreen reference material, e.g. the substitution guides. */
  leadMagnet?: { title: string; url: string; description: string } | null;
  webUrl?: string | null;
}

const MAX_POSTS = 4;

/**
 * Assemble the issue from what actually went out.
 *
 * Deterministic and template-free of the model on purpose: a newsletter that
 * summarises the week's posts has no creative problem to solve, and generating
 * prose around content that already exists is how a digest becomes filler. The
 * subject line is the only judgement call, and it comes from the best post.
 */
export function composeNewsletter(input: ComposeNewsletterInput): NewsletterDraft | null {
  const posts = input.posts.slice(0, MAX_POSTS);
  if (posts.length === 0) return null;

  const best = posts[0]!;
  const subject = subjectFrom(best);

  const lines: string[] = [];
  lines.push(`## ${subject}`);
  lines.push('');

  for (const post of posts) {
    const headline = post.title ?? firstSentence(post.body);
    lines.push(`### ${headline}`);
    lines.push('');
    lines.push(bodyExcerpt(post.body, headline));
    if (post.destinationUrl) {
      lines.push('');
      lines.push(`[Read it](${post.destinationUrl})`);
    }
    lines.push('');
  }

  if (input.leadMagnet) {
    lines.push('---');
    lines.push('');
    lines.push(`**${input.leadMagnet.title}** — ${input.leadMagnet.description}`);
    lines.push('');
    lines.push(`[Get it](${input.leadMagnet.url})`);
    lines.push('');
  }

  return {
    subject,
    // The preheader is what shows next to the subject in an inbox, and leaving
    // it empty means the client shows the first line of markup instead.
    preheader: firstSentence(posts[0]!.body).slice(0, 140),
    bodyMarkdown: lines.join('\n').trim(),
    sourceItemIds: posts.map((post) => post.contentItemId),
  };
}

function subjectFrom(post: NewsletterSource): string {
  const candidate = post.title ?? firstSentence(post.body);
  return candidate.length > 68 ? `${candidate.slice(0, 65).trimEnd()}...` : candidate;
}

function firstSentence(body: string): string {
  const [first] = body.trim().split(/(?<=[.!?])\s+/);
  return (first ?? body).trim();
}

/** Everything after the headline sentence, so the issue does not repeat itself. */
function bodyExcerpt(body: string, headline: string): string {
  const trimmed = body.trim();
  const rest = trimmed.startsWith(headline) ? trimmed.slice(headline.length).trim() : trimmed;
  return (rest || trimmed).slice(0, 600);
}

// ── Sending ────────────────────────────────────────────────────────────────

export class ResendNotConfigured extends Error {
  constructor() {
    super(
      'RESEND_API_KEY and NEWSLETTER_FROM are needed to send. Both come from the Resend account ' +
        'RecipeFix already uses — Resend dashboard → API Keys, and a verified sending domain. ' +
        'Do not create a second Resend account: a new sending domain starts with no reputation ' +
        'and lands in spam.',
    );
    this.name = 'ResendNotConfigured';
  }
}

export interface SendNewsletterInput {
  subject: string;
  html: string;
  text: string;
  recipients: NewsletterRecipient[];
  from: string;
  replyTo?: string;
  /** Set per send so opens and clicks can be attributed back. */
  tags?: Record<string, string>;
  fetchImpl?: typeof fetch;
  apiKey: string;
}

/**
 * The placeholder the draft renders into its footer, replaced per recipient at
 * send time. Exported so the handler and the transport cannot disagree about
 * its spelling — a silent mismatch would mail everyone a literal
 * `{{unsubscribe}}` and no way out.
 */
export const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe}}';

export interface NewsletterRecipient {
  email: string;
  /** This subscriber's own link. Never shared, never derived from the address. */
  unsubscribeUrl: string;
}

export interface SendResult {
  providerId: string;
  /** Recipients the provider accepted — never the number attempted. */
  recipientCount: number;
  /** Per-recipient failures, so a partial send cannot read as a clean one. */
  failures: string[];
}

/**
 * Send one issue, one recipient at a time.
 *
 * This used to `bcc` a hundred addresses per call, which is efficient and
 * cannot carry a working opt-out: a batched send is one body, and an unsubscribe
 * link that is the same for everyone identifies nobody. The link is the only
 * part that has to differ, and it is the part that makes bulk mail lawful, so
 * the batching is what gives way.
 *
 * BCC also existed to stop the subscriber list becoming visible to every
 * subscriber. Sending individually keeps that property for a better reason:
 * each message has exactly one recipient and no `bcc` at all.
 *
 * `List-Unsubscribe` and `List-Unsubscribe-Post` are set on every message
 * (RFC 8058), which is what puts the native one-click control in Gmail and
 * Apple Mail. Both point at the same per-subscriber URL.
 *
 * One recipient failing does not abort the rest — a single bad address must not
 * silently cost every other subscriber their issue — but the failures are
 * counted and reported, so a send that mostly failed cannot read as a success.
 */
export async function sendNewsletter(input: SendNewsletterInput): Promise<SendResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  if (input.recipients.length === 0) throw new Error('No confirmed subscribers to send to.');

  let providerId = '';
  let delivered = 0;
  const failures: string[] = [];

  for (const recipient of input.recipients) {
    if (!recipient.unsubscribeUrl.trim()) {
      // Refused rather than sent without one. A message with no way out is the
      // one failure that cannot be corrected after the fact.
      failures.push(`${recipient.email}: no unsubscribe URL`);
      continue;
    }

    const personalise = (value: string): string =>
      value.split(UNSUBSCRIBE_PLACEHOLDER).join(recipient.unsubscribeUrl);

    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: recipient.email,
        reply_to: input.replyTo,
        subject: input.subject,
        html: personalise(input.html),
        text: personalise(input.text),
        headers: {
          'List-Unsubscribe': `<${recipient.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: Object.entries(input.tags ?? {}).map(([name, value]) => ({ name, value })),
      }),
    });

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      failures.push(
        `${recipient.email}: HTTP ${response.status} ${body.message ?? 'no message'}` +
          (response.status === 403
            ? ' (usually an unverified sending domain — verify it in the Resend dashboard)'
            : ''),
      );
      continue;
    }
    providerId ||= body.id ?? '';
    delivered += 1;
  }

  if (delivered === 0) {
    throw new Error(
      `Resend accepted none of ${input.recipients.length} recipients. ${failures[0] ?? ''}`,
    );
  }

  return { providerId, recipientCount: delivered, failures };
}

/**
 * Markdown to the two bodies an email needs.
 *
 * Small and deliberate rather than a markdown library: the newsletter is
 * assembled by `composeNewsletter` above, so the only syntax that can appear
 * here is the syntax it emits.
 */
export function renderNewsletter(
  markdown: string,
  options: { unsubscribeUrl: string; productName: string },
): { html: string; text: string } {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = escaped
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (trimmed === '---') return '<hr style="border:none;border-top:1px solid #E5DFD6;margin:32px 0" />';
      if (trimmed.startsWith('### ')) {
        return `<h3 style="font:600 18px/1.3 -apple-system,system-ui,sans-serif;color:#2A2320;margin:28px 0 8px">${inline(trimmed.slice(4))}</h3>`;
      }
      if (trimmed.startsWith('## ')) {
        return `<h2 style="font:600 24px/1.2 -apple-system,system-ui,sans-serif;color:#2A2320;margin:0 0 16px">${inline(trimmed.slice(3))}</h2>`;
      }
      return `<p style="font:400 16px/1.6 -apple-system,system-ui,sans-serif;color:#2A2320;margin:0 0 16px">${inline(trimmed)}</p>`;
    })
    .join('\n');

  const text = markdown
    .replace(/^#{2,3}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/\*\*([^*]+)\*\*/g, '$1');

  return {
    html:
      `<!doctype html><html><body style="margin:0;padding:24px;background:#FAF8F4">` +
      `<div style="max-width:560px;margin:0 auto">${html}` +
      `<p style="font:400 13px/1.5 -apple-system,system-ui,sans-serif;color:#7A6E66;margin-top:40px">` +
      `You are getting this because you asked ${options.productName} to send it. ` +
      `<a href="${options.unsubscribeUrl}" style="color:#7A6E66">Unsubscribe</a>.</p>` +
      `</div></body></html>`,
    text: `${text}\n\n---\nUnsubscribe: ${options.unsubscribeUrl}`,
  };
}

function inline(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#C4714A">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
