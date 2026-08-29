import Link from 'next/link';
import { PostPreview } from '@/components/PostPreview';
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
import {
  getItemArtifact,
  getCorrectionHistory,
  getProducts,
  getQueueItem,
  getTikTokPanel,
} from '@/lib/queries';
import { TikTokPanel } from '@/components/TikTokPanel';
import { formatInOperatorTz } from '@/lib/format';
import { editItem, markManuallyPublished, publishNow, rescheduleItem } from '../actions';
import { resetDestination, setDestination } from '../destinationActions';
import { readDelivery } from '@/components/DeliveryState';

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

  /*
   * §179. TikTok only. Loaded separately because it is one platform out of
   * seven, and every other destination publishes without a per-post panel.
   */
  const tiktokPanel = item.platform === 'tiktok' ? await getTikTokPanel(id) : null;

  /*
   * §165. What Halyard tried before asking anyone to look at this.
   *
   * Empty for an item generated before the correction loop existed, and for one
   * that has not been reviewed yet — both render as nothing rather than as an
   * empty box, because "no corrections were needed" and "the loop never ran"
   * are different things and only the history can tell them apart.
   */
  const iterations = await getCorrectionHistory(id);

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
  const delivery = readDelivery(item);

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
            {/*
              §272. Shown in the platform's own shape rather than as a strip of
              files. A bare `<img>` renders nothing at all for an mp4, so video
              was invisible here — an operator approving a TikTok was approving
              a filename.
            */}
            <PostPreview
              platform={item.platform}
              media={media}
              body={item.body}
              hashtags={item.hashtags ?? []}
              handle={item.account_handle ?? null}
              altText={item.alt_text ?? null}
            />

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

          {tiktokPanel ? <TikTokPanel itemId={id} panel={tiktokPanel} /> : null}

          {/*
            * §156. Where this actually is.
            *
            * The item status says what Halyard thinks; this says what the
            * platform holds, and they are not the same question. A native draft
            * needs a person inside the platform's own app; a private upload
            * needs nobody. Both read `awaiting_manual_publish` here.
            */}
          <Card className="p-4">
            <SectionTitle hint="Halyard's own state is the one that governs approval">
              Delivery
            </SectionTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={delivery.tone}>{delivery.label}</Badge>
              {delivery.creatorActionRequired ? (
                <Badge tone="warn">creator action required</Badge>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{delivery.detail}</p>
            {delivery.externalId ? (
              <p className="mt-2 text-sm text-muted">
                Platform id <code className="rounded bg-sunk px-1">{delivery.externalId}</code>
              </p>
            ) : null}
            {delivery.href ? (
              <a
                href={delivery.href}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-primary underline"
              >
                {delivery.hrefLabel}
              </a>
            ) : null}
            <p className="mt-3 text-sm text-muted">
              Delivering to a platform is not approval and never publishes on its own. Halyard&apos;s
              status for this item is{' '}
              <code className="rounded bg-sunk px-1">{item.status.replace(/_/g, ' ')}</code>.
            </p>
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
          {/* ── what Halyard tried before asking ─────────────────────────
              §165. The operator's first question about a corrected item is not
              "did it pass" — the status says that — but "what was wrong with
              it, and what changed". One line per iteration, in order, with the
              defect that drove each correction. */}
          {iterations.length > 0 ? (
            <Card className="p-4">
              <SectionTitle>Correction history</SectionTitle>
              <ol className="space-y-3">
                {iterations.map((it) => (
                  <li key={it.iteration} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-muted">
                        Version {it.iteration}
                      </span>
                      <span
                        className={
                          it.outcome === 'accepted'
                            ? 'font-mono text-xs text-good'
                            : it.outcome === 'corrected'
                              ? 'font-mono text-xs text-muted'
                              : 'font-mono text-xs text-danger'
                        }
                      >
                        {it.outcome.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* The defects, which are the "because X" half. */}
                    {it.defects.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {it.defects.slice(0, 3).map((d) => (
                          <li key={d.rule} className="text-xs text-muted">
                            <span className="font-mono">{d.rule}</span> — {d.observation}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {/* The correction, which is the "attempted Y" half. */}
                    {it.action ? (
                      <p className="mt-1 text-xs text-ink">
                        → {it.action.replace(/_/g, ' ')}
                        {it.changed.length > 0 ? ` (${it.changed.join(', ')})` : ''}
                      </p>
                    ) : null}

                    {it.regressions.length > 0 ? (
                      <p className="mt-1 text-xs text-danger">
                        {it.regressions.length} regression(s): {it.regressions[0]!.message}
                      </p>
                    ) : null}

                    {Number(it.cost_usd) > 0 ? (
                      <p className="mt-0.5 font-mono text-[11px] text-muted">
                        ${Number(it.cost_usd).toFixed(4)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>

              <p className="mt-3 border-t border-line pt-2 font-mono text-[11px] text-muted">
                total $
                {iterations
                  .reduce((sum, it) => sum + Number(it.cost_usd), 0)
                  .toFixed(4)}
              </p>
            </Card>
          ) : null}

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
                <button className="w-full rounded-lg bg-primary px-2 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
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
