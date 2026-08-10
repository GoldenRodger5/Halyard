import { Card, PageHeader, SectionTitle } from '@halyard/ui';
import { query } from '@/lib/db';
import { getProducts } from '@/lib/queries';
import { ComposeClient } from './ComposeClient';

export const dynamic = 'force-dynamic';

export default async function ComposePage() {
  const products = await getProducts();
  const product = products[0];

  const sessions = await query<{ id: string; title: string | null; created_at: string }>(
    'select id, title, created_at from compose_sessions order by created_at desc limit 12',
  );

  return (
    <>
      <PageHeader
        title="Compose"
        subtitle="The daily queue handles volume. This handles the case where you have a specific idea, or saw something worth responding to, or want to work an angle out loud. That is where the best content usually comes from."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ComposeClient productId={product?.id ?? 'recipefix'} />

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
            <SectionTitle hint="the reasoning is often reusable">Saved conversations</SectionTitle>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted">Nothing saved yet.</p>
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
