/**
 * §386. One piece, and the decision it is waiting for.
 *
 * The old `/queue/[id]` had everything and was 620 lines of it, arranged as a
 * form. This is arranged as an *answer*: the thing itself on the left, and on
 * the right the four questions an operator actually asks before deciding —
 * how did it get here, why did it come out this way, what did the gates say,
 * and what do I do about it.
 *
 * ## Program monitor first
 *
 * The rendered file, large, before any prose about it. v1's rule: approving a
 * description of an asset is not approval.
 *
 * ## Nothing is hidden
 *
 * Every capability the old page had is reachable — the overflow, the
 * screenplay, the adjustments and their reasons for being unavailable. §6 of
 * `docs/STUDIO_BUILD_PLAN.md` is the list this was checked against.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adjustmentsFor, type GateStatus } from '@halyard/core';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Action, Chip, Label, Sheet, Tally, cx } from '@halyard/ui/studio';
import { RouteStrip } from '@/components/studio/RouteStrip';
import { AssetPicker } from '@/components/AssetPicker';
import { DeliveryBadge } from '@/components/DeliveryState';
import { ManualPublish } from '@/components/ManualPublish';
import { PieceAccountPanel } from '@/components/PieceAccountPanel';
import { TikTokPanel } from '@/components/TikTokPanel';
import { lampFor, opening } from '@/components/studio/MonitorWall';
import { routeFor } from '@/lib/studio/route';
import { getProducts, getQueueItem, getTikTokPanel } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import {
  adjustItem,
  approveItem,
  markManuallyPublished,
  markOverflowPosted,
  rejectItem,
  retryRender,
} from '@/app/(studio)/gallery/actions';

export const dynamic = 'force-dynamic';

/**
 * The gate marks, per §-gotcha-6: a skip is its own mark, never a tick.
 *
 * Typed against core's `GateStatus` rather than `string`. The first version was
 * keyed `warned`, the gates emit `warning`, and every warning gate therefore
 * fell through to the skipped glyph — a gate that had run and cleared with a
 * note was drawn as one that never ran. Nothing failed; it just quietly said
 * the wrong thing. `Record<GateStatus, …>` makes that a compile error.
 */
const GATE_MARK: Record<GateStatus, { mark: string; tone: string }> = {
  passed: { mark: '✓', tone: 'text-passed' },
  failed: { mark: '✕', tone: 'text-onair' },
  warning: { mark: '!', tone: 'text-lit' },
  skipped: { mark: '·', tone: 'text-quiet' },
};

