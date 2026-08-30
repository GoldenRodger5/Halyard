/**
 * §288. The button page.
 *
 * The catalogue and the account states resolve here, on the server, and cross
 * to the client as plain data. A client component importing `@halyard/core`
 * reaches `node:crypto` and fails `next build` — `clientBoundary.test.ts` exists
 * because that once passed the whole suite and broke only there.
 */
import {
  POST_FORMATS,
  POST_FORMAT_CATALOG,
  allFlows,
  platformsForFormat,
  requiresCitation,
} from '@halyard/core';
import { requireOperator } from '@/lib/auth';
import { query } from '@/lib/db';
import { MakeClient } from './MakeClient';

export const dynamic = 'force-dynamic';

export default async function MakePage() {
  await requireOperator();
  const productId = 'recipefix';

  const accounts = await query<{ platform: string; capability_state: string }>(
    'select platform, capability_state from social_accounts where product_id = $1',
    [productId],
  );
  const connected = Object.fromEntries(accounts.map((a) => [a.platform, a.capability_state]));

  const formats = POST_FORMATS.map((id) => {
    const f = POST_FORMAT_CATALOG[id];
    return {
      id: f.id,
      name: f.name,
      intent: f.intent,
      /* §295. Derived from channels — the format carries no second list. */
      platforms: platformsForFormat(f.id),
      needsArtifact: f.needsArtifact,
      needsCitation: requiresCitation(f),
      /* §318. Whether this shape asks which part of the app to record. */
      needsCapture: f.needsCapture === true,
    };
  });

  /**
   * §318. The flows an operator can ask to have recorded.
   *
   * Only the ones that start a session of their own. A flow with `dependsOn`
   * acts on a result another flow produced and is captured as part of its
   * chain, so offering it as a choice would be offering something that cannot
   * be run — and `plumbing` flows are sign-in and setup, which nobody wants a
   * video of.
   */
  const flows = allFlows()
    .filter((f) => !f.dependsOn && !f.plumbing)
    .map((f) => ({ id: f.id, title: f.title, why: f.why }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Make something</h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        Pick where it goes and what shape it is. Everything after that is the same pipeline the
        scheduler runs.
      </p>
      <MakeClient productId={productId} formats={formats} flows={flows} connected={connected} />
    </main>
  );
}
