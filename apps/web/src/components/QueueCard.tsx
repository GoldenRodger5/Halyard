/**
 * The queue card. v1 §8 card anatomy, with the QC block from v2 F.5.
 *
 * Requirements this satisfies:
 *   · previews are real rendered PNGs, not descriptions
 *   · the QC result is visible before approval, so approval is informed
 *   · a render still running disables Approve; a failed render offers Retry
 *   · edit is inline, regenerate asks for a note
 */
import Link from 'next/link';
import {
  Badge,
  Card,
  GateLine,
  PLATFORM_LABELS,
  PlatformDot,
  cx,
} from '@halyard/ui';
import type { QueueItem } from '@/lib/queries';
import { formatInOperatorTz } from '@/lib/format';
import {
  approveItem,
  editItem,
  regenerateItem,
  rejectItem,
  retryRender,
} from '@/app/(dashboard)/queue/actions';

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

export function QueueCard({ item, timeZone }: { item: QueueItem; timeZone: string }) {
  const gates = item.qc_results?.gates ?? [];
  const rendersRunning = item.render_total > 0 && item.render_done < item.render_total && item.render_failed === 0;
  const renderFailed = item.render_failed > 0;
  const canApprove = item.status === 'pending_approval' && !rendersRunning && !renderFailed;

  return (
    <li id={`queue-item-${item.id}`} className="scroll-mt-6">
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-sunk/40 px-4 py-2.5">
        <PlatformDot platform={item.platform} />
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ink">
          {PLATFORM_LABELS[item.platform] ?? item.platform}
        </span>
        <span className="text-xs uppercase tracking-[0.1em] text-muted">{item.persona}</span>
        <span className="text-xs uppercase tracking-[0.1em] text-muted">{item.format}</span>
        {item.series_name ? (
          <Badge tone="neutral">
            {item.series_name}
            {item.sequence_number ? ` #${item.sequence_number}` : ''}
          </Badge>
        ) : null}
        {item.requires_ai_label ? <Badge tone="warn">AI label</Badge> : null}
        {item.edited_by_human ? <Badge tone="neutral">edited</Badge> : null}
        <span className="ml-auto text-xs text-muted">
          {item.scheduled_at ? formatInOperatorTz(item.scheduled_at, timeZone) : 'unscheduled'}
        </span>
        <Badge tone={STATUS_TONE[item.status] ?? 'neutral'}>{item.status.replace(/_/g, ' ')}</Badge>
      </header>

      <div className="space-y-4 p-4">
        {/* Previews are the actual rendered files. Approving a description of an
            asset is not approval. */}
        {item.render_total > 0 ? (
          renderFailed ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
              <p className="text-sm font-medium text-danger">Render failed</p>
              <p className="mt-1 font-mono text-xs leading-relaxed text-danger/80">
                {item.render_error ?? 'No error recorded.'}
              </p>
              <form action={retryRender} className="mt-2">
                <input type="hidden" name="id" value={item.id} />
                <button className="rounded-lg border border-danger/40 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10">
                  Retry render
                </button>
              </form>
            </div>
          ) : rendersRunning ? (
            <div className="flex gap-2">
              {Array.from({ length: item.render_total }).map((_, i) => (
                <div key={i} className="h-24 w-20 animate-pulse rounded-md bg-sunk" />
              ))}
              <p className="self-center text-xs text-muted">
                Rendering {item.render_done} of {item.render_total}
              </p>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {item.preview_urls.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={item.alt_text ?? `Slide ${i + 1}`}
                  className="h-32 w-auto shrink-0 rounded-md border border-line bg-surface object-cover"
                />
              ))}
            </div>
          )
        ) : null}

        <form action={editItem} className="space-y-2">
          <input type="hidden" name="id" value={item.id} />
          <textarea
            name="body"
            defaultValue={item.body}
            rows={Math.min(8, Math.max(3, Math.ceil(item.body.length / 70)))}
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink focus:border-primary focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted">
              {item.hashtags.length > 0 ? item.hashtags.map((h) => `#${h}`).join(' ') : 'no hashtags'}
            </div>
            <button className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:bg-sunk hover:text-ink">
              Save edit
            </button>
          </div>
        </form>

        {item.final_link_url || item.link_url ? (
          <p className="truncate font-mono text-xs text-muted">
            {item.final_link_url ?? `${item.link_url} (UTM stamped at schedule time)`}
          </p>
        ) : null}

        {item.artifact_headline ? (
          <p className="text-xs text-muted">
            From: <span className="text-ink">{item.artifact_headline}</span> — a real adaptation
          </p>
        ) : (
          <p className="text-xs text-muted">No product artifact behind this item.</p>
        )}

        {/* v2 F.5 — the queue shows its work. */}
        <div className="space-y-1 rounded-lg bg-sunk/50 p-3">
          {gates.length === 0 ? (
            <p className="font-mono text-xs text-muted">QC has not run on this item.</p>
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
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-sunk/30 px-4 py-2.5">
        <form action={approveItem}>
          <input type="hidden" name="id" value={item.id} />
          <button
            disabled={!canApprove}
            className={cx(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              canApprove
                ? 'bg-primary text-white hover:bg-primary-dark'
                : 'cursor-not-allowed bg-sunk text-muted',
            )}
            data-action="approve"
            title={
              rendersRunning
                ? 'Waiting on renders. Approving media you have not seen is not approval.'
                : undefined
            }
          >
            Approve
          </button>
        </form>

        <details className="relative">
          <summary
            data-action="regenerate"
            className="cursor-pointer list-none rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
          >
            Regenerate
          </summary>
          <form
            action={regenerateItem}
            className="absolute z-10 mt-2 w-72 rounded-lg border border-line bg-surface p-3 shadow-lg"
          >
            <input type="hidden" name="id" value={item.id} />
            <label className="text-xs text-muted">
              What was wrong? Blind retry is a wasted call.
              <input
                name="note"
                placeholder="less salesy, lead with the failure"
                className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm"
              />
            </label>
            <button className="mt-2 w-full rounded-md bg-primary px-2 py-1.5 text-sm font-medium text-white">
              Regenerate
            </button>
          </form>
        </details>

        <details className="relative">
          <summary
            data-action="reject"
            className="cursor-pointer list-none rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
          >
            Reject
          </summary>
          <form
            action={rejectItem}
            className="absolute z-10 mt-2 w-72 rounded-lg border border-line bg-surface p-3 shadow-lg"
          >
            <input type="hidden" name="id" value={item.id} />
            <label className="text-xs text-muted">
              Why, in one line. This becomes a negative example.
              <input
                name="reason"
                placeholder="reads like an ad"
                className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-sm"
              />
            </label>
            <button className="mt-2 w-full rounded-md border border-danger/40 px-2 py-1.5 text-sm font-medium text-danger">
              Reject
            </button>
          </form>
        </details>

        <Link
          href={`/queue/${item.id}`}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
        >
          Open
        </Link>
      </footer>
    </Card>
    </li>
  );
}
