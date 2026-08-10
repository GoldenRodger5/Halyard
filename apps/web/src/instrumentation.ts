/**
 * Web-tier error reporting. Milestone 43, item 5.
 *
 * Next compiles this file for every runtime it supports, including edge, where
 * `node:crypto` does not exist — so nothing here may import `@halyard/core` at
 * the top level. Both the SDK and the shared scrubbing policy are loaded inside
 * the guard, only on the Node runtime, and only when a DSN is configured.
 *
 * Both tiers report to the same project tagged by tier, so a publish that fails
 * in the worker and a screen showing the wrong thing read as one incident.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.SENTRY_DSN) return;

  try {
    // The observability subpath, not the barrel: `@halyard/core` reaches
    // node:crypto through the connector cache, and this file is compiled for
    // the edge runtime too, where that scheme does not exist.
    const { initSentry } = await import('@halyard/core/observability');
    const specifier = '@sentry/nextjs';
    const sentry = (await import(/* webpackIgnore: true */ specifier)) as unknown as Parameters<
      typeof initSentry
    >[0];
    initSentry(sentry, 'web');
  } catch {
    console.warn(
      'SENTRY_DSN is set but @sentry/nextjs is not installed. ' +
        'Run `pnpm --filter @halyard/web add @sentry/nextjs`. Continuing without error reporting.',
    );
  }
}

/**
 * Server-side request errors. Next routes these here rather than through the
 * SDK's own handler when the SDK is loaded dynamically.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.SENTRY_DSN) return;

  try {
    const { scrubEvent, shouldReport } = await import('@halyard/core/observability');
    if (!shouldReport(error as { name?: string })) return;

    const specifier = '@sentry/nextjs';
    const sentry = (await import(/* webpackIgnore: true */ specifier)) as unknown as {
      captureException(e: unknown, hint?: Record<string, unknown>): void;
    };
    sentry.captureException(error, { extra: scrubEvent(request) });
  } catch {
    // Reporting an error must never itself become an error.
  }
}
