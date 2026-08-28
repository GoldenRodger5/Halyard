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
import { analysePortfolio, type PortfolioItem } from '@halyard/core';
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

    ctx.log('account intelligence', {
      accountId: account.id,
      window: report.window,
      findings: report.findings.length,
      summary: report.summary,
    });
  }
};
