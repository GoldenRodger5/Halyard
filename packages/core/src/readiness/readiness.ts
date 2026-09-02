import { SCHEMA_EXPECTATIONS, type SchemaExpectation } from './schema.js';
/**
 * The readiness gate. Milestone 47 Part B.
 *
 * One screen that answers one question: can this system be trusted to run
 * unattended tomorrow? Not "is the code complete" — whether the *installation*
 * is complete, which is a different thing and the one that actually decides
 * whether anything goes out.
 *
 * Every check states what is missing and exactly what to do, because a red row
 * with no instruction is only an accusation.
 */

export type CheckState = 'pass' | 'warn' | 'fail' | 'blocked';

export interface ReadinessCheck {
  id: string;
  label: string;
  state: CheckState;
  /** What is true right now. */
  detail: string;
  /** What to do about it. Omitted only when there is nothing to do. */
  fix?: string;
  /** True when only the operator can resolve it — a credential, a decision. */
  needsYou?: boolean;
}

export interface ReadinessSection {
  id: string;
  title: string;
  /** Why this section exists, in one sentence. */
  why: string;
  checks: ReadinessCheck[];
}

export interface ReadinessInput {
  product: {
    id: string;
    name: string;
    briefLength: number;
    hasDestinations: boolean;
    hasShareTemplate: boolean;
    connectorType: string;
    connectorReachable: boolean | null;
    brandTokensSet: boolean;
  } | null;
  onboarding: {
    ingestDone: boolean;
    voiceDone: boolean;
    calibrationDone: boolean;
    templatesDone: boolean;
    accountsDone: boolean;
    calibrationReviewed: number;
    calibrationTarget: number;
  } | null;
  accounts: Array<{
    platform: string;
    persona: string;
    capabilityState: string;
    hasToken: boolean;
    identityConfirmed: boolean;
    tokenExpiresInDays: number | null;
    lastSelfTestOk: boolean | null;
  }>;
  pipeline: {
    workerSeenSecondsAgo: number | null;
    queuedJobs: number;
    deadJobs: number;
    renderSuccessRate: number | null;
    flowsVerified: number;
    flowsBroken: number;
    flowsNeverRun: number;
    pendingApproval: number;
    /**
     * §492. Columns this build reads that the database does not have, as
     * `missingSchema` reports them. Undefined when the caller could not ask —
     * which is itself worth a warning, never a pass.
     */
    schemaMissing?: SchemaExpectation[];
  };
  attribution: {
    utmStampedPosts: number;
    attributionRows: number;
    appStoreConfigured: boolean;
    routedClicks: number;
  };
  safety: {
    publishingEnabled: boolean;
    tokenEncryptionKeySet: boolean;
    devUnauthenticated: boolean;
    sentryConfigured: boolean;
    release: string;
  };
  env: Record<string, string | undefined>;
}

const WORKER_STALE_SECONDS = 15 * 60;

export function assessReadiness(input: ReadinessInput): ReadinessSection[] {
  return [
    productSection(input),
    calibrationSection(input),
    accountsSection(input),
    pipelineSection(input),
    attributionSection(input),
    safetySection(input),
  ];
}

