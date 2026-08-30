/**
 * §355. The generation wizard's data, resolved on the server.
 *
 * `docs/UI_GENERATION_SPEC.md` describes the flow: where → what kind → shape →
 * specifics → generate. Every narrowing in it is **derived**, never listed —
 * which post types a set of platforms can carry, which formats a post type can
 * hold, which flows can be recorded — because a hand-written list beside the
 * adapters is what §349 found already disagreeing with them.
 *
 * All of it resolves here and crosses to the client as plain data. A client
 * component importing `@halyard/core` reaches `node:crypto` and fails
 * `next build` — `clientBoundary.test.ts` exists because that once passed the
 * whole suite and broke only there.
 */
import {
  POST_FORMATS,
  POST_FORMAT_CATALOG,
  POST_TYPES,
  POST_TYPE_CATALOG,
  allFlows,
  canCarry,
  getAdapter,
  platformsForFormat,
  optionsFor,
  requiresCitation,
  supportFromConstraints,
  type PlatformSupport,
} from '@halyard/core';
import { requireOperator } from '@/lib/auth';
import { query } from '@/lib/db';
import { MakeClient } from './MakeClient';

export const dynamic = 'force-dynamic';

/** Every platform Halyard has an adapter for, in the order the picker shows. */
const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'x', 'threads', 'pinterest'] as const;

export default async function MakePage() {
  await requireOperator();
  const productId = 'recipefix';

  const accounts = await query<{ platform: string; capability_state: string }>(
    'select platform, capability_state from social_accounts where product_id = $1',
    [productId],
  );
  const connected = Object.fromEntries(accounts.map((a) => [a.platform, a.capability_state]));

  /**
   * §355. What each platform can carry, from its own adapter.
   *
   * Read once here rather than in the client, both because the adapters are
   * server-only and because the answer is the same for every operator — it is
   * a property of the platform, not of the session.
   */
  const supports: PlatformSupport[] = PLATFORMS.map((platform) =>
    supportFromConstraints(platform, getAdapter(platform as never).constraints),
  );

  /**
   * The carriage matrix: for every post type, which platforms can carry it and
   * **why not**, for the ones that cannot.
   *
   * The reason is the important half. A disabled button with no explanation
   * makes an operator wonder whether it is broken; one that says "TikTok
   * carries no caption-only post" tells them to drop TikTok or change the type.
   */
  const carriage = POST_TYPES.map((id) => {
    const postType = POST_TYPE_CATALOG[id];
    return {
      id: postType.id,
      name: postType.name,
      intent: postType.intent,
      media: postType.media,
      channel: postType.channel,
      byPlatform: Object.fromEntries(
        supports.map((support) => {
          const verdict = canCarry(postType, support);
          return [support.platform, { ok: verdict.ok, because: verdict.because }];
        }),
      ),
    };
  });

  /**
   * §358. What each format lets an operator choose, as data.
   *
   * Sent whole rather than fetched per selection: the catalogue is small, it
   * does not change per session, and a round trip on every click would make the
   * wizard feel like a form rather than a decision.
   */
  const optionsByFormat = Object.fromEntries(
    POST_FORMATS.flatMap((id) =>
      (['video', 'text', 'carousel', 'image'] as const).map((media) => [
        `${id}:${media}`,
        optionsFor(id, media),
      ]),
    ),
  );

  const formats = POST_FORMATS.map((id) => {
    const f = POST_FORMAT_CATALOG[id];
    return {
      id: f.id,
      name: f.name,
      intent: f.intent,
      /* §295. Derived from channels — the format carries no second list. */
      platforms: platformsForFormat(f.id),
      /* §355. Which briefs this format suits, so the wizard can narrow by type. */
      channels: f.channels as string[],
      needsArtifact: f.needsArtifact,
      needsCitation: requiresCitation(f),
      needsCapture: f.needsCapture === true,
    };
  });

  /**
   * §318. The flows an operator can ask to have recorded.
   *
   * Only the ones that start a session of their own: a flow with `dependsOn`
   * acts on a result another produced and is captured as part of its chain, and
   * `plumbing` flows are sign-in and setup, which nobody wants a video of.
   */
  const flows = allFlows()
    .filter((f) => !f.dependsOn && !f.plumbing)
    .map((f) => ({ id: f.id, title: f.title, why: f.why }));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <MakeClient
        productId={productId}
        platforms={[...PLATFORMS]}
        carriage={carriage}
        formats={formats}
        optionsByFormat={optionsByFormat}
        flows={flows}
        connected={connected}
      />
    </main>
  );
}
