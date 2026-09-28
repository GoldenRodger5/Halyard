/**
 * Autonomous editorial cycle.
 *
 * Reads observations Halyard already collected, decides which one deserves the
 * next slot on which account, persists that reasoning, and delegates expensive
 * creative work to the mature generator. This handler makes no model/provider calls.
 */
import {
  assessOpportunity,
  planEditorialCycle,
  planSchedule,
  rankSignals,
  upcomingSlotOccurrences,
  type ExistingPost,
  type Insight,
  type PortfolioReport,
  type SlotWindow,
} from '@halyard/core';
import type { JobHandler } from '../poller.js';

const MAX_AUTONOMOUS_DECISIONS_PER_DAY = 2;
const SIGNAL_READ_LIMIT = 60;
const SIGNAL_PLAN_LIMIT = 20;

interface SignalRow {
  id: string;
  source: string;
  summary: string;
  raw: Record<string, unknown>;
  relevance: string | null;
  observed_at: string;
  expires_at: string | null;
  confidence: string | null;
  velocity: string | null;
  platform: string | null;
}

interface AccountRow {
  id: string;
  platform: string;
  persona: 'founder' | 'brand';
  capability_state: string;
  last_published_at: string | null;
  window_size: number | null;
  slices: unknown;
  findings: unknown;
  gaps: unknown;
  exploration_share: string | null;
  intelligence_summary: string | null;
}

interface SlotRow {
  platform: string;
  name: string;
  window_start: string;
  window_end: string;
  weekdays: number[];
}

interface ScheduledRow {
  id: string;
  platform: string;
  persona: 'founder' | 'brand';
  idea_id: string | null;
  scheduled_at: string;
}

function sourceUrl(raw: Record<string, unknown>): string | null {
  if (typeof raw.url === 'string' && raw.url.trim()) return raw.url;
  if (Array.isArray(raw.urls)) {
    const first = raw.urls.find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    if (first) return first;
  }
  return null;
}

function signalTerms(row: SignalRow): string[] {
  const terms: string[] = [];
  if (typeof row.raw.term === 'string') terms.push(row.raw.term);
  if (typeof row.raw.questionKey === 'string') terms.push(...row.raw.questionKey.split(/\s+/));
  terms.push(
    ...row.summary
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4)
      .slice(0, 10),
  );
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 12);
}

function maxAgeDays(source: string): number {
  if (source === 'trend') return 7;
  if (source === 'editorial') return 30;
  if (source === 'seasonal') return 60;
  return 90;
}

function asPortfolio(row: AccountRow): PortfolioReport | undefined {
  if (row.window_size == null) return undefined;
  return {
    window: row.window_size,
    slices: Array.isArray(row.slices) ? (row.slices as PortfolioReport['slices']) : [],
    findings: Array.isArray(row.findings) ? (row.findings as PortfolioReport['findings']) : [],
    gaps:
      row.gaps && typeof row.gaps === 'object' && !Array.isArray(row.gaps)
        ? (row.gaps as Record<string, string[]>)
        : {},
    explorationShare: Number(row.exploration_share ?? 0),
    summary: row.intelligence_summary ?? 'Stored account intelligence snapshot.',
  };
}

interface EditorialSchedule {
  scheduledAt: Date;
  slotName: string;
  slotStart: Date;
  slotEnd: Date;
  reason: string;
}

function chooseEditorialSchedule(input: {
  selectionId: string;
  platform: string;
  persona: 'founder' | 'brand';
  earliest: Date;
  latest: Date;
  slots: SlotRow[];
  audienceTimeZone: string;
  existing: ExistingPost[];
}): EditorialSchedule | null {
  const windows = input.slots
    .filter((slot) => slot.platform === input.platform)
    .flatMap((slot) => {
      const window: SlotWindow = {
        name: slot.name,
        windowStart: slot.window_start,
        windowEnd: slot.window_end,
        weekdays: slot.weekdays,
      };
      return upcomingSlotOccurrences(
        window,
        input.audienceTimeZone,
        input.earliest,
        4,
        7,
      ).map((resolved) => ({ window, resolved }));
    })
    .sort((a, b) => a.resolved.startUtc.getTime() - b.resolved.startUtc.getTime());

  for (const entry of windows) {
    const start = new Date(
      Math.max(entry.resolved.startUtc.getTime(), input.earliest.getTime()),
    );
    const end = new Date(
      Math.min(entry.resolved.endUtc.getTime(), input.latest.getTime()),
    );
    if (end <= start) continue;

    const [decision] = planSchedule(
      [
        {
          id: input.selectionId,
          platform: input.platform,
          persona: input.persona,
          slot: {
            ...entry.resolved,
            startUtc: start,
            endUtc: end,
          },
        },
      ],
      input.existing,
    );
    if (!decision?.scheduledAt) continue;

    return {
      scheduledAt: decision.scheduledAt,
      slotName: entry.resolved.name,
      slotStart: start,
      slotEnd: end,
      reason: decision.reason,
    };
  }

  return null;
}

