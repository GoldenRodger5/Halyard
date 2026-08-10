import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Card,
  GateLine,
  KeyValue,
  PLATFORM_LABELS,
  PageHeader,
  PlatformDot,
  SectionTitle,
} from '@halyard/ui';
import { getItemArtifact, getProducts, getQueueItem } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { editItem, rescheduleItem } from '../actions';

export const dynamic = 'force-dynamic';

export default async function QueueItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getQueueItem(id);
  if (!item) notFound();

  const products = await getProducts();
  const timeZone = products[0]?.operator_timezone ?? 'UTC';
  const artifact = (await getItemArtifact(id)) as {
    product_artifact: unknown;
    generation_meta: Record<string, unknown>;
  } | null;

  const gates = item.qc_results?.gates ?? [];

  return (
    <>
      <PageHeader
        title={item.title ?? 'Draft'}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PlatformDot platform={item.platform} />
            {PLATFORM_LABELS[item.platform] ?? item.platform} · {item.persona} · {item.format} ·{' '}
            {item.category}
          </span>
        }
        actions={
          <Link href="/queue" className="text-sm text-primary underline">
            Back to queue
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-4">
            <SectionTitle hint={`${item.render_done} of ${item.render_total} rendered`}>
              Preview
            </SectionTitle>
            {item.preview_urls.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No rendered media yet.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {item.preview_urls.map((url, i) => (
                    <img
                    key={url}
                    src={url}
                    alt={item.alt_text ?? `Slide ${i + 1}`}
                    className="max-h-[28rem] w-auto shrink-0 rounded-lg border border-line"
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle>Copy</SectionTitle>
            <form action={editItem} className="space-y-3">
              <input type="hidden" name="id" value={item.id} />
              <textarea
                name="body"
                defaultValue={item.body}
                rows={10}
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed focus:border-primary focus:outline-none"
              />
              <div className="flex justify-end">
                <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
                  Save
                </button>
              </div>
            </form>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 border-t border-line pt-3">
              <KeyValue label="Alt text">{item.alt_text ?? 'not set'}</KeyValue>
              <KeyValue label="Hashtags">
                {item.hashtags.length > 0 ? item.hashtags.map((h) => `#${h}`).join(' ') : 'none'}
              </KeyValue>
              <KeyValue label="Link">{item.final_link_url ?? item.link_url ?? 'none'}</KeyValue>
              <KeyValue label="Audio mode">{item.audio_mode.replace(/_/g, ' ')}</KeyValue>
            </dl>
          </Card>

          <Card className="p-4">
            <SectionTitle hint="every claim resolves against the artifact">Claims</SectionTitle>
            {item.claims.length === 0 ? (
              <p className="text-sm text-muted">No factual claims were made.</p>
            ) : (
              <ul className="space-y-2">
                {item.claims.map((claim, i) => (
                  <li key={i} className="rounded-lg bg-sunk/50 p-3">
                    <p className="text-sm text-ink">{claim.text}</p>
                    <p className="mt-1 font-mono text-xs text-muted">{claim.source}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle>Source artifact</SectionTitle>
            <details>
              <summary className="cursor-pointer text-sm text-primary">
                Show the raw product output this was built from
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-sunk p-3 text-[11px] leading-relaxed text-muted">
                {JSON.stringify(artifact?.product_artifact ?? null, null, 2)}
              </pre>
            </details>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-4">
            <SectionTitle>QC</SectionTitle>
            <div className="space-y-1.5">
              {gates.length === 0 ? (
                <p className="font-mono text-xs text-muted">QC has not run.</p>
              ) : (
                gates.map((gate) => (
                  <GateLine
                    key={gate.gate}
                    gate={gate.gate}
                    status={gate.status as 'passed' | 'warning' | 'failed' | 'skipped'}
                    summary={gate.summary}
                  />
                ))
              )}
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle>Schedule</SectionTitle>
            <p className="mb-3 text-sm text-ink">
              {item.scheduled_at ? formatInOperatorTz(item.scheduled_at, timeZone) : 'Unscheduled'}
            </p>
            <form action={rescheduleItem} className="space-y-2">
              <input type="hidden" name="id" value={item.id} />
              <select
                name="when"
                defaultValue="next_slot"
                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
              >
                <option value="next_slot">Next slot</option>
                <option value="custom">Custom</option>
              </select>
              <input
                type="datetime-local"
                name="custom_at"
                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
              />
              <button className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                Reschedule
              </button>
            </form>
          </Card>

          <Card className="p-4">
            <SectionTitle>Compliance</SectionTitle>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted">AI components:</span>
                {item.ai_components.length === 0 ? (
                  <span className="text-ink">none recorded</span>
                ) : (
                  item.ai_components.map((c) => <Badge key={c}>{c}</Badge>)
                )}
              </div>
              <p className="text-muted">
                {item.requires_ai_label
                  ? 'A disclosure is required and must appear in the caption before this can publish.'
                  : 'No disclosure required. AI-assisted text is exempt.'}
              </p>
              {item.disclosure_text ? (
                <p className="rounded-lg bg-sunk/50 p-2 text-xs text-ink">{item.disclosure_text}</p>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle>Generation</SectionTitle>
            <dl className="text-sm">
              {Object.entries(artifact?.generation_meta ?? {}).map(([key, value]) => (
                <KeyValue key={key} label={key.replace(/_/g, ' ')}>
                  {String(value)}
                </KeyValue>
              ))}
              {Object.keys(artifact?.generation_meta ?? {}).length === 0 ? (
                <p className="text-muted">No generation metadata recorded.</p>
              ) : null}
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}
