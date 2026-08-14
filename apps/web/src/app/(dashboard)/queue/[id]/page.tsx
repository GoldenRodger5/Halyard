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
import {
  extractShareToken,
  runDestinationQC,
  type DestinationType,
  type PlatformId,
} from '@halyard/core';
import { AssetPicker } from '@/components/AssetPicker';
import { ManualPublish } from '@/components/ManualPublish';
import { getItemArtifact, getProducts, getQueueItem } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { editItem, markManuallyPublished, publishNow, rescheduleItem } from '../actions';
import { resetDestination, setDestination } from '../destinationActions';

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

  // The coherence gate's findings and the frame descriptions they came from.
  // A rule name is not an explanation; the evidence is.
  const coherence = gates.find((g) => g.gate === 'coherence')?.detail as
    | { findings: Array<{ rule: string; severity: string; message: string; fix: string }> }
    | undefined;
  const observations =
    (item.media_observations as { frames?: Array<{ atSeconds: number; describes: string; visibleText: string[] }> } | null)
      ?.frames ?? [];
  const media = [...item.preview_urls, ...(item.attached_urls ?? [])];
  const staleAttached = (
    (item.qc_results as { staleAssets?: Array<{ reason: string | null }> }).staleAssets ?? []
  ).filter((s) => s.reason);

  // Milestone 42 — where this post sends people, shown before approval rather
  // than discovered after publication.
  const shareToken = extractShareToken(item.product_artifact);
  const destinationQc = runDestinationQC({
    category: item.category,
    destinationType: item.destination_type as DestinationType | null,
    destinationUrl: item.destination_url,
    webUrl: item.product_web_url,
    hasShareToken: Boolean(shareToken),
    hasShareTemplate: Boolean(item.product_share_template),
  });

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
            {media.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No media yet. Rendered slides appear here once the render job finishes; you can also
                attach a real screenshot or a photograph below.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {media.map((url, i) => (
                    <img
                    key={url}
                    src={url}
                    alt={item.alt_text ?? `Slide ${i + 1}`}
                    className="max-h-[28rem] w-auto shrink-0 rounded-lg border border-line"
                  />
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-line pt-4">
              <SectionTitle hint="captures of the live product, and photographs">
                Attach from the library
              </SectionTitle>
              {staleAttached.length > 0 ? (
                <p className="mb-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-ink">
                  {staleAttached.length === 1
                    ? 'An attached asset is stale: '
                    : `${staleAttached.length} attached assets are stale: `}
                  {staleAttached[0]!.reason}
                </p>
              ) : null}
              <AssetPicker
                contentItemId={item.id}
                productId={item.product_id}
                attachedIds={item.attached_asset_ids ?? []}
                usableFor={item.format === 'video' ? 'video' : 'image'}
              />
            </div>
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
              {item.board_id ? (
                <KeyValue label="Pinterest board">{item.board_reason ?? item.board_id}</KeyValue>
              ) : null}
            </dl>

            {/* ── what this transport will drop ────────────────────────────
                Alt text is generated for every image and checked by the visual
                gate. If the transport carrying this post has no field for it,
                that work is discarded in transit, and the queue is the last
                place anybody could notice. */}
            {item.transport === 'unified' &&
            item.transport_alt_text === 'no' &&
            item.alt_text ? (
              <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm leading-relaxed text-ink">
                This post has alt text, and the unified transport has no alt-text field for{' '}
                {PLATFORM_LABELS[item.platform as PlatformId] ?? item.platform}. It will be dropped
                on the way out. Switch this account to the direct transport on{' '}
                <Link href="/accounts" className="text-primary hover:underline">
                  /accounts
                </Link>{' '}
                if the image carries meaning.
              </p>
            ) : null}
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
            <SectionTitle hint="decided at click time by device, and logged">
              Destination
            </SectionTitle>

            <p className="text-sm text-ink">
              {item.destination_url ? (
                <a
                  href={item.destination_url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-primary underline"
                >
                  {item.destination_url}
                </a>
              ) : (
                'Nothing set.'
              )}
            </p>
            {item.destination_reason ? (
              <p className="mt-1.5 text-sm text-muted">{item.destination_reason}</p>
            ) : null}

            {destinationQc.findings.map((finding) => (
              <p
                key={finding.rule}
                className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                  finding.severity === 'error' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-ink'
                }`}
              >
                {finding.message} <span className="text-muted">{finding.fix}</span>
              </p>
            ))}

            <p className="mt-3 text-xs text-muted">
              The published link is{' '}
              <code className="text-primary">{item.link_url ?? 'not stamped yet'}</code>, which
              routes by device: iOS opens the installed app through a universal link, everyone else
              gets the web page.
            </p>

            <form action={setDestination} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={item.id} />
              <label className="text-sm">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
                  Type
                </span>
                <select
                  name="destinationType"
                  defaultValue={item.destination_type ?? 'web'}
                  className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink"
                >
                  <option value="share_link" disabled={!shareToken}>
                    the specific recipe{shareToken ? '' : ' — no share token'}
                  </option>
                  <option value="web">the web page</option>
                  <option value="app_store">the App Store</option>
                  <option value="link_in_bio">the link-in-bio page</option>
                </select>
              </label>
              <label className="min-w-0 flex-1 text-sm">
                <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
                  Or a URL of your own
                </span>
                <input
                  name="destinationUrl"
                  placeholder="https://recipefix.app/recipe/…"
                  className="w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
                />
              </label>
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                Set
              </button>
            </form>
            <form action={resetDestination} className="mt-2">
              <input type="hidden" name="id" value={item.id} />
              <button className="text-xs text-muted underline hover:text-ink">
                Recompute from the artifact
              </button>
            </form>
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

            {/* ── what the describers actually saw ────────────────────────
                A rule name is not an explanation. When the coherence gate
                objects, the operator's first question is what the frames
                showed, and the answer is the evidence the verdict came from. */}
            {coherence && coherence.findings.length > 0 ? (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                {coherence.findings.map((finding) => (
                  <div key={finding.rule} className="text-sm">
                    <p className={finding.severity === 'error' ? 'text-danger' : 'text-ink'}>
                      {finding.message}
                    </p>
                    <p className="text-xs leading-relaxed text-muted">{finding.fix}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {observations.length > 0 ? (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-xs uppercase tracking-[0.08em] text-muted">
                  What was on screen ({observations.length} frames)
                </summary>
                <ul className="mt-2 space-y-2">
                  {observations.map((frame) => (
                    <li key={frame.atSeconds} className="text-xs leading-relaxed text-muted">
                      <span className="tabular-nums text-ink">{frame.atSeconds.toFixed(1)}s</span>{' '}
                      {frame.describes}
                      {frame.visibleText.length > 0 ? (
                        <span className="block font-mono text-[11px]">
                          text: {frame.visibleText.join(' | ')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>

          {item.status === 'awaiting_manual_publish' ? (
            <Card className="p-4">
              <SectionTitle hint="this account has no API path">Post this yourself</SectionTitle>
              <ManualPublish
                itemId={item.id}
                platform={item.platform}
                body={item.body}
                hashtags={item.hashtags}
                title={item.title}
                altText={item.alt_text}
                linkUrl={item.final_link_url ?? item.link_url}
                assets={item.preview_urls.map((url, index) => ({
                  id: `${item.id}-${index}`,
                  url,
                  kind: item.format,
                }))}
                onRecord={markManuallyPublished}
              />
            </Card>
          ) : null}

          {item.status === 'approved' || item.status === 'scheduled' ? (
            <Card className="p-4">
              <SectionTitle hint="approving is not the same as sending">Post now</SectionTitle>
              <p className="mb-3 text-sm text-muted">
                {item.scheduled_at
                  ? `Otherwise it goes out at ${formatInOperatorTz(item.scheduled_at, timeZone)}.`
                  : 'This has no slot, so it will not go out on its own.'}
              </p>
              <form action={publishNow}>
                <input type="hidden" name="id" value={item.id} />
                <button className="w-full rounded-lg bg-accent px-2 py-1.5 text-sm font-medium text-white hover:opacity-90">
                  Post it now
                </button>
              </form>
            </Card>
          ) : null}

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
