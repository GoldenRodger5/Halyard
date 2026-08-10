/**
 * Worker-tier error reporting. Milestone 43, item 5.
 *
 * The SDK is loaded dynamically and optionally. Halyard has to run on a machine
 * where `@sentry/node` was never installed — that is the normal state in
 * development — and a missing observability dependency must never be the reason
 * publishing stops.
 */
import { initSentry, shouldReport, type SentryLike } from '@halyard/core/observability';

let sentry: SentryLike | null = null;

export async function startErrorReporting(
  log: (message: string, detail?: Record<string, unknown>) => void,
): Promise<void> {
  if (!process.env.SENTRY_DSN) {
    log('error reporting off, SENTRY_DSN is not set');
    return;
  }

  try {
    // Not a static import: `@sentry/node` is an optional dependency and this
    // process must start on a machine where it was never installed. The
    // specifier is built at runtime so the bundler does not try to resolve it.
    const specifier = '@sentry/node';
    const mod = (await import(/* webpackIgnore: true */ specifier)) as unknown as SentryLike;
    const config = initSentry(mod, 'worker');
    if (config) {
      sentry = mod;
      log('error reporting on', { environment: config.environment, release: config.release });
    }
  } catch {
    log(
      'SENTRY_DSN is set but @sentry/node is not installed. ' +
        'Run `pnpm --filter @halyard/worker add @sentry/node`. Continuing without error reporting.',
    );
  }
}

/**
 * Report a job failure.
 *
 * Job failures already land in `jobs.last_error` and the notifications table;
 * this adds the stack and the release tag, which is what makes a regression
 * traceable to a change.
 */
export function reportJobFailure(
  error: unknown,
  context: { jobId: string; kind: string; attempts: number },
): void {
  if (!sentry) return;
  if (!shouldReport(error as { name?: string })) return;
  sentry.captureException(error, { tags: { job_kind: context.kind }, extra: context });
}
