/**
 * The current product context every writer receives.
 *
 * The Product Brain is the source of current understanding. A manual brief is
 * useful operator guidance, but it must not outrank a fresh verified fact or
 * force every product rescan to be followed by hand-editing prose.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface FactRow {
  category: string;
  key: string;
  value: string;
  detail: string | null;
  status: 'verified' | 'inferred';
  confidence: string | number | null;
}

interface FeatureRow {
  name: string;
  summary: string;
}

const VERIFIED_PRIORITY = [
  'identity',
  'users',
  'jobs_to_be_done',
  'differentiators',
  'workflows',
  'ux_model',
  'conversion_funnel',
  'content_pillars',
  'pricing',
  'monetization',
] as const;

const INFERENCE_PRIORITY = [
  'personas',
  'jobs_to_be_done',
  'differentiators',
  'content_pillars',
  'brand_voice',
  'competitors',
] as const;

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const KEY_PRIORITY: Record<string, string[]> = {
  identity: ['product_type', 'recipe_inputs', 'input_methods', 'adapted_recipe_output', 'dietary_profiles'],
  users: ['primary_audience', 'secondary_audience', 'tertiary_audience'],
  personas: ['favorite_recipe_preserver', 'one_dinner_multiple_diets_cook', 'cookbook_page_adapter'],
  jobs_to_be_done: ['adapt_recipe_to_diet', 'combine_diet_profiles', 'check_recipe_compliance', 'rescale_recipe'],
  differentiators: [
    'whole_recipe_adaptation', 'whole_recipe_not_ingredient_list',
    'multi_profile_conflict_resolution', 'changes_only_conflicts', 'only_changes_conflicts',
    'link_text_photo_inputs', 'actual_product_proof',
  ],
  workflows: ['ingredients_and_method_adaptation', 'recipe_adaptation_inputs', 'dietary_adaptation_profiles'],
  ux_model: ['universal_start', 'primary_audience', 'landing_model'],
  conversion_funnel: ['conversion_inputs', 'seo_to_conversion_flow', 'seo_to_conversion'],
  content_pillars: ['substitution_guides', 'diet_converter_pages', 'converter_pages', 'free_tools', 'kitchen_calculators'],
  pricing: ['plus_price', 'free_adaptations', 'free_no_account_allowance'],
  monetization: ['paid_gate', 'trial_terms', 'plans', 'web_billing'],
  brand_voice: ['scope_bound_promises', 'concrete_input_language', 'corrective_not_hype_driven'],
  competitors: ['manual_substitution_charts', 'ingredient_substitution_guides', 'search_engines_and_recipe_blogs'],
};

function rankWithinCategory(row: FactRow): number {
  const priority = KEY_PRIORITY[row.category] ?? [];
  const index = priority.indexOf(row.key);
  return index === -1 ? 100 : index;
}

function uniqueFacts(rows: FactRow[], categories: readonly string[], perCategory: number): FactRow[] {
  const seenValues = new Set<string>();
  const seenKeys = new Set<string>();
  const out: FactRow[] = [];
  for (const category of categories) {
    let n = 0;
    const candidates = rows
      .filter((row) => row.category === category)
      .sort((a, b) => rankWithinCategory(a) - rankWithinCategory(b));
    for (const row of candidates) {
      const valueKey = compact(row.value).toLowerCase().replace(/[.!?]+$/g, '');
      const slotKey = `${row.category}:${row.key}`;
      if (seenValues.has(valueKey) || seenKeys.has(slotKey)) continue;
      seenValues.add(valueKey);
      seenKeys.add(slotKey);
      out.push(row);
      n += 1;
      if (n >= perCategory) break;
    }
  }
  return out;
}

export async function buildProductMarketingContext(
  db: Queryable,
  productId: string,
  fallback?: string | null,
): Promise<string> {
  const [factsResult, featuresResult] = await Promise.all([
    db.query<FactRow>(
      `select category, key, value, detail, status, confidence
         from product_facts
        where product_id = $1
          and superseded_by is null
          and contradicts is null
          and (
            (status = 'verified' and last_verified_at >= now() - interval '14 days')
            or status = 'inferred'
          )
        order by
          case status when 'verified' then 0 else 1 end,
          confidence desc nulls last,
          updated_at desc`,
      [productId],
    ),
    db.query<FeatureRow>(
      `select name, summary
         from feature_claims
        where product_id = $1
          and status = 'verified'
          and verified_at >= now() - interval '14 days'
        order by verified_at desc, name
        limit 12`,
      [productId],
    ),
  ]);

  const verified = uniqueFacts(
    factsResult.rows.filter((row) => row.status === 'verified'),
    VERIFIED_PRIORITY,
    3,
  );
  const inferred = uniqueFacts(
    factsResult.rows.filter((row) => row.status === 'inferred'),
    INFERENCE_PRIORITY,
    2,
  );
  const features = featuresResult.rows.slice(0, 10);

  if (verified.length === 0 && features.length === 0) return fallback?.trim() || '';

  const lines = [
    'CURRENT PRODUCT INTELLIGENCE — generated from Halyard evidence.',
    'VERIFIED FACTS below may be stated publicly when relevant. Never embellish them.',
    ...verified.map((row) => `- [FACT:${row.category}:${row.key}] ${compact(row.value)}`),
  ];

  if (features.length > 0) {
    lines.push(
      '',
      'VERIFIED LIVE WORKFLOWS — replayed successfully in a browser:',
      ...features.map((row) => `- [verified feature] ${compact(row.name)}: ${compact(row.summary)}`),
    );
  }

  if (inferred.length > 0) {
    lines.push(
      '',
      'STRATEGIC INFERENCES — use for audience, angle, positioning and topic selection only.',
      'Do NOT quote or assert these as observed product facts:',
      ...inferred.map((row) => `- [INFERENCE:${row.category}:${row.key}] ${compact(row.value)}`),
    );
  }

  if (fallback?.trim()) {
    lines.push(
      '',
      'OPERATOR BRIEF — supplemental intent. If it conflicts with verified intelligence, verified intelligence wins:',
      compact(fallback),
    );
  }

  return lines.join('\n').slice(0, 9_000);
}


export interface BrainClaimCheck {
  text: string;
  source: string;
  verdict: 'verified' | 'needs_review' | 'unsupported';
  factValue?: string;
  overlap?: number;
  reason: string;
}

function claimTokens(value: string): Set<string> {
  const stop = new Set(['the','a','an','and','or','to','of','for','in','on','with','is','are','can','it','this','that','from','while','they','their','users','recipefix']);
  return new Set(
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
      .filter((token) => token.length > 2 && !stop.has(token)),
  );
}

export function lexicalClaimSupport(claim: string, fact: string): number {
  const a = claimTokens(claim);
  const b = claimTokens(fact);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * Resolve non-artifact product claims against the current verified Product Brain.
 *
 * This does not ask a model whether its own sentence is true. The writer names
 * a stable FACT token; code resolves that token to a fresh verified row and
 * checks that the paraphrase still shares meaningful content with the fact.
 */
