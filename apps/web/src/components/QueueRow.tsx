/**
 * §362. One line per piece, because a review screen has to be scannable.
 *
 * The queue rendered a full `QueueCard` for every item: the whole body, every
 * QC gate, the preview, the edit form and the regenerate form, inline, for each
 * one. Seventeen items made a page **twenty-five thousand pixels tall**. There
 * is no scroll position in that from which an operator can see what is waiting,
 * and the queue is the screen the entire system exists to fill.
 *
 * ## Why a row rather than a smaller card
 *
 * Triage and inspection are different jobs. Triage needs *comparison* — what is
 * here, which needs attention first, is anything broken — and comparison needs
 * items on one screen at one time. Inspection needs everything about one piece,
 * and `/queue/[id]` already renders exactly that, well, in 587 lines that
 * nobody had a reason to visit because the list had already shown it all.
 *
 * So the row carries what a decision needs and nothing else:
 *
 * - **who and what** — platform, format, and the piece's own first line
 * - **whether it is ready** — renders finished, gates passed, or precisely why
 *   not
 * - **when** — the scheduled slot, in the operator's timezone
 * - **the two decisions** — approve and reject, inline, because approval
 *   happens in spare moments or it does not happen
 *
 * Everything else is one click away and says so. Editing, regenerating,
 * rescheduling, the destination, the TikTok panel and the correction history
 * all live on the detail page, which is where they were always better.
 *
 * ## The preview is still real
 *
 * v1's rule stands: approving a *description* of an asset is not approval. The
 * thumbnail here is the rendered file, and approve is refused while a render is
 * still running or has failed — the same condition `QueueCard` enforces, kept
 * identical rather than re-derived.
 */
import Link from 'next/link';
import { Badge, PLATFORM_LABELS, PlatformDot, cx } from '@halyard/ui';
import type { QueueItem } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import { approveItem, rejectItem } from '@/app/(dashboard)/queue/actions';

const STATUS_TONE: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  pending_approval: 'info',
  approved: 'good',
  scheduled: 'good',
  publishing: 'warn',
  published: 'good',
  awaiting_manual_publish: 'warn',
  failed: 'bad',
  rejected: 'neutral',
  expired: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'waiting on you',
  awaiting_manual_publish: 'at the platform',
};

/**
 * What is standing between this piece and a decision, in one line.
 *
 * Null when nothing is. Returning null rather than "ready" on purpose: a row
 * that says "ready" for every healthy item spends a column on the common case
 * and makes the uncommon one harder to spot.
 */
function blocker(item: QueueItem): string | null {
  /*
   * §362. The recorded reason first, because it is the most specific thing
   * anybody knows about this row. `generate.ts` writes it and nothing read it,
   * so every failed piece showed a red badge and no explanation.
   */
  if (item.failed_because) return item.failed_because;
  if (item.reject_reason) return `Rejected — ${item.reject_reason}`;
  if (item.render_failed > 0) {
    return item.render_error
      ? `A render failed — ${item.render_error.slice(0, 90)}`
      : 'A render failed.';
  }
  if (item.render_total > 0 && item.render_done < item.render_total) {
    return `Rendering, ${item.render_done} of ${item.render_total} done.`;
  }
  const failed = (item.qc_results?.gates ?? []).filter((g) => g.status === 'failed');
  if (failed.length > 0) {
    return `${failed[0]!.gate}: ${failed[0]!.summary}`;
  }
  /*
   * A status of failed with nothing recorded is itself worth saying. It means
   * the failure happened somewhere that did not write a reason, which is a bug
   * to find rather than a row to leave blank.
   */
  if (item.status === 'failed') return 'Failed, and nothing recorded why. Open it to see the run.';
  return null;
}