function productSection(input: ReadinessInput): ReadinessSection {
  const checks: ReadinessCheck[] = [];
  const product = input.product;

  if (!product) {
    checks.push({
      id: 'product.exists',
      label: 'A product exists',
      state: 'fail',
      detail: 'No product is configured.',
      fix: 'Add one on /master/product/new. It takes five steps.',
      needsYou: true,
    });
    return { id: 'product', title: 'Product', why: 'Everything generated is downstream of this.', checks };
  }

  checks.push({
    id: 'product.brief',
    label: 'The brief is written',
    state: product.briefLength > 400 ? 'pass' : product.briefLength > 0 ? 'warn' : 'fail',
    detail:
      product.briefLength === 0
        ? 'Empty.'
        : `${product.briefLength} characters.`,
    fix:
      product.briefLength > 400
        ? undefined
        : 'The brief is the single most load-bearing input in the system. A thin one produces copy that would fit any product. Write it on the product screen.',
    needsYou: true,
  });

  checks.push({
    id: 'product.destinations',
    label: 'Destinations are configured',
    state: product.hasDestinations ? (product.hasShareTemplate ? 'pass' : 'warn') : 'fail',
    detail: product.hasShareTemplate
      ? 'Web, App Store and a share-link template.'
      : product.hasDestinations
        ? 'A web URL, but no share-link template.'
        : 'None.',
    fix: product.hasShareTemplate
      ? undefined
      : 'Without a share template, a post about one specific adaptation can only link to the homepage, and the reader has to reproduce what they just read.',
  });

  checks.push({
    id: 'product.connector',
    label: 'The product connector answers',
    state:
      product.connectorType === 'none'
        ? 'pass'
        : product.connectorReachable === true
          ? 'pass'
          : product.connectorReachable === false
            ? 'fail'
            : 'warn',
    detail:
      product.connectorType === 'none'
        ? 'No connector, which is a supported configuration.'
        : product.connectorReachable === true
          ? `${product.connectorType} connector reachable.`
          : product.connectorReachable === false
            ? `${product.connectorType} connector unreachable.`
            : 'Never tested.',
    fix:
      product.connectorReachable === false
        ? 'Generation pauses for this product while it is down; the queue is unaffected. Check the credentials named in the connector config.'
        : undefined,
  });

  checks.push({
    id: 'product.brand',
    label: 'Brand tokens are set',
    state: product.brandTokensSet ? 'pass' : 'warn',
    detail: product.brandTokensSet ? 'Colours and type configured.' : 'Using defaults.',
    fix: product.brandTokensSet ? undefined : 'Every rendered image uses these.',
  });

  return {
    id: 'product',
    title: 'Product',
    why: 'Everything generated is downstream of the brief and the brand.',
    checks,
  };
}

function calibrationSection(input: ReadinessInput): ReadinessSection {
  const onboarding = input.onboarding;
  const checks: ReadinessCheck[] = [];

  if (!onboarding) {
    checks.push({
      id: 'calibration.missing',
      label: 'First-run wizard',
      state: 'fail',
      detail: 'Never started.',
      fix: 'Open /onboarding. Generation refuses to run until it is finished, which is deliberate.',
      needsYou: true,
    });
  } else {
    const steps: Array<[string, boolean, string]> = [
      ['Brief ingested', onboarding.ingestDone, 'Paste or write the brief in /onboarding.'],
      ['Voice configured', onboarding.voiceDone, 'Describe how the product sounds.'],
      [
        'Voice calibrated',
        onboarding.calibrationDone,
        `Rate ${onboarding.calibrationTarget} real drafts in /onboarding — ${onboarding.calibrationReviewed} done. Without this the copywriter is guessing at your taste.`,
      ],
      ['Templates reviewed', onboarding.templatesDone, 'Approve or disable each template.'],
      ['Accounts connected', onboarding.accountsDone, 'Connect at least one account on /master.'],
    ];

    for (const [label, done, fix] of steps) {
      checks.push({
        id: `calibration.${label.toLowerCase().replace(/\s+/g, '_')}`,
        label,
        state: done ? 'pass' : 'fail',
        detail: done ? 'Done.' : 'Outstanding.',
        fix: done ? undefined : fix,
        needsYou: true,
      });
    }
  }

  return {
    id: 'calibration',
    title: 'Calibration',
    why: 'Generation is blocked until this is finished, because an uncalibrated voice produces competent, generic content — which is the failure mode this system is most at risk of.',
    checks,
  };
}

