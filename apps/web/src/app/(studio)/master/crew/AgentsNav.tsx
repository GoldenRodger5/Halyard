import Link from 'next/link';

/**
 * The Agents sub-navigation, from the architecture's UI target (§19).
 *
 * A plain row of links rather than a component with active-state logic: these
 * are server components and the current path is available to each page, but the
 * nav is identical on every one and duplicating five active-state checks would
 * be five places to get it wrong.
 */
const TABS = [
  { href: '/agents', label: 'Overview' },
  { href: '/agents/runs', label: 'Runs' },
  { href: '/agents/teams', label: 'Teams' },
  { href: '/agents/health', label: 'Health' },
  { href: '/agents/versions', label: 'Versions' },
];

export function AgentsNav({ current }: { current: string }) {
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

const SYSTEM_TABS = [
  { href: '/system', label: 'Health' },
  { href: '/system/jobs', label: 'Jobs' },
  { href: '/system/integrations', label: 'Integrations' },
  { href: '/system/audit', label: 'Audit' },
];

export function SystemNav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-line pb-3">
      {SYSTEM_TABS.map((tab) => (
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
