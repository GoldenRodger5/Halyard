/**
 * §570. The web tier's build stamp only exists if you write it out literally.
 *
 * `next.config.ts` puts `HALYARD_RELEASE` and `HALYARD_BUILT_AT` in its `env`
 * block, which reads like it sets two environment variables and does not.
 * Next implements `env` as a **static text substitution at build time**: it
 * replaces the literal source text `process.env.HALYARD_BUILT_AT` with the
 * value. Anything that reaches the variable dynamically — `env[name]`, a
 * spread of `process.env`, a loop over candidate keys — finds nothing, because
 * there is nothing at runtime to find.
 *
 * `releaseIdentity` reads its keys dynamically, which is right for the worker
 * (Railway sets real variables) and silently wrong here. Production proved it:
 * the deployed `/api/health` reported the right commit — that comes from
 * `VERCEL_GIT_COMMIT_SHA`, a genuine runtime variable — and `builtAt: null`.
 *
 * So the two names are written out in full, once, here. Every web caller uses
 * this and gets a complete identity; nothing else in the app should reach for
 * those two variables.
 */
import { releaseIdentity, type ReleaseIdentity } from '@halyard/core';

export function webReleaseIdentity(): ReleaseIdentity {
  /*
   * Literal member access, deliberately. Do not refactor these into a loop or
   * a lookup — the substitution is textual, and the value disappears the
   * moment the expression stops naming the variable outright.
   */
  const built = process.env.HALYARD_BUILT_AT;
  const release = process.env.HALYARD_RELEASE;

  return releaseIdentity({
    ...process.env,
    ...(built ? { HALYARD_BUILT_AT: built } : {}),
    ...(release ? { HALYARD_RELEASE: release } : {}),
  });
}