export default async function GalleryPiece({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getQueueItem(id);
  if (!item) notFound();

  const products = await getProducts();
  const timeZone = products[0]?.operator_timezone ?? 'UTC';

  /*
   * §390. TikTok only, loaded separately. §179's reasoning stands: TikTok is
   * one platform out of seven, and widening `QUEUE_SELECT` would make every
   * list page carry columns only this panel uses.
   */
  const tiktok = item.platform === 'tiktok' ? await getTikTokPanel(item.id) : null;

  const route = routeFor(item);
  const gates = item.qc_results?.gates ?? [];
  const lamp = lampFor(item);
  const picture = item.preview_urls[0];

  const rendering = item.render_total > 0 && item.render_done < item.render_total;
  const renderFailed = item.render_failed > 0;
  const canApprove = item.status === 'pending_approval' && !rendering && !renderFailed;

  /*
   * The shape decides which adjustments are on offer. Read from the piece
   * rather than from its format name, because a "video" with no screenplay has
   * no scenes to reorder whatever it is called.
   */
  const shape = {
    hasScenes: Boolean(item.screenplay?.scenes?.length) || item.format === 'video',
    hasVoice: item.audio_mode !== 'silent',
    hasImage: item.preview_urls.length > 0 || item.attached_asset_ids.length > 0,
  };
  const { available, unavailable } = adjustmentsFor(shape);

  /*
   * What actually ran, and what cleared. A `skipped` gate did not run and must
   * not be counted as either — gotcha 6 — and a `warning` gate did run and did
   * clear, so counting only `passed` understated it.
   */
  const ran = gates.filter((g) => g.status !== 'skipped');
  const cleared = ran.filter((g) => g.status !== 'failed').length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      {/* ── The piece ──────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="overflow-hidden rounded-[11px] border border-rule2 bg-[#0D1413] shadow-[0_12px_26px_-12px_rgba(0,0,0,0.45)]">
          <div
            className={cx(
              'relative min-h-[200px] bg-[#141D1C]',
              renderFailed &&
                'bg-[repeating-linear-gradient(45deg,#1A2422,#1A2422_5px,#141D1C_5px,#141D1C_10px)]',
            )}
          >
            {picture ? (
              /*
                Empty alt, deliberately. A render's URL can point at a file that
                is gone, and the browser renders the alt text as prose across
                the monitor — here that was the alt description laid over the
                headline. The description belongs to the piece and is shown as
                the piece's own field, not as fallback for a missing file.
              */
              <img src={picture} alt="" className="w-full object-cover" style={{ color: 'transparent' }} />
            ) : null}
            {!picture ? (
              <span className="absolute right-3 top-3 font-data text-[8px] uppercase tracking-[0.14em] text-[#5F7975]">
                {renderFailed ? 'not made' : rendering ? 'rendering' : 'no render'}
              </span>
            ) : null}
            <span className="absolute left-3 top-3 flex items-center gap-2 font-data text-[9px] uppercase tracking-[0.16em] text-tally">
              <Tally state={lamp} size={7} live={lamp === 'working'} />
              {item.status.replace(/_/g, ' ')}
              {/*
                What the *platform* holds, which is a different fact from what
                Halyard's status says. §156: a piece can be delivered as a draft
                and still read `awaiting_manual_publish` here.
              */}
              <DeliveryBadge item={item} />
            </span>
            <span className="absolute inset-x-3.5 bottom-3.5 font-display text-[19px] font-extrabold leading-tight tracking-[-0.03em] text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.65)]">
              {opening(item)}
            </span>
          </div>
          <div className="bg-[#101817] px-3.5 py-2.5 text-[11px] text-[#B6C6C2]">
            {PLATFORM_LABELS[item.platform] ?? item.platform} · {item.format}
            {' · '}
            {ran.length > 0
              ? `${cleared} of ${ran.length} gates cleared${
                  gates.length > ran.length ? `, ${gates.length - ran.length} not run` : ''
                }`
              : 'not gated yet'}
            {' · '}
            {item.scheduled_at
              ? formatInOperatorTz(item.scheduled_at, timeZone, 'EEE d MMM, HH:mm')
              : 'unscheduled'}
            {item.audio_mode === 'silent' ? (
              <span className="text-[#E8A48F]"> · silent</span>
            ) : null}
          </div>
        </div>

        <Sheet>
          <Label>The copy</Label>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{item.body}</p>
          {item.hashtags.length > 0 ? (
            <p className="mt-2 text-xs text-quiet">{item.hashtags.map((h) => `#${h}`).join(' ')}</p>
          ) : null}
          {item.final_link_url ? (
            <p className="mt-2 break-all font-data text-[11px] text-quiet">{item.final_link_url}</p>
          ) : null}
          {item.alt_text ? (
            <p className="mt-2.5 border-t border-rule2 pt-2.5 text-[11.5px] leading-relaxed text-quiet">
              <span className="font-data text-[9px] uppercase tracking-[0.1em]">Alt text</span>{' '}
              {item.alt_text}
            </p>
          ) : null}
        </Sheet>

        {/*
          §380. The overflow. There is deliberately no `reply()` on the adapter
          — Halyard drafts and a person sends — so this is the person saying
          they sent it, which is the only way that column can ever be true.
        */}
        {item.overflow_body ? (
          <Sheet tone="lit">
            <Label>
              The rest of it — post {item.overflow_home ? `as ${item.overflow_home}` : 'as the first comment'}
            </Label>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{item.overflow_body}</p>
            {item.overflow_posted_at ? (
              <p className="mt-2.5 text-xs text-quiet">
                You marked this posted{' '}
                {formatInOperatorTz(item.overflow_posted_at, timeZone, 'd MMM, HH:mm')}.
              </p>
            ) : (
              <form action={markOverflowPosted} className="mt-2.5">
                <input type="hidden" name="id" value={item.id} />
                <Action tone="ghost" small>I posted it</Action>
              </form>
            )}
          </Sheet>
        ) : null}

        {item.screenplay?.scenes?.length ? (
          <Sheet>
            <Label>What it was staged as</Label>
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap font-data text-[10.5px] leading-relaxed text-quiet">
              {item.screenplay.scenes
                .map((s, i) => {
                  /*
                    The screenplay as a person reads it, not as the renderer
                    consumes it. `direction` exists for exactly this — §345.
                  */
                  const lines = [`SCENE ${i + 1} · ${s.role} · ${s.seconds}s`];
                  if (s.onScreen.length) lines.push(`  ON SCREEN  ${s.onScreen.join(' / ')}`);
                  if (s.spoken) lines.push(`  SPOKEN     ${s.spoken}`);
                  if (s.groundSubject) lines.push(`  GROUND     ${s.groundSubject}`);
                  else if (s.ground) lines.push(`  GROUND     ${s.ground}`);
                  if (s.move) lines.push(`  MOVE       ${s.move}`);
                  return lines.join('\n');
                })
                .join('\n')}
            </pre>
          </Sheet>
        ) : null}

        {/*
          §390. The three panels the old queue carried and this page did not.
          Each is a capability, not a decoration: TikTok's API refuses a direct
          post without its options, an asset cannot be attached anywhere else,
          and a piece delivered as a draft is finished by a person.
        */}
        {tiktok ? (
          <Sheet>
            <Label>TikTok</Label>
            <TikTokPanel itemId={item.id} panel={tiktok} />
          </Sheet>
        ) : null}

        {item.status === 'awaiting_manual_publish' ? (
          <Sheet tone="lit">
            <Label>Finish it by hand</Label>
            <ManualPublish
              itemId={item.id}
              platform={item.platform}
              body={item.body}
              hashtags={item.hashtags}
              title={item.title}
              altText={item.alt_text}
              linkUrl={item.final_link_url}
              assets={item.preview_urls.map((url, i) => ({
                id: `${item.id}-${i}`,
                url,
                kind: 'render',
              }))}
              onRecord={markManuallyPublished}
            />
          </Sheet>
        ) : null}

        <Sheet>
          <Label>Media attached to this piece</Label>
          <AssetPicker
            contentItemId={item.id}
            productId={item.product_id}
            attachedIds={item.attached_asset_ids}
            usableFor={item.format}
          />
        </Sheet>

        <Sheet>
          <Label>Which account, and why</Label>
          <PieceAccountPanel contentItemId={item.id} />
        </Sheet>
      </div>

      {/* ── The decision ───────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-3.5">
        <Sheet>
          <Label>How it got here</Label>
          <RouteStrip route={route} />
        </Sheet>

        <Sheet>
          <Label>Gates</Label>
          {gates.length === 0 ? (
            <p className="text-xs leading-relaxed text-quiet">
              Nothing has been checked yet. That is not the same as passing — this piece cannot
              be approved until the gates have run.
            </p>
          ) : (
            <div className="font-data text-[11px] leading-[1.9]">
              {gates.map((g) => {
                const m = GATE_MARK[g.status as GateStatus] ?? GATE_MARK.skipped;
                return (
                  /*
                    `w-16` fitted every gate name until `destination`, which
                    ran into its own summary. Sized to the longest name the
                    system has rather than to the ones that happened to be on
                    screen.
                  */
                  <div key={g.gate} className="flex items-start gap-2">
                    <span className={cx('w-2 shrink-0', m.tone)}>{m.mark}</span>
                    <span className="w-[84px] shrink-0">{g.gate}</span>
                    <span className="min-w-0 flex-1 leading-snug text-quiet">{g.summary}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Sheet>

        <Sheet>
          <Label>Ask for a change</Label>
          <form action={adjustItem} className="flex flex-col gap-2.5">
            <input type="hidden" name="id" value={item.id} />
            <input
              name="note"
              placeholder="Why? It is a photo of flour and this is about bread."
              className="w-full rounded-[7px] border border-rule2 bg-sheet px-2.5 py-2 text-xs outline-none focus:border-lit"
            />
            <div className="flex flex-wrap gap-1.5">
              {available.map((a) => (
                <button
                  key={a.id}
                  name="adjustment"
                  value={a.id}
                  className="rounded-[7px] border border-rule2 bg-sheet px-2.5 py-1 text-xs text-quiet transition-colors hover:border-sink hover:text-sink"
                >
                  {a.label}
                </button>
              ))}
              {unavailable.map(({ adjustment, because }) => (
                <Chip key={adjustment.id} unavailable reason={because}>
                  {adjustment.label}
                </Chip>
              ))}
            </div>
          </form>
          {unavailable.length > 0 ? (
            <p className="mt-2 text-[11px] text-quiet">
              {unavailable.length} more that this piece cannot take — {unavailable[0]!.because.toLowerCase()}
            </p>
          ) : null}
        </Sheet>

        {renderFailed ? (
          <Sheet tone="onair">
            <Label>A render failed</Label>
            <p className="text-xs leading-relaxed text-quiet">
              {item.render_error ?? 'Nothing recorded why, which is itself worth finding.'}
            </p>
            <form action={retryRender} className="mt-2.5">
              <input type="hidden" name="id" value={item.id} />
              <Action tone="ghost" small>Try the render again</Action>
            </form>
          </Sheet>
        ) : null}

        {item.status === 'pending_approval' ? (
          <>
            <div className="flex gap-2">
              <form action={approveItem} className="flex-1">
                <input type="hidden" name="id" value={item.id} />
                <Action
                  tone="brass"
                  full
                  disabled={!canApprove}
                  title={
                    canApprove
                      ? 'Approve and schedule'
                      : 'Approving a description of an asset is not approval — this is waiting on its render.'
                  }
                >
                  Approve
                </Action>
              </form>
            </div>
            {/*
              §6: rejecting asks why, and the reason trains the voice. A
              one-click send-back drops the only part that teaches.
            */}
            <form action={rejectItem} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={item.id} />
              <input
                name="reason"
                required
                placeholder="Why is it going back? This is what teaches the voice."
                className="w-full rounded-[7px] border border-rule2 bg-sheet px-2.5 py-2 text-xs outline-none focus:border-lit"
              />
              <Action tone="ghost" full>Send it back</Action>
            </form>
          </>
        ) : null}

        <Link
          href="/gallery"
          className={cx(
            'rounded-lg border border-rule2 px-3.5 py-[7px] text-center text-xs text-quiet',
            'transition-colors hover:border-sink hover:text-sink',
          )}
        >
          ← Back to the wall
        </Link>
      </div>
    </div>
  );
}