function accountsSection(input: ReadinessInput): ReadinessSection {
  const checks: ReadinessCheck[] = [];
  const live = input.accounts.filter((a) => a.capabilityState === 'live');
  const withToken = input.accounts.filter((a) => a.hasToken);

  checks.push({
    id: 'accounts.any',
    label: 'At least one account can publish',
    state: live.length > 0 ? 'pass' : withToken.length > 0 ? 'warn' : 'fail',
    detail:
      live.length > 0
        ? `${live.length} live: ${live.map((a) => `${a.platform}/${a.persona}`).join(', ')}.`
        : withToken.length > 0
          ? `${withToken.length} connected, none live — all are draft-only or awaiting review.`
          : 'None connected.',
    fix:
      live.length > 0
        ? undefined
        : 'X and Bluesky have no review gate and can be live today. Everything else is weeks of waiting — track it on /gallery/stock/submissions.',
    needsYou: true,
  });

  const unconfirmed = withToken.filter((a) => !a.identityConfirmed);
  checks.push({
    id: 'accounts.identity',
    label: 'Every connected identity was confirmed',
    state: unconfirmed.length === 0 ? 'pass' : 'fail',
    detail:
      unconfirmed.length === 0
        ? 'All confirmed.'
        : `${unconfirmed.length} never confirmed: ${unconfirmed.map((a) => `${a.platform}/${a.persona}`).join(', ')}.`,
    fix:
      unconfirmed.length === 0
        ? undefined
        : 'Reconnect them. Posting from an account you did not mean to connect is the most common failure in this whole flow, and it is invisible until the first post lands.',
  });

  const expiring = input.accounts.filter(
    (a) => a.tokenExpiresInDays !== null && a.tokenExpiresInDays <= 7,
  );
  checks.push({
    id: 'accounts.expiry',
    label: 'No token expires within a week',
    state: expiring.length === 0 ? 'pass' : 'warn',
    detail:
      expiring.length === 0
        ? 'All tokens have more than seven days.'
        : expiring
            .map((a) => `${a.platform}/${a.persona} in ${a.tokenExpiresInDays}d`)
            .join(', '),
    fix: expiring.length === 0 ? undefined : 'Reconnect on /master before they lapse.',
  });

  const failing = input.accounts.filter((a) => a.lastSelfTestOk === false);
  checks.push({
    id: 'accounts.selftest',
    label: 'Credentials pass their self-test',
    state: failing.length === 0 ? 'pass' : 'fail',
    detail:
      failing.length === 0
        ? 'No failing self-tests.'
        : `${failing.length} failing: ${failing.map((a) => a.platform).join(', ')}.`,
    fix: failing.length === 0 ? undefined : 'Run the self-test on /master to see the reason.',
  });

  return {
    id: 'accounts',
    title: 'Accounts',
    why: 'A dead credential found by a publish job is a missed slot; found here it is an inconvenience.',
    checks,
  };
}

