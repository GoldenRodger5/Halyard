/**
 * §390. Where a room goes deeper.
 *
 * A room's tab row lists its *sections*; this lists its **drill-downs** — the
 * screens that belong to one section rather than to the room. They were reached
 * from the old console's sidebar, which had thirty entries; the studio has
 * seven rooms, so they need a way down from the room they belong to.
 *
 * Without one they are built and linked from nowhere, which is the same defect
 * as an agent nothing calls: reachable only by somebody who already knows the
 * URL, which is nobody. `rooms.test.ts` fails on exactly that.
 */
import Link from 'next/link';

export function Deeper({ links }: { links: Array<{ href: string; label: string }> }) {
  if (links.length === 0) return null;
  return (
    <nav
      aria-label="Deeper in this room"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-rule2 pt-3"
    >
      <span className="font-data text-[9.5px] uppercase tracking-[0.11em] text-quiet">
        Deeper in
      </span>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-[12px] text-quiet underline decoration-rule2 underline-offset-2 transition-colors hover:text-lit"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
