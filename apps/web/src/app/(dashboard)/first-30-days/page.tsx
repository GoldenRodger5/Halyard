import Link from 'next/link';
import { Badge, Card, PageHeader } from '@halyard/ui';
import { FIRST_THIRTY_DAYS, currentPhase } from '@halyard/core';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The first thirty days. Milestone 51.
 *
 * Not a tutorial overlay and not a checklist that nags. A page you read once,
 * and come back to when something looks wrong so you can find out whether it is.
 *
 * Most of what it does is set expectations about *absence*: empty charts, blank
 * predictions, platforms sitting in draft_only for weeks. Every one of those is
 * correct behaviour that looks like breakage, and somebody who does not know
 * that will go looking for the bug.
 */
export default async function FirstThirtyDaysPage() {
  const first = await one<{ first_at: string | null; posts: string }>(
    `select min(published_at) as first_at, count(*) as posts
       from content_items where status = 'published'`,
  );

  const daysSinceFirstPost = first?.first_at
    ? Math.max(0, Math.floor((Date.now() - new Date(first.first_at).getTime()) / 86_400_000))
    : null;
  const phase = currentPhase(daysSinceFirstPost);

  return (
    <>
      <PageHeader
        title="The first thirty days"
        subtitle="What happens, what you have to do, and which of the things that look broken are not."
      />

      <Card className="mb-8 p-4">
        <p className="text-sm leading-relaxed text-ink">
          {daysSinceFirstPost === null
            ? 'Nothing has published yet, so you are at the start of this. Everything below is ahead of you.'
            : `First post was ${daysSinceFirstPost} day${daysSinceFirstPost === 1 ? '' : 's'} ago. The highlighted section is where you are.`}
        </p>
      </Card>

      <div className="space-y-6">
        {FIRST_THIRTY_DAYS.map((entry, index) => (
          <Card
            key={entry.title}
            className={`p-5 ${index === phase ? 'border-primary/40 bg-primary/5' : ''}`}
          >
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-serif text-xl text-ink">{entry.title}</h2>
              <span className="text-sm text-muted">{entry.when}</span>
              {index === phase ? <Badge tone="info">you are here</Badge> : null}
            </div>

            <div className="mt-4 grid gap-6 lg:grid-cols-3">
              <Section title="What Halyard does" items={entry.happening} />
              <Section
                title="What you do"
                items={entry.yours.length > 0 ? entry.yours : ['Nothing. This part runs itself.']}
              />
              <Section title="What looks wrong but is not" items={entry.expected} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
              {entry.screens.map((screen) => (
                <Link
                  key={screen.href}
                  href={screen.href}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
                >
                  {screen.label}
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
        Every threshold on this page is read from the code that enforces it, so it cannot drift out
        of step with what the system actually does.
      </p>
    </>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <h3 className="text-[11px] uppercase tracking-[0.08em] text-muted">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-sm leading-relaxed text-ink">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