export function QueueRow({ item, timeZone }: { item: QueueItem; timeZone: string }) {
  const gates = item.qc_results?.gates ?? [];
  const passed = gates.filter((g) => g.status === 'passed').length;
  const rendersRunning =
    item.render_total > 0 && item.render_done < item.render_total && item.render_failed === 0;
  const renderFailed = item.render_failed > 0;
  const canApprove = item.status === 'pending_approval' && !rendersRunning && !renderFailed;
  const why = blocker(item);

  /* The piece's own opening, which is what an operator recognises it by. */
  const opening = (item.title || item.artifact_headline || item.body || '')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <li id={`queue-item-${item.id}`} className="scroll-mt-6">
      <div className="flex items-start gap-3 border-b border-line px-2 py-3 transition-colors hover:bg-sunk/40">
        {/*
          The rendered file, small. Present only when there is one — an absent
          thumbnail is information, and a grey placeholder hides it.
        */}
        {item.preview_urls[0] ? (
          <Link href={`/queue/${item.id}`} className="shrink-0">
            <img
              src={item.preview_urls[0]}
              alt=""
              className="h-16 w-12 rounded border border-line object-cover"
            />
          </Link>
        ) : (
          <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-dashed border-line text-[9px] leading-tight text-muted">
            no
            <br />
            render
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PlatformDot platform={item.platform} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
              {PLATFORM_LABELS[item.platform] ?? item.platform}
            </span>
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              {item.format}
            </span>
            {item.series_name ? (
              <span className="text-[11px] text-muted">{item.series_name}</span>
            ) : null}
            {item.edited_by_human ? (
              <span className="text-[11px] text-muted" title="You edited this">
                edited
              </span>
            ) : null}
            <Badge tone={STATUS_TONE[item.status] ?? 'neutral'}>
              {STATUS_LABEL[item.status] ?? item.status.replace(/_/g, ' ')}
            </Badge>
          </div>

          <Link href={`/queue/${item.id}`} className="mt-1 block">
            <p className="line-clamp-2 text-sm leading-snug text-ink">
              {opening || <span className="text-muted">No text yet.</span>}
            </p>
          </Link>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <span>
              {item.scheduled_at
                ? formatInOperatorTz(item.scheduled_at, timeZone, 'EEE d MMM, HH:mm')
                : 'Unscheduled'}
            </span>
            {gates.length > 0 ? (
              <span className={cx(why ? 'text-warn-ink' : undefined)}>
                {passed}/{gates.length} gates
              </span>
            ) : null}
            {item.requires_ai_label ? <span>AI labelled</span> : null}
          </div>

          {/*
            The blocker, spelled out. This is the whole reason a row can replace
            a card: the card showed every gate so the one that failed was in
            there somewhere, and the row shows only the one that matters.
          */}
          {why ? <p className="mt-1 line-clamp-2 text-[11px] text-warn-ink">{why}</p> : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.status === 'pending_approval' ? (
            <>
              <form action={approveItem}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  disabled={!canApprove}
                  title={
                    canApprove
                      ? 'Approve and schedule'
                      : 'Approving a description of an asset is not approval — this is waiting on its render.'
                  }
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs text-paper transition disabled:opacity-40"
                >
                  Approve
                </button>
              </form>
              {/*
                Reject asks why, and the row asks it here rather than sending
                the operator elsewhere for one sentence.

                `rejectItem` feeds the reason into the voice as a negative
                example, so a one-click reject would quietly drop the only part
                of a rejection that teaches anything. A native <details> keeps
                the row a server component — the platform already has a
                disclosure and reaching for `useState` to reveal one input
                would make the whole queue client-side.
              */}
              <details className="group">
                <summary className="cursor-pointer list-none rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:border-danger hover:text-danger">
                  Reject
                </summary>
                <form action={rejectItem} className="mt-1.5 w-52">
                  <input type="hidden" name="id" value={item.id} />
                  <input
                    name="reason"
                    required
                    placeholder="Why? One line."
                    className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs focus:border-danger focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="mt-1 w-full rounded-lg border border-danger/40 px-3 py-1 text-xs text-danger transition hover:bg-danger/10"
                  >
                    Reject this
                  </button>
                </form>
              </details>
            </>
          ) : null}
          <Link
            href={`/queue/${item.id}`}
            className="px-1 text-[11px] text-primary underline underline-offset-2"
          >
            Open
          </Link>
        </div>
      </div>
    </li>
  );
}
