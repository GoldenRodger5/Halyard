import { Badge, Card, EmptyState, PageHeader } from '@halyard/ui';
import { HOOK_TYPE_GUIDE, HOOK_TYPES } from '@halyard/core';
import { query } from '@/lib/db';
import { addSwipeEntry, removeSwipeEntry } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The swipe file. Milestone 27, Part F and I.7.
 *
 * Taste is transferable to a model, but only if it is written down. An entry
 * here becomes two things: a few-shot example matched on format and category,
 * and a hook *pattern* — the shape, not the literal text — in the hook library.
 */
export default async function SwipePage() {
  const entries = await query<{
    id: string;
    url: string | null;
    platform: string | null;
    format: string | null;
    category: string | null;
    why_it_works: string;
    hook_text: string | null;
    hook_type: string | null;
    author_handle: string | null;
    tags: string[];
    added_at: string;
  }>(
    `select id, url, platform, format, category, why_it_works, hook_text, hook_type,
            author_handle, tags, added_at
       from references_swipe order by added_at desc limit 60`,
  );

  const byType = new Map<string, number>();
  for (const entry of entries) {
    if (entry.hook_type) byType.set(entry.hook_type, (byType.get(entry.hook_type) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Swipe file"
        subtitle="Save what works and say why in one line. The copywriter receives three to five matching entries as few-shot examples, and the hook is extracted as a pattern rather than as text — so your taste enters the system as structure."
      />

      <Card className="mb-6 p-5">
        <form action={addSwipeEntry} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs uppercase tracking-[0.1em] text-muted">
              URL or handle
              <input
                name="url"
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.1em] text-muted">
              The hook, verbatim
              <input
                name="hookText"
                placeholder="Your gluten-free bread is gummy"
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs uppercase tracking-[0.1em] text-muted">
              Platform
              <select name="platform" className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm">
                {['instagram', 'tiktok', 'x', 'youtube', 'pinterest', 'threads', 'bluesky'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="text-xs uppercase tracking-[0.1em] text-muted">
              Format
              <select name="format" className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm">
                {['carousel', 'single', 'reel_script', 'script', 'insight', 'thread', 'pin', 'short'].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="text-xs uppercase tracking-[0.1em] text-muted">
              Category
              <select name="category" className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-sm">
                {['transformation', 'education', 'community', 'product', 'founder_insight'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs uppercase tracking-[0.1em] text-muted">
            Why it works — one line, and this is the part that matters
            <input
              name="whyItWorks"
              required
              placeholder="names the failure before offering the fix"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>

          <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Save to the swipe file
          </button>
        </form>
      </Card>

      <Card className="mb-6 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Hook types in your file
        </p>
        <div className="flex flex-wrap gap-2">
          {HOOK_TYPES.map((type) => (
            <Badge key={type} tone={byType.get(type) ? 'info' : 'neutral'} className="lowercase">
              {type.replace(/_/g, ' ')} {byType.get(type) ?? 0}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          A gap here is a gap in what the copywriter can imitate.{' '}
          {[...HOOK_TYPES].filter((t) => !byType.get(t)).length > 0
            ? `Nothing saved yet for ${[...HOOK_TYPES].filter((t) => !byType.get(t)).slice(0, 3).map((t) => HOOK_TYPE_GUIDE[t].shape.toLowerCase()).join(', ')}.`
            : 'Every type has at least one example.'}
        </p>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          body="Fifteen posts with one line each on why they work is enough to change what the copywriter produces. It is the cheapest quality improvement available."
        />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <Card as="li" key={entry.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {entry.platform ? <Badge tone="neutral">{entry.platform}</Badge> : null}
                {entry.format ? <Badge tone="neutral">{entry.format}</Badge> : null}
                {entry.category ? <Badge tone="neutral">{entry.category}</Badge> : null}
                {entry.hook_type ? <Badge tone="info">{entry.hook_type.replace(/_/g, ' ')}</Badge> : null}
                {entry.author_handle ? (
                  <span className="text-xs text-muted">{entry.author_handle}</span>
                ) : null}
              </div>

              {entry.hook_text ? (
                <p className="font-serif text-xl leading-snug text-ink">{entry.hook_text}</p>
              ) : null}

              <p className="mt-1 text-sm italic text-muted">{entry.why_it_works}</p>

              <div className="mt-2 flex items-center gap-3">
                {entry.url ? (
                  <a href={entry.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                    Open
                  </a>
                ) : null}
                <form action={removeSwipeEntry}>
                  <input type="hidden" name="id" value={entry.id} />
                  <button className="text-xs text-muted hover:text-danger">Remove</button>
                </form>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
