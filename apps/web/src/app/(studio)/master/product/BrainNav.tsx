import Link from 'next/link';

/**
 * The Product Brain sub-navigation.
 *
 * Four tabs rather than the architecture's eighteen headings, because the
 * eighteen are fact *categories* and they are rendered from data by
 * `/brain/[category]` — a nav listing all of them would promise eighteen
 * screens, most of which would be empty for most products.
 */
const TABS = [
  { href: '/master/product', label: 'Overview' },
  { href: '/master/product/features', label: 'Features' },
  { href: '/master/product/evidence', label: 'Evidence' },
  { href: '/master/product/contradictions', label: 'Contradictions' },
];

export function BrainNav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-line pb-3">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={
            tab.href === current
              ? 'rounded-lg bg-sunk px-3 py-1.5 text-sm font-medium text-ink'
              : 'rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink'
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * How sure Halyard is, and why — never a bare colour.
 *
 * A confidence number on its own is the same failure as a quality gate with no
 * measurement: it looks like information. The source count is what makes it
 * one, so the two are always rendered together.
 */
export function FactConfidence({
  status,
  confidence,
  sourceCount,
  stale,
}: {
  status: string;
  confidence: number;
  sourceCount: number;
  stale: boolean;
}) {
  const tone =
    status === 'refuted'
      ? 'text-danger'
      : stale
        ? 'text-warn-ink'
        : status === 'verified'
          ? 'text-good'
          : 'text-muted';

  const label =
    status === 'verified' && stale
      ? 'verified, now stale'
      : status === 'unverifiable'
        ? 'not corroborable'
        : status;

  return (
    <span className={`text-xs ${tone}`}>
      {label} · {confidence.toFixed(2)} · {sourceCount} source{sourceCount === 1 ? '' : 's'}
    </span>
  );
}
