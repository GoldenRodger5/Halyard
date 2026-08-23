/**
 * Error reporting. Milestone 43, item 5.
 *
 * Both tiers report to the same project with different `server_name` tags, so a
 * failure can be traced across the boundary — a publish that fails in the worker
 * and a queue screen that shows the wrong thing are usually the same incident.
 *
 * The important part of this file is not the wiring. It is `scrubEvent`: this
 * system holds platform access tokens, and a Sentry breadcrumb is the most
 * common way a credential leaves a server. Every event is scrubbed before it is
 * sent, and the scrubbing is tested.
 */

export interface SentryConfig {
  dsn: string;
  environment: string;
  /** The commit this build came from, so a regression maps to a change. */
  release: string;
  tier: 'web' | 'worker';
  tracesSampleRate: number;
}

/**
 * Read the configuration, or explain why reporting is off.
 *
 * Returns null rather than throwing: a missing DSN in development is normal and
 * must not stop anything from running.
 */
export function sentryConfig(
  tier: SentryConfig['tier'],
  env: Record<string, string | undefined> = process.env,
): SentryConfig | null {
  const dsn = env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT ?? env.VERCEL_ENV ?? env.NODE_ENV ?? 'development',
    // Vercel and Railway both expose the commit; falling back to 'unknown' is
    // worse than useless for a regression hunt, so it is called out on
    // /settings/readiness rather than silently accepted.
    release:
      env.SENTRY_RELEASE ??
      env.VERCEL_GIT_COMMIT_SHA ??
      env.RAILWAY_GIT_COMMIT_SHA ??
      env.GIT_COMMIT_SHA ??
      'unknown',
    tier,
    // Traces are sampled low because the interesting signal here is errors, and a
    // worker that renders video would otherwise produce enormous traces.
    tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  };
}

/** Keys whose value must never leave this process, at any depth. */
const SENSITIVE_KEY = /token|secret|password|passwd|authorization|cookie|api[-_]?key|dsn|credential|private[-_]?key/i;

/** Values that look like a credential even when the key is innocent. */
const SENSITIVE_VALUE: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{10,}/gi, label: '[redacted bearer]' },
  { pattern: /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, label: '[redacted jwt]' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, label: '[redacted private key]' },
  { pattern: /\bpostgres(?:ql)?:\/\/[^\s"']+/gi, label: '[redacted database url]' },
  { pattern: /\bsk-[A-Za-z0-9-]{20,}\b/g, label: '[redacted api key]' },
];

/**
 * Credentials carried in a URL query string.
 *
 * `SENSITIVE_KEY` only inspects **object keys**, and the patterns above only
 * match credentials with a recognisable shape. Neither sees
 * `?access_token=EAAGm0PX…`, and the Instagram adapter puts exactly that in the
 * URL of every GET it makes — Meta's Graph API takes the token as a query
 * parameter rather than a header.
 *
 * That token is a long opaque string with no distinguishing prefix, so nothing
 * above matches it. Any path that put such a URL into a log line or an error
 * chain would have sent a live credential to Sentry, in the clear.
 *
 * Matched by parameter *name* rather than by value shape, because the value is
 * by definition unrecognisable. The name list is deliberately broad: over-
 * redacting a log costs a debugging detail, and under-redacting one costs a
 * credential.
 */
const SENSITIVE_QUERY_PARAM =
  /([?&](?:access_token|refresh_token|id_token|token|client_secret|secret|code|code_verifier|api[-_]?key|apikey|signature|sig|password|passwd|auth|session)=)[^&\s"'<>)\]]+/gi;

export function scrubString(value: string): string {
  let out = value;
  for (const { pattern, label } of SENSITIVE_VALUE) out = out.replace(pattern, label);
  // The parameter name is kept so a reader can still tell *what* was removed.
  out = out.replace(SENSITIVE_QUERY_PARAM, '$1[redacted]');
  return out;
}

/**
 * Recursively redact an event before it is sent.
 *
 * Depth-limited so a cyclic or pathological object cannot hang the reporter on
 * the way to reporting something else.
 */
export function scrubEvent<T>(event: T, depth = 0): T {
  if (depth > 8) return '[depth limit]' as unknown as T;
  if (typeof event === 'string') return scrubString(event) as unknown as T;
  if (!event || typeof event !== 'object') return event;
  if (Array.isArray(event)) {
    return event.map((entry) => scrubEvent(entry, depth + 1)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = scrubEvent(value, depth + 1);
  }
  return out as unknown as T;
}

/**
 * Errors that are expected operating states rather than defects.
 *
 * A paused kill switch and a duplicate-publish abort are the system working.
 * Reporting them trains the operator to ignore Sentry, which costs more than
 * the missing signal.
 */
const NOT_A_DEFECT = [
  'PublishingDisabled',
  'DuplicatePublishAbort',
  'ConnectorUnavailableError',
  'AppStoreCredentialsMissing',
  'AppStoreReportPending',
  'FlowVerificationFailed',
];

export function shouldReport(error: { name?: string } | null | undefined): boolean {
  if (!error?.name) return true;
  return !NOT_A_DEFECT.includes(error.name);
}

export interface SentryLike {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, hint?: Record<string, unknown>): string | undefined;
  setTag(key: string, value: string): void;
}

/**
 * Wire a Sentry SDK instance up with this project's rules.
 *
 * The SDK is injected rather than imported so both tiers share one policy and
 * the policy is testable without a network or a real DSN.
 */
export function initSentry(
  sentry: SentryLike,
  tier: SentryConfig['tier'],
  env: Record<string, string | undefined> = process.env,
): SentryConfig | null {
  const config = sentryConfig(tier, env);
  if (!config) return null;

  sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
    // Personally identifying data is never useful here — there is exactly one
    // operator — and sending it is a liability.
    sendDefaultPii: false,
    beforeSend: (event: Record<string, unknown>) => {
      const name = (event.exception as { values?: Array<{ type?: string }> } | undefined)
        ?.values?.[0]?.type;
      if (!shouldReport({ name })) return null;
      return scrubEvent(event);
    },
    beforeBreadcrumb: (breadcrumb: Record<string, unknown> | null) =>
      breadcrumb ? scrubEvent(breadcrumb) : null,
  });

  sentry.setTag('tier', tier);
  return config;
}