function pipelineSection(input: ReadinessInput): ReadinessSection {
  const p = input.pipeline;
  const checks: ReadinessCheck[] = [];

  /*
   * §492. First, because everything below reads the database this build was
   * written for. Production served a 500 on every gallery visit for want of
   * one column (§489), and no screen said so.
   */
  const missing = p.schemaMissing;
  checks.push({
    id: 'pipeline.schema',
    label: 'The database has every column this build reads',
    state: missing === undefined ? 'warn' : missing.length === 0 ? 'pass' : 'fail',
    detail:
      missing === undefined
        ? 'Could not ask the database which columns it has.'
        : missing.length === 0
          ? `All ${SCHEMA_EXPECTATIONS.length} recent columns present.`
          : `Missing ${missing.map((m) => `${m.table}.${m.column} (migration ${m.migration}, read by ${m.readBy})`).join('; ')}.`,
    fix:
      missing && missing.length > 0
        ? `Apply ${[...new Set(missing.map((m) => `supabase/migrations/${m.migration}_*.sql`))].join(', ')} to this database — see docs/DEPLOY.md, "Production is behind again". Until then the pages that read these columns fail with a server error.`
        : undefined,
    needsYou: missing !== undefined && missing.length > 0,
  });

  checks.push({
    id: 'pipeline.worker',
    label: 'The worker is alive',
    state:
      p.workerSeenSecondsAgo === null
        ? 'fail'
        : p.workerSeenSecondsAgo < WORKER_STALE_SECONDS
          ? 'pass'
          : 'fail',
    detail:
      p.workerSeenSecondsAgo === null
        ? 'Never seen.'
        : `Last heartbeat ${p.workerSeenSecondsAgo}s ago.`,
    fix:
      p.workerSeenSecondsAgo !== null && p.workerSeenSecondsAgo < WORKER_STALE_SECONDS
        ? undefined
        : 'Nothing generates, renders, publishes or collects without it. Start it with ./scripts/halyard --worker.',
  });

  checks.push({
    id: 'pipeline.dead',
    label: 'No jobs have died',
    state: p.deadJobs === 0 ? 'pass' : 'warn',
    detail: p.deadJobs === 0 ? 'None.' : `${p.deadJobs} exhausted their retries.`,
    fix: p.deadJobs === 0 ? undefined : 'Check /master/system for the reason each gave up.',
  });

  checks.push({
    id: 'pipeline.renders',
    label: 'Renders are succeeding',
    state:
      p.renderSuccessRate === null
        ? 'warn'
        : p.renderSuccessRate > 0.9
          ? 'pass'
          : p.renderSuccessRate > 0.6
            ? 'warn'
            : 'fail',
    detail:
      p.renderSuccessRate === null
        ? 'Nothing rendered in the last seven days.'
        : `${Math.round(p.renderSuccessRate * 100)}% over seven days.`,
  });

  checks.push({
    id: 'pipeline.flows',
    label: 'Capture flows verify against the live site',
    state:
      p.flowsBroken > 0 ? 'fail' : p.flowsNeverRun > 0 ? 'warn' : p.flowsVerified > 0 ? 'pass' : 'warn',
    detail:
      p.flowsBroken > 0
        ? `${p.flowsBroken} broken.`
        : p.flowsNeverRun > 0
          ? `${p.flowsNeverRun} never run.`
          : `${p.flowsVerified} verified.`,
    fix:
      p.flowsBroken > 0
        ? 'A broken flow records footage of an error state. Nothing is captured while it fails — fix the selector in packages/core/src/capture/flows.ts.'
        : p.flowsNeverRun > 0
          ? 'Run pnpm verify-flows, or capture from /gallery/stock/media.'
          : undefined,
  });

  checks.push({
    id: 'pipeline.queue',
    label: 'The queue is a size you would actually read',
    state: p.pendingApproval <= 12 ? 'pass' : 'warn',
    detail: `${p.pendingApproval} awaiting approval.`,
    fix:
      p.pendingApproval <= 12
        ? undefined
        : 'Better six items you consider than twenty you skim. If this keeps growing, lower the daily generation limit.',
  });

  return {
    id: 'pipeline',
    title: 'Pipeline',
    why: 'The parts that fail silently: a dead worker, a stalled queue, a flow recording black frames.',
    checks,
  };
}

function attributionSection(input: ReadinessInput): ReadinessSection {
  const a = input.attribution;
  const checks: ReadinessCheck[] = [];

  checks.push({
    id: 'attribution.utm',
    label: 'Published links carry UTMs',
    state: a.utmStampedPosts > 0 ? 'pass' : 'warn',
    detail:
      a.utmStampedPosts > 0
        ? `${a.utmStampedPosts} published posts stamped.`
        : 'Nothing published yet.',
  });

  checks.push({
    id: 'attribution.clicks',
    label: 'Clicks route through Halyard and are logged',
    state: a.routedClicks > 0 ? 'pass' : 'warn',
    detail: a.routedClicks > 0 ? `${a.routedClicks} logged.` : 'None yet.',
    fix:
      a.routedClicks > 0
        ? undefined
        : 'Click a published link yourself to prove the router end to end.',
  });

  checks.push({
    id: 'attribution.product',
    label: 'The product captures what the link carries',
    state: a.attributionRows > 0 ? 'pass' : 'warn',
    detail:
      a.attributionRows > 0
        ? `${a.attributionRows} attribution rows.`
        : 'No attribution rows. Halyard stamps the links; the product has to record them.',
    fix:
      a.attributionRows > 0
        ? undefined
        : 'This is the other half of the chain and it lives in the RecipeFix repo, not this one: capture utm_content on landing and set it on the analytics identity. Until then every post scores as if it converted nobody.',
    needsYou: true,
  });

  checks.push({
    id: 'attribution.appstore',
    label: 'App Store installs are attributable',
    state: a.appStoreConfigured ? 'pass' : 'warn',
    detail: a.appStoreConfigured ? 'Provider token configured.' : 'No provider token.',
    fix: a.appStoreConfigured
      ? undefined
      : 'Without it every install reads as organic and mobile-first platforms are systematically under-scored. App Store Connect → Analytics → Campaigns.',
    needsYou: true,
  });

  return {
    id: 'attribution',
    title: 'Attribution',
    why: 'Conversion by category is the chart that decides strategy. Everything above it is a leading indicator.',
    checks,
  };
}

