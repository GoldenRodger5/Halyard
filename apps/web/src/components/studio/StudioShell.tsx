/**
 * §384. The studio shell — one layout, two shapes.
 *
 * The laptop gets a sidebar of seven rooms and a corridor light at the bottom.
 * The phone gets four rooms on a tab bar and the same corridor light as a
 * now-bar above it. Same routes, same components, one breakpoint.
 *
 * ## The corridor light
 *
 * A studio has a lamp outside the door so you know before you open it. This is
 * that lamp, and it is on every screen in the product: one line saying what the
 * floor is doing right now. It is the single most useful piece of chrome here —
 * an operator should never have to navigate somewhere to find out whether the
 * room is working.
 *
 * ## Why the slate lives here
 *
 * Every room's header is identical in structure — number, question, one detail
 * — so it is rendered once by the shell from `ROOMS` rather than by each page.
 * A page that has to remember to render its own header is a page that will
 * eventually render the wrong one.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Slate, Tally, cx } from '@halyard/ui/studio';
import { ROOMS, POCKET_ROOMS, roomFor, tabFor } from './rooms';

export interface FloorState {
  /** True while anything is in production. */
  working: boolean;
  /** Who is up, in the crew's own words. */
  who: string;
  /** What they are doing, in one line. */
  what: string;
}

export interface StudioProduct {
  id: string;
  name: string;
  /** The product's own accent, shown as a chip. The console never takes it. */
  tint: string | null;
}

