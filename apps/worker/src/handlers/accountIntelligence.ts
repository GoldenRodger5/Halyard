/**
 * What this account has actually been publishing. §208.
 *
 * Halyard optimised every post independently. `format_cadence` bounded formats
 * per week and nothing else, so an account could publish five transformations
 * about one feature with one hook and break no rule — each piece individually
 * fine, the sequence monotonous. §6 of the specification asks for the
 * distribution across topics, formats, treatments, hooks and CTAs, with overuse
 * and undercoverage detected.
 *
 * Deterministic. No model is asked whether a mix feels right: the answer would
 * be unauditable and would differ between runs on identical input, which is the
 * opposite of what a balance check is for.
 *
 * The snapshot is stored even though it is recomputable, because a decision made
 * last week was made against last week's mix, and a table that only holds the
 * present cannot explain a past choice.
 */
import {
  analysePortfolio,
  rankRecommendations,
  type PortfolioItem,
  type SocialRecommendation,
} from '@halyard/core';
import type { JobHandler } from '../poller.js';

/** How much recent work counts as "the mix". */
const WINDOW = 20;

export const buildAccountIntelligenceHandler: JobHandler = async (job, ctx) => {
  const accountId = (job.payload.accountId as string | undefined) ?? null;

  const { rows: accounts } = await ctx.pool.query<{ id: string; product_id: string }>(
    accountId
      ? `select id, product_id from social_accounts where id = $1`
      : `select id, product_id from social_accounts where capability_state in ('live','draft_only')`,
    accountId ? [accountId] : [],
  );

  for (const account of accounts) {
    const { rows } = await ctx.pool.query<{
      id: string;
      published_at: string;
      platform: string;
      creative_type: string | null;
      format: string | null;
      category: string | null;
      hook_type: string | null;
      destination_type: string | null;
      about_product_id: string | null;
    }>(
      `select ci.id,
              ci.published_at,
              ci.platform,
              ci.generation_meta -> 'creative' ->> 'type' as creative_type,
              ci.format,
              ci.category,
              hv.hook_type,
              ci.destination_type,
              ci.about_product_id
         from content_items ci
         left join lateral (
           select hook_type from hook_variants
            where content_item_id = ci.id and selected = true
            limit 1
         ) hv on true
        where ci.account_id = $1
          and ci.status = 'published'
          and ci.published_at is not null
        order by ci.published_at desc
        limit $2`,
      [account.id, WINDOW],
    );

    const items: PortfolioItem[] = rows.map((r) => ({
      contentItemId: r.id,
      publishedAt: new Date(r.published_at),
      platform: r.platform,
      /*
       * The dimensions worth balancing. Each is a decision a later plan can
       * actually make differently — balancing something nothing chooses would
       * produce a finding nobody can act on.
       */
      dimensions: {
        treatment: r.creative_type,
        format: r.format,
        topic: r.category,
        hook: r.hook_type,
        destination: r.destination_type,
        feature: r.about_product_id,
      },
    }));

    const report = analysePortfolio(items);

    await ctx.pool.query(
      `insert into account_intelligence
         (account_id, product_id, window_size, slices, findings, gaps, exploration_share, summary)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8)`,
      [
        account.id,
        account.product_id,
        report.window,
        JSON.stringify(report.slices),
        JSON.stringify(report.findings),
        JSON.stringify(report.gaps),
        report.explorationShare,
        report.summary,
      ],
    );

    const recommended = await buildRecommendations(ctx, account);

    ctx.log('account intelligence', {
      accountId: account.id,
      window: report.window,
      findings: report.findings.length,
      recommendations: recommended,
      summary: report.summary,
    });
  }
};

/**
 * Recommendations from evidence Halyard already holds. §209.
 *
 * Deliberately narrow. The specification's wider ambition — discovering
 * creators, brands and communities across a platform — needs search endpoints
 * Halyard's adapters do not implement, and inventing candidates to fill the
 * table would be exactly the fabrication the evidence rule exists to prevent.
 *
 * Two sources are real, already collected, and account-specific:
 *
 *   · **`comments`** — someone who repeatedly replies to this account's posts
 *     is relevant to it by demonstration, not by inference. This is the
 *     strongest evidence available anywhere in the system, because the
 *     relationship already exists.
 *   · **`watch_hits`** — authors surfaced by the operator's own watch terms,
 *     carrying the URL and engagement that were actually observed.
 *
 * Nothing here acts. Every row is a suggestion a person reads, and
 * `RECOMMENDATION_KINDS` contains no verb that reaches a platform (§209).
 */