function safetySection(input: ReadinessInput): ReadinessSection {
  const s = input.safety;
  const checks: ReadinessCheck[] = [];

  checks.push({
    id: 'safety.encryption',
    label: 'Tokens are sealed at rest',
    state: s.tokenEncryptionKeySet ? 'pass' : 'fail',
    detail: s.tokenEncryptionKeySet ? 'TOKEN_ENCRYPTION_KEY is set.' : 'Not set.',
    fix: s.tokenEncryptionKeySet
      ? undefined
      : 'No token can be stored or opened without it. Generate one: openssl rand -base64 32.',
    needsYou: true,
  });

  checks.push({
    id: 'safety.auth',
    label: 'The dashboard requires authentication',
    state: s.devUnauthenticated ? 'fail' : 'pass',
    detail: s.devUnauthenticated
      ? 'HALYARD_DEV_UNAUTHENTICATED is set.'
      : 'Authentication required.',
    fix: s.devUnauthenticated
      ? 'Fine locally. Anywhere reachable it means anyone can publish as you — remove it before deploying.'
      : undefined,
  });

  checks.push({
    id: 'safety.killswitch',
    label: 'The kill switch is available',
    state: 'pass',
    detail: s.publishingEnabled
      ? 'Publishing is enabled; the switch is on /master/system.'
      : 'Publishing is currently paused.',
  });

  checks.push({
    id: 'safety.sentry',
    label: 'Errors are reported',
    state: s.sentryConfigured ? 'pass' : 'warn',
    detail: s.sentryConfigured
      ? `Reporting on, release ${s.release}.`
      : 'SENTRY_DSN is not set.',
    fix: s.sentryConfigured
      ? s.release === 'unknown'
        ? 'Release is "unknown", so a regression cannot be mapped to a change. Set SENTRY_RELEASE or deploy somewhere that exposes the commit.'
        : undefined
      : 'Failures are still recorded in the database and on /master/system; Sentry adds the stack and the release tag.',
  });

  return {
    id: 'safety',
    title: 'Safety',
    why: 'The invariants that must hold even when everything else is broken.',
    checks,
  };
}

export interface ReadinessVerdict {
  ready: boolean;
  failures: number;
  warnings: number;
  needsYou: number;
  /** One sentence, the honest headline. */
  summary: string;
}

export function summarise(sections: ReadinessSection[]): ReadinessVerdict {
  const checks = sections.flatMap((section) => section.checks);
  const failures = checks.filter((c) => c.state === 'fail').length;
  const warnings = checks.filter((c) => c.state === 'warn').length;
  const needsYou = checks.filter((c) => c.needsYou && c.state !== 'pass').length;

  return {
    ready: failures === 0,
    failures,
    warnings,
    needsYou,
    summary:
      failures === 0 && warnings === 0
        ? 'Everything checks out. This can run unattended.'
        : failures === 0
          ? `Nothing is broken. ${warnings} thing${warnings === 1 ? '' : 's'} would make it better.`
          : `${failures} thing${failures === 1 ? '' : 's'} would stop this working tomorrow.`,
  };
}