export async function verifyClaimsAgainstProductBrain(
  db: Queryable,
  productId: string,
  claims: Array<{ text?: string; source?: string }>,
): Promise<{ passed: boolean; checks: BrainClaimCheck[]; summary: string }> {
  const { rows } = await db.query<FactRow>(
    `select category, key, value, detail, status, confidence
       from product_facts
      where product_id = $1 and superseded_by is null and contradicts is null
        and status = 'verified'
        and last_verified_at >= now() - interval '14 days'`,
    [productId],
  );
  const byToken = new Map<string, FactRow[]>();
  for (const row of rows) {
    const token = `FACT:${row.category}:${row.key}`;
    byToken.set(token, [...(byToken.get(token) ?? []), row]);
  }

  const checks: BrainClaimCheck[] = [];
  for (const raw of claims) {
    const text = String(raw.text ?? '').trim();
    const source = String(raw.source ?? '').trim();
    if (!text) continue;

    if (source.startsWith('user.') || source === 'operator.intent') {
      checks.push({
        text, source, verdict: 'needs_review',
        reason: 'Editorial/operator intent, not a Product Brain fact. Keep it as a promise or opinion, never as product evidence.',
      });
      continue;
    }

    const candidates = byToken.get(source) ?? [];
    if (candidates.length === 0) {
      checks.push({
        text, source, verdict: 'unsupported',
        reason: `Source ${source || '(missing)'} does not resolve to a fresh verified Product Brain fact.`,
      });
      continue;
    }

    const scored = candidates
      .map((row) => ({ row, overlap: lexicalClaimSupport(text, row.value) }))
      .sort((a, b) => b.overlap - a.overlap);
    const best = scored[0]!;
    // Deliberately modest: this is a provenance sanity check, not a semantic
    // judge. The source token is the strong control; overlap catches a token
    // attached to an unrelated sentence.
    if (best.overlap < 0.2) {
      checks.push({
        text, source, verdict: 'unsupported', factValue: best.row.value, overlap: best.overlap,
        reason: 'The cited fact exists, but the claim shares too little content with it to accept the citation automatically.',
      });
    } else {
      checks.push({
        text, source, verdict: 'verified', factValue: best.row.value, overlap: best.overlap,
        reason: 'Resolved to a fresh verified Product Brain fact.',
      });
    }
  }

  const unsupported = checks.filter((check) => check.verdict === 'unsupported').length;
  const verified = checks.filter((check) => check.verdict === 'verified').length;
  const review = checks.filter((check) => check.verdict === 'needs_review').length;
  return {
    passed: unsupported === 0,
    checks,
    summary: `${verified}/${checks.length} resolved to fresh Product Brain facts${review ? ` · ${review} editorial claim${review === 1 ? '' : 's'} need review` : ''}${unsupported ? ` · ${unsupported} unsupported` : ''}`,
  };
}
