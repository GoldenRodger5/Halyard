/**
 * §356. Watching a run.
 *
 * Pressing Generate used to show a queue and nothing else, so the several
 * minutes a piece takes were silent. The messages that explain a run were
 * already written — "post format chosen", "research", "annotations planned" —
 * and went to the container's stdout, where no operator can read them.
 */
import { notFound } from 'next/navigation';
import { requireOperator } from '@/lib/auth';
import { loadRun } from './route-data';
import { RunClient } from './RunClient';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ jobId: string }> }) {
  await requireOperator();
  const { jobId } = await params;
  const run = await loadRun(jobId);
  if (!run) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      {/* Rendered once on the server so the page is useful before JS loads,
          then kept current by the client. */}
      <RunClient initial={run} />
    </main>
  );
}
