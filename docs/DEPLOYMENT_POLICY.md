# Deployment efficiency policy

## One app, one active Vercel Git connection

`halyard` is the existing configured production project. The duplicate `web` project pointed at the same repository and the same `apps/web` root, but did not have the production environment configured. Its Git connection was removed on September 29, 2026; existing deployments and domains were not deleted. Do not reconnect it automatically or create replacement projects to evade limits.

## Reduce deployment creation, not just build duration

Vercel Hobby permits 100 deployments per day at owner scope. Cancelling via an Ignored Build Step still consumes deployment quota. Use the upstream Git branch policy and Vercel's affected-project detection instead. The production project now has `enableAffectedProjectsDeployments=true`; the root directory and dependency graph still determine which commits are affected.

`apps/web/vercel.json` disables automatic deployments for ordinary work branches. `main` remains enabled. An explicitly named `preview/**` branch opts into a preview when an actual visual review requires it. Configuration preserves the existing application cron jobs.

Work in small local commits, test locally/in CI, and push a cohesive validated release rather than deploying each edit. Require the existing checks before merging. Avoid a separate manual deploy when a matching automatic deployment is already queued/building/READY. Reuse an exact-SHA valid deployment instead of rebuilding it.

## CI without duplicate events

CI runs once per pull-request update and once for a main-branch push. It no longer runs a second branch-push copy for the same open PR. Manual CI remains available through workflow_dispatch. All verify/build/e2e job definitions and database/browser checks are preserved. Concurrency is grouped by workflow and PR number, falling back to the Git ref; superseded runs cancel.

## Rate-limit handling

A rate-limited deployment is an infrastructure hold, not a reason to change video content, create more projects, retry repeatedly or upgrade billing automatically. Preserve the tested desired SHA, the exact error, observation time and any provider-supplied reset/retry-after. Do not retry before that time. When only a daily-limit response is available, record that the precise reset was not returned rather than inventing one. Existing deployed runtime and ordinary API invocation are separate from deployment creation.

Local/CI build success, Vercel deployment READY, healthy runtime and a successful exact-final clip are separate proofs. Never point production at an unconfigured preview to make the deployment label look green. No billing plan or spend limit was changed by this optimization.

Sources: https://vercel.com/docs/limits ; https://vercel.com/docs/project-configuration/git-configuration ; https://vercel.com/docs/project-configuration/project-settings ; https://vercel.com/docs/monorepos ; https://vercel.com/docs/cli/git .