export function StudioShell({
  pathname,
  children,
  floor,
  products,
  currentProductId,
  counts,
  slateDetail,
}: {
  pathname: string;
  children: ReactNode;
  floor: FloorState;
  products: StudioProduct[];
  currentProductId?: string;
  /** Badges, keyed by room href. */
  counts: Record<string, number>;
  /** The right-hand detail on the slate, when a room has one. */
  slateDetail?: ReactNode;
}) {
  const room = roomFor(pathname) ?? ROOMS[0]!;
  const tab = tabFor(room, pathname);

  const badge = (href: string): number =>
    counts[href] ?? ROOMS.find((r) => r.href === href)?.tabs.reduce((n, t) => n + (counts[t.href] ?? 0), 0) ?? 0;

  const corridor = (
    <>
      <Tally state={floor.working ? 'onair' : 'holding'} size={7} live={floor.working} />
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-[11px] font-semibold text-white">{floor.who}</span>
        {/*
          Two lines and then an ellipsis. A `because` can be a full sentence and
          the corridor light is a glance, not a read — but one truncated line
          says almost nothing, so it gets two.
        */}
        <span className="mt-0.5 block overflow-hidden text-[10px] leading-[1.35] text-dmut [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {floor.what}
        </span>
      </span>
    </>
  );

  return (
    <div className="studio-grain flex min-h-dvh flex-col md:flex-row">
      {/* ── Sidebar · laptop ─────────────────────────────────────── */}
      <aside className="hidden w-[196px] shrink-0 flex-col border-r border-rule bg-gradient-to-b from-white to-sheet2 md:flex">
        <div className="bg-sink px-3.5 py-4 text-white">
          <Link href="/" className="mb-2 flex items-center gap-2">
            <Mark />
            <span className="font-display text-[17px] font-extrabold tracking-[-0.03em]">Halyard</span>
          </Link>
          {/*
            The product switcher. Its chip carries the *product's* colour —
            the one place a product's brand appears in the chrome, because
            this is the control that says which product you are looking at.
          */}
          <div className="flex flex-wrap gap-1.5">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/api/product?id=${p.id}&next=${encodeURIComponent(pathname)}`}
                className={cx(
                  'flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-data text-[9px] tracking-[0.06em]',
                  p.id === currentProductId ? 'bg-white/[0.12] text-white' : 'text-dmut hover:text-white',
                )}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-sm"
                  style={{ background: p.tint ?? 'var(--color-dmut)' }}
                />
                {p.name}
              </Link>
            ))}
          </div>
        </div>

        <nav aria-label="Rooms" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {ROOMS.map((r) => {
            const on = r.href === room.href;
            const n = badge(r.href);
            return (
              <Link
                key={r.href}
                href={r.href}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'flex items-center justify-between rounded-lg px-2.5 py-[7px] text-[13px] transition-colors',
                  on
                    ? 'bg-sink font-semibold text-white shadow-[0_4px_12px_-5px_rgba(15,23,22,0.55)]'
                    : 'text-quiet hover:bg-sink/[0.05]',
                )}
              >
                <span>{r.label}</span>
                {n > 0 ? (
                  <span
                    className={cx(
                      'rounded-[9px] px-1.5 font-data text-[9px]',
                      on ? 'bg-white/20' : 'bg-sink/[0.08]',
                    )}
                  >
                    {n}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/floor/live"
          className="mx-2 mb-3 flex items-start gap-2.5 rounded-lg bg-sink px-3 py-3 text-white"
        >
          {corridor}
        </Link>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className="studio-grid flex min-w-0 flex-1 flex-col pb-[124px] md:pb-0">
        <Slate
          room={`Room ${room.number}`}
          question={`${room.label} — ${room.question}`}
          detail={slateDetail ?? tab?.detail}
        />

        {room.tabs.length > 1 ? (
          <nav
            aria-label={`${room.label} tabs`}
            className="flex flex-none gap-0.5 overflow-x-auto border-b border-rule2 bg-sheet2 px-5 md:px-6"
          >
            {room.tabs.map((t) => {
              const on = t.href === tab?.href;
              const n = counts[t.href] ?? 0;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  title={t.hint}
                  aria-current={on ? 'page' : undefined}
                  className={cx(
                    'whitespace-nowrap border-b-2 px-3 py-2.5 text-[12.5px] transition-colors',
                    on
                      ? 'border-lit font-semibold text-sink'
                      : 'border-transparent text-quiet hover:text-sink',
                  )}
                >
                  {t.label}
                  {n > 0 ? <span className="ml-1.5 font-data text-[9px] text-quiet">{n}</span> : null}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <main className="flex-1 px-5 py-5 md:px-6">{children}</main>
      </div>

      {/* ── Now-bar and tab bar · phone ──────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        {/*
          A scrim under the fixed group. Without it the wall scrolls up to meet
          the now-bar and the two read as one collision — which is the
          "things shouldn't be cut off or blocking" note from the prototype
          review. The gradient makes the bar a layer above the room rather than
          a thing sitting in it. `pb-[124px]` on the main column is what
          guarantees the last row is still reachable.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -top-8 bg-gradient-to-t from-screen via-screen to-transparent"
        />
        <Link
          href="/floor/live"
          className="relative mx-3 mb-2 flex items-center gap-2.5 rounded-2xl bg-sink px-3 py-2.5 text-white shadow-[0_10px_22px_-11px_rgba(15,23,22,0.7)]"
        >
          {corridor}
        </Link>
        <nav
          aria-label="Rooms"
          className="relative flex border-t border-rule bg-white pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5"
        >
          {POCKET_ROOMS.map((r) => {
            const on = r.href === room.href;
            const n = badge(r.href);
            return (
              <Link
                key={r.href}
                href={r.href}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'relative flex flex-1 flex-col items-center gap-1 text-[10px]',
                  on ? 'font-semibold text-sink' : 'text-quiet',
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    'h-[19px] w-[19px] rounded-md border-[1.8px] border-current',
                    on && 'bg-sink',
                  )}
                />
                {r.label}
                {n > 0 ? (
                  <span className="absolute right-[22%] top-0 h-1.5 w-1.5 rounded-full bg-lit" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** The mark: a halyard, and the tally lamp at the foot of it. */
function Mark() {
  return (
    <svg width="19" height="19" viewBox="0 0 30 30" aria-hidden="true">
      <path d="M15 3 L15 27" stroke="var(--color-brass)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M15 6 L24 15 L15 18 Z" fill="var(--color-brass)" />
      <path d="M15 8 L7 16 L15 19 Z" fill="var(--color-brass)" opacity="0.45" />
      <circle cx="15" cy="27" r="2.2" fill="var(--color-tally)" />
    </svg>
  );
}