async function buildRecommendations(
  ctx: Parameters<JobHandler>[1],
  account: { id: string; product_id: string },
): Promise<number> {
  const { rows: platformRow } = await ctx.pool.query<{ platform: string }>(
    'select platform from social_accounts where id = $1',
    [account.id],
  );
  const platform = platformRow[0]?.platform;
  if (!platform) return 0;

  const proposals: SocialRecommendation[] = [];

  /* ── People who engage with this account's own posts ─────────────────── */
  const { rows: commenters } = await ctx.pool.query<{
    author_handle: string;
    n: string;
    questions: string;
    latest: string;
    sample: string;
  }>(
    `select c.author_handle,
            count(*)::text                                   as n,
            count(*) filter (where c.is_support_question)::text as questions,
            max(c.posted_at)                                 as latest,
            (array_agg(c.body order by c.posted_at desc))[1] as sample
       from comments c
       join publications p on p.id = c.publication_id
      where p.account_id = $1
        and c.author_handle is not null
        and c.posted_at > now() - interval '90 days'
      group by c.author_handle
     having count(*) >= 2
      order by count(*) desc
      limit 25`,
    [account.id],
  );

  for (const row of commenters) {
    const n = Number(row.n);
    const questions = Number(row.questions);
    proposals.push({
      accountId: account.id,
      platform,
      subject: row.author_handle,
      subjectType: 'creator',
      /*
       * Someone asking repeated questions is a different opportunity from
       * someone simply present: the first is a conversation worth having, the
       * second is an audience member worth knowing about.
       */
      kind: questions > 0 ? 'respond' : 'investigate',
      /*
       * Relevance from demonstrated engagement, not from reach. Four comments
       * is treated as fully relevant — beyond that the person is not becoming
       * more relevant, only more frequent.
       */
      relevance: Math.min(1, n / 4),
      confidence: 0.9,
      rationale:
        questions > 0
          ? `Has asked ${questions} question${questions === 1 ? '' : 's'} across ${n} comments on this account's posts.`
          : `Has commented ${n} times on this account's posts in the last 90 days.`,
      evidence: [
        {
          observation: `${n} comments, most recently: "${String(row.sample ?? '').slice(0, 120)}"`,
          source: `comments:${account.id}`,
          observedAt: new Date(row.latest),
        },
      ],
    });
  }

  /* ── Authors the operator's own watch terms surfaced ─────────────────── */
  const { rows: hits } = await ctx.pool.query<{
    author: string;
    n: string;
    latest: string;
    url: string;
    title: string;
    engagement: number | null;
    question: boolean | null;
  }>(
    `select author, count(*)::text as n, max(posted_at) as latest,
            (array_agg(url order by posted_at desc))[1]   as url,
            (array_agg(title order by posted_at desc))[1] as title,
            max(engagement)                               as engagement,
            bool_or(question)                             as question
       from watch_hits
      where product_id = $1 and author is not null
        and posted_at > now() - interval '90 days'
      group by author
      order by count(*) desc
      limit 25`,
    [account.product_id],
  );

  for (const row of hits) {
    const n = Number(row.n);
    proposals.push({
      accountId: account.id,
      platform,
      subject: row.author,
      subjectType: row.question ? 'question' : 'creator',
      kind: row.question ? 'monitor' : 'study',
      /*
       * A watch term is the operator's own statement of what matters, so a hit
       * is relevant by construction — but less so than someone who engaged
       * directly, which is why this tops out below the commenter scale.
       */
      relevance: Math.min(0.8, 0.4 + n * 0.1),
      confidence: 0.6,
      rationale: `Surfaced ${n} time${n === 1 ? '' : 's'} by this product's watch terms.`,
      evidence: [
        {
          observation: String(row.title ?? '').slice(0, 160) || 'Matched a watch term.',
          source: row.url,
          observedAt: new Date(row.latest),
          audienceSize: row.engagement,
        },
      ],
    });
  }

  const ranked = rankRecommendations(proposals, new Date(), 40);

  for (const r of ranked) {
    await ctx.pool.query(
      `insert into social_recommendations
         (account_id, product_id, platform, subject, subject_type, kind,
          relevance, confidence, rationale, evidence, observed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       on conflict (account_id, platform, subject) do update set
         kind = excluded.kind,
         relevance = excluded.relevance,
         confidence = excluded.confidence,
         rationale = excluded.rationale,
         /* Evidence accumulates rather than being replaced: a second sighting
            is more reason to believe the first, not a reason to forget it. */
         evidence = social_recommendations.evidence || excluded.evidence,
         observed_at = excluded.observed_at,
         updated_at = now()
       /* A decision the operator already made is not re-opened by a new
          observation about the same subject. */
       where social_recommendations.status = 'proposed'`,
      [
        r.accountId,
        account.product_id,
        r.platform,
        r.subject,
        r.subjectType,
        r.kind,
        r.relevance,
        r.confidence,
        r.rationale,
        JSON.stringify(r.evidence),
        r.evidence[0]!.observedAt,
      ],
    );
  }

  return ranked.length;
}