function mapInsight(row: Record<string, unknown>): Insight {
  return {
    scope: row.scope as Insight['scope'],
    platform: (row.platform as string | null) ?? null,
    accountId: (row.account_id as string | null) ?? null,
    feature: String(row.feature),
    featureValue: String(row.feature_value),
    cohortMean: Number(row.cohort_mean),
    baselineMean: Number(row.baseline_mean),
    lift: Number(row.lift),
    sampleSize: Number(row.sample_size),
    baselineSize: Number(row.baseline_size),
    status: row.status as Insight['status'],
    confidence: Number(row.confidence),
    corroborations: Number(row.corroborations),
    evidence: {
      supporting: (row.supporting_content_ids as string[] | null) ?? [],
      contradicting: (row.contradicting_content_ids as string[] | null) ?? [],
      windowStart: new Date(String(row.evidence_window_start ?? 0)),
      windowEnd: new Date(String(row.evidence_window_end ?? 0)),
    },
    observation: String(row.observation),
    recommendation: String(row.recommendation),
    reviewAfter: new Date(String(row.review_after)),
  };
}

export const planEditorialHandler: JobHandler = async (job, ctx) => {
  const productId = String(job.payload.productId ?? '');
  if (!productId) throw new Error('plan_editorial needs a productId');

  const settings = await ctx.pool.query<{ generation_enabled: boolean }>(
    'select generation_enabled from settings where id = true',
  );
  if (!settings.rows[0]?.generation_enabled) {
    ctx.log('editorial cycle skipped', { productId, because: 'generation is disabled' });
    return;
  }

  const existingToday = await ctx.pool.query<{ n: string }>(
    "select count(*)::text as n from strategy_decisions " +
      "where product_id = $1 and created_at >= date_trunc('day', now()) " +
      "and 'autonomy:editorial_cycle' = any(evidence)",
    [productId],
  );
  const already = Number(existingToday.rows[0]?.n ?? 0);
  const requested = Math.max(1, Number(job.payload.maxDecisions ?? 1));
  const remaining = Math.max(0, MAX_AUTONOMOUS_DECISIONS_PER_DAY - already);
  const limit = Math.min(requested, remaining);
  if (limit === 0) {
    ctx.log('editorial cycle skipped', {
      productId,
      because:
        'autonomous daily decision ceiling already reached (' +
        already +
        '/' +
        MAX_AUTONOMOUS_DECISIONS_PER_DAY +
        ')',
    });
    return;
  }

  const { rows: signalRows } = await ctx.pool.query<SignalRow>(
    'select id, source, summary, raw, relevance, ' +
      'coalesce(observed_at, created_at) as observed_at, expires_at, confidence, velocity, platform ' +
      'from signals where product_id = $1 and consumed_at is null ' +
      'order by coalesce(observed_at, created_at) desc limit $2',
    [productId, SIGNAL_READ_LIMIT],
  );

  const ranked = rankSignals(
    signalRows.map((row) => ({
      id: row.id,
      source: row.source,
      relevance: row.relevance === null ? null : Number(row.relevance),
      observedAt: new Date(row.observed_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      confidence: row.confidence === null ? null : Number(row.confidence),
      velocity: row.velocity === null ? null : Number(row.velocity),
      platform: row.platform,
    })),
    new Date(),
    SIGNAL_PLAN_LIMIT,
  );
  const byId = new Map(signalRows.map((row) => [row.id, row]));

  const recentTopics = await ctx.pool.query<{ title: string }>(
    "select title from ideas where product_id = $1 and status in ('selected','used') " +
      "and created_at > now() - interval '30 days' order by created_at desc limit 30",
    [productId],
  );

  const opportunities = ranked.flatMap((signal) => {
    const row = byId.get(signal.id);
    if (!row) return [];
    const assessed = assessOpportunity({
      signal: {
        id: row.id,
        title: row.summary,
        source: row.source,
        sourceUrl: sourceUrl(row.raw),
        platform: row.platform,
        observedAt: new Date(row.observed_at),
        confidence: row.confidence === null ? 1 : Number(row.confidence),
        terms: signalTerms(row),
      },
      recentTopics: recentTopics.rows.map((r) => r.title),
      maxAgeDays: maxAgeDays(row.source),
    });
    if (assessed.verdict !== 'build') {
      ctx.log('signal not promoted to an autonomous slot', {
        productId,
        signalId: row.id,
        verdict: assessed.verdict,
        because: assessed.reason,
      });
      return [];
    }

    const effectiveValue =
      Math.round((signal.effectiveValue * 0.7 + assessed.score * 0.3) * 1000) / 1000;
    return [
      {
        id: row.id,
        signalId: row.id,
        summary: row.summary,
        source: row.source,
        effectiveValue,
        platform: row.platform,
        category: typeof row.raw.category === 'string' ? row.raw.category : null,
      },
    ];
  });

  if (opportunities.length === 0) {
    ctx.log('editorial cycle found no buildable opportunities', {
      productId,
      unconsumedSignals: signalRows.length,
    });
    return;
  }

  const { rows: accounts } = await ctx.pool.query<AccountRow>(
    "select sa.id, sa.platform, sa.persona, sa.capability_state, recent.last_published_at, " +
      "ai.window_size, ai.slices, ai.findings, ai.gaps, ai.exploration_share, " +
      "ai.summary as intelligence_summary " +
      "from social_accounts sa " +
      "left join lateral (" +
      "  select max(ci.published_at) as last_published_at from content_items ci " +
      "  where ci.account_id = sa.id and ci.status = 'published'" +
      ") recent on true " +
      "left join lateral (" +
      "  select window_size, slices, findings, gaps, exploration_share, summary " +
      "  from account_intelligence where account_id = sa.id " +
      "  order by created_at desc limit 1" +
      ") ai on true " +
      "where sa.product_id = $1 and sa.capability_state in ('live','draft_only') " +
      "and (sa.access_token_enc is not null or sa.provider_account_id is not null)",
    [productId],
  );

  if (accounts.length === 0) {
    ctx.log('editorial cycle found no connected accounts', { productId });
    return;
  }

  const productTiming = await ctx.pool.query<{ audience_timezone: string }>(
    'select audience_timezone from products where id = $1',
    [productId],
  );
  const audienceTimeZone = productTiming.rows[0]?.audience_timezone ?? 'UTC';

  const { rows: slots } = await ctx.pool.query<SlotRow>(
    `select platform, name, window_start::text, window_end::text, weekdays
       from slots
      where product_id = $1 and enabled
      order by platform, window_start`,
    [productId],
  );
  const platformsWithSlots = new Set(slots.map((slot) => slot.platform));
  const schedulableAccounts = accounts.filter((account) =>
    platformsWithSlots.has(account.platform),
  );
  if (schedulableAccounts.length === 0) {
    ctx.log('editorial cycle found no accounts with enabled publishing slots', {
      productId,
      connectedAccounts: accounts.length,
    });
    return;
  }

  const { rows: scheduledRows } = await ctx.pool.query<ScheduledRow>(
    `select id, platform, persona, idea_id, scheduled_at
       from content_items
      where product_id = $1
        and scheduled_at is not null
        and scheduled_at > now() - interval '1 day'
        and scheduled_at < now() + interval '8 days'
        and status not in ('rejected','archived','expired','failed')`,
    [productId],
  );
  const existingSchedule: ExistingPost[] = scheduledRows.map((row) => ({
    id: row.id,
    platform: row.platform,
    persona: row.persona,
    ideaId: row.idea_id,
    scheduledAt: new Date(row.scheduled_at),
  }));

  const insightRows = await ctx.pool.query(
    "select scope, platform, account_id, feature, feature_value, cohort_mean, baseline_mean, " +
      "lift, sample_size, baseline_size, status, confidence, corroborations, " +
      "supporting_content_ids, contradicting_content_ids, evidence_window_start, evidence_window_end, " +
      "observation, recommendation, review_after from learned_insights " +
      "where product_id = $1 and feature = 'creative_type'",
    [productId],
  );
  const insights = insightRows.rows.map((row) => mapInsight(row));

  const recentDecisions = await ctx.pool.query<{ signal_id: string; account_id: string }>(
    "select signal_id::text, account_id::text from strategy_decisions " +
      "where product_id = $1 and signal_id is not null " +
      "and created_at > now() - interval '14 days' " +
      "and 'autonomy:editorial_cycle' = any(evidence)",
    [productId],
  );

  const cycleAccounts = schedulableAccounts.map((row) => {
    const portfolio = asPortfolio(row);
    return {
      account: {
        id: row.id,
        platform: row.platform,
        capabilityState: row.capability_state,
        lastPublishedAt: row.last_published_at ? new Date(row.last_published_at) : null,
      },
      ...(portfolio ? { portfolio } : {}),
      insights: insights.filter(
        (insight) =>
          insight.scope === 'global' ||
          (insight.scope === 'platform' && insight.platform === row.platform) ||
          (insight.scope === 'account' && insight.accountId === row.id),
      ),
    };
  });

  const plan = planEditorialCycle({
    opportunities,
    accounts: cycleAccounts,
    recentDecisionKeys: recentDecisions.rows.map(
      (row) => row.signal_id + ':' + row.account_id,
    ),
    maxDecisions: limit,
    maxPerAccount: 1,
    maxSignalFanout: 1,
  });

  for (const selection of plan.selected) {
    const d = selection.decision;
    const accountRow = schedulableAccounts.find(
      (account) => account.id === selection.accountId,
    );
    if (!accountRow) continue;

    const schedule = chooseEditorialSchedule({
      selectionId: `editorial:${selection.signalId}:${selection.accountId}`,
      platform: selection.platform,
      persona: accountRow.persona,
      earliest: d.timing.earliest,
      latest: d.timing.latest,
      slots,
      audienceTimeZone,
      existing: existingSchedule,
    });
    if (!schedule) {
      ctx.log('autonomous opportunity has no legal publishing slot', {
        productId,
        signalId: selection.signalId,
        accountId: selection.accountId,
        platform: selection.platform,
        earliest: d.timing.earliest,
        latest: d.timing.latest,
      });
      continue;
    }

    const inserted = await ctx.pool.query<{ id: string }>(
      'insert into strategy_decisions ' +
        '(product_id, account_id, platform, signal_id, objective, creation_mode, why_now, audience, rationale, ' +
        'preferred_treatments, avoid_treatments, publish_earliest, publish_latest, timing_reason, ' +
        'primary_metric, success_threshold, measurement_basis, review_after, confidence, evidence) ' +
        'values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id',
      [
        productId,
        selection.accountId,
        selection.platform,
        selection.signalId,
        d.objective,
        d.creationMode,
        d.whyNow,
        d.audience,
        d.rationale +
          ' Editorial mode: ' +
          selection.mode +
          '. Controller score: ' +
          selection.score +
          '.',
        d.preferredTreatments,
        d.avoidTreatments,
        schedule.slotStart,
        schedule.slotEnd,
        d.timing.reason + ' ' + schedule.reason,
        d.measurement.primaryMetric,
        d.measurement.successThreshold,
        d.measurement.basis,
        d.measurement.reviewAfter,
        d.confidence,
        [...d.evidence, 'autonomy:editorial_cycle', 'mode:' + selection.mode],
      ],
    );
    const decisionId = inserted.rows[0]?.id;
    if (!decisionId) continue;

    await ctx.enqueue(
      'generate',
      {
        productId,
        preferredSignalId: selection.signalId,
        strategyDecisionId: decisionId,
        onlyAccountId: selection.accountId,
        onlyPlatform: selection.platform,
        scheduledAt: schedule.scheduledAt.toISOString(),
        slotName: schedule.slotName,
        limit: 1,
        autonomous: true,
      },
      {
        dedupeKey: 'editorial_generate:' + decisionId,
        priority: 35,
      },
    );

    existingSchedule.push({
      id: 'strategy:' + decisionId,
      platform: selection.platform,
      persona: accountRow.persona,
      ideaId: null,
      scheduledAt: schedule.scheduledAt,
    });

    ctx.log('autonomous editorial decision queued', {
      productId,
      decisionId,
      signalId: selection.signalId,
      accountId: selection.accountId,
      platform: selection.platform,
      scheduledAt: schedule.scheduledAt,
      slot: schedule.slotName,
      mode: selection.mode,
      score: selection.score,
      because: selection.reason,
    });
  }

  ctx.log('editorial cycle complete', {
    productId,
    opportunities: opportunities.length,
    accounts: accounts.length,
    considered: plan.considered,
    selected: plan.selected.length,
    refused: plan.refused.length,
    summary: plan.summary,
  });
};
