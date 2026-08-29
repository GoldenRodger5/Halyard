import Link from 'next/link';
import { POST_FORMATS, POST_FORMAT_CATALOG, requiresCitation } from '@halyard/core';
import { Card, PageHeader, SectionTitle } from '@halyard/ui';
import { AssetPicker } from '@/components/AssetPicker';
import { query } from '@/lib/db';
import { getProducts } from '@/lib/queries';
import { ComposeClient } from './ComposeClient';

export const dynamic = 'force-dynamic';

export default async function ComposePage() {
  const products = await getProducts();
  const product = products[0];

  const [sessions, recentDrafts] = await Promise.all([
    query<{ id: string; title: string | null; created_at: string }>(
      'select id, title, created_at from compose_sessions order by created_at desc limit 12',
    ),
    // Drafts queued from the co-pilot, which is what an asset gets attached to.
    query<{ id: string; body: string; attached_asset_ids: string[] }>(
      `select id, body, attached_asset_ids
         from content_items
        where product_id = $1
          and status in ('draft','pending_approval')
          and generation_meta ->> 'source' = 'compose'
        order by created_at desc limit 3`,
      [product?.id ?? 'recipefix'],
    ),
  ]);
  const latestDraft = recentDrafts[0];

  return (
    <>
      <PageHeader
        title="Compose"
        subtitle="The daily queue handles volume. This handles the case where you have a specific idea, or saw something worth responding to, or want to work an angle out loud. That is where the best content usually comes from."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ComposeClient
        /*
         * §283. Resolved here so the client never imports `@halyard/core` —
         * the barrel reaches `node:crypto`, and a client component that can see
         * it fails the build (`clientBoundary.test.ts` exists for this).
         */
        formats={POST_FORMATS.map((id) => {
          const f = POST_FORMAT_CATALOG[id];
          return {
            id: f.id,
            name: f.name,
            intent: f.intent,
            platforms: f.platforms,
            needsArtifact: f.needsArtifact,
            needsCitation: requiresCitation(f),
          };
        })} productId={product?.id ?? 'recipefix'} />

        <aside className="space-y-6">
          <Card className="p-4">
            <SectionTitle>Tools available</SectionTitle>
            <ul className="space-y-2 text-sm">
              {[
                ['generate_sample', 'Pull real product output'],
                ['draft_copy', 'Platform-specific copy'],
                ['render_preview', 'Fast 480p render for iteration'],
                ['render_final', 'Full-quality render'],
                ['check_novelty', 'Have I posted this before?'],
                ['search_past_posts', 'Find and re-template a winner'],
                ['suggest_platforms', 'Recommend where it fits'],
                ['run_qc', 'Run all four gates on demand'],
              ].map(([name, purpose]) => (
                <li key={name} className="flex flex-col">
                  <code className="text-xs text-primary">{name}</code>
                  <span className="text-xs text-muted">{purpose}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <SectionTitle hint="captures of the live product, and photographs">
              Attach an asset
            </SectionTitle>
            {latestDraft ? (
              <>
                <p className="mb-3 line-clamp-2 text-xs text-muted">
                  Attaches to your most recent draft: “{latestDraft.body.slice(0, 80)}…”
                </p>
                <AssetPicker
                  contentItemId={latestDraft.id}
                  productId={product?.id ?? 'recipefix'}
                  attachedIds={latestDraft.attached_asset_ids ?? []}
                />
              </>
            ) : (
              <p className="text-sm text-muted">
                Queue a draft from the conversation and its assets can be picked here. The library
                lives on{' '}
                <Link href="/assets" className="text-primary underline">
                  Assets
                </Link>
                .
              </p>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle hint="the reasoning is often reusable">Saved conversations</SectionTitle>
            {sessions.length === 0 ? (
              /*
               * "Nothing saved yet" implied the operator had not saved one.
               * Nothing *can* save one: `compose_sessions` has a reader here
               * and no writer anywhere, so this list is empty by construction
               * rather than by circumstance. Saying so is the same rule the
               * legal pages follow — a surface must not imply a control the
               * product does not have.
               */
              <p className="text-sm text-muted">
                Conversations are not saved yet. Drafts you queue from here appear under recent
                drafts; the conversation that produced them is not kept.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {sessions.map((session) => (
                  <li key={session.id} className="truncate text-sm text-ink">
                    {session.title ?? 'Untitled'}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
