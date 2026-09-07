'use client';

/**
 * §527. The tab you are on, where you can see it.
 *
 * The room tabs are one horizontally scrolling row. On a laptop all seven fit
 * and nothing is wrong. On a phone the row is 390px wide and the seventh tab
 * starts 161px past the right edge — measured, not estimated — so an operator
 * who opens Master ▸ System lands on a page whose tab row shows *Connections*
 * at the left with no tab marked current anywhere they can see. The page is
 * right and the navigation says they are somewhere else.
 *
 * It scrolled the whole time. `overflow-x-auto` was there from the start, and
 * `whitespace-nowrap` on each tab. What was missing is that nothing ever moved
 * the scroll position to the tab that is actually selected, so the affordance
 * existed and the state it was meant to show did not.
 *
 * Two things fix it, and both are needed:
 *
 * 1. **Scroll the current tab into view.** Done by setting `scrollLeft` on the
 *    nav directly rather than calling `scrollIntoView`, which also scrolls
 *    every ancestor — including the page — and would jump the operator past
 *    the room header on load.
 * 2. **Say that the row continues.** A row that ends flush at the screen edge
 *    reads as finished. A short fade over the right edge, only while there is
 *    something to scroll to, is the standard way to say otherwise without
 *    spending a control on it.
 *
 * A client component for exactly this: the shell is a server component and
 * should stay one, so only the row that needs a layout measurement pays for
 * hydration.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cx } from '@halyard/ui/studio';

export interface RoomTab {
  href: string;
  label: string;
  hint?: string;
}

export function RoomTabs({
  tabs,
  activeHref,
  counts,
  label,
}: {
  tabs: readonly RoomTab[];
  activeHref: string | undefined;
  counts: Record<string, number>;
  label: string;
}) {
  const nav = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);

  /** Whether there is anything to the right the operator cannot see. */
  const measure = useCallback(() => {
    const el = nav.current;
    if (!el) return;
    setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const el = nav.current;
    if (!el) return;

    const current = el.querySelector('[aria-current="page"]');
    if (current) {
      /*
       * Nudged by exactly the overlap, plus a margin so the tab is not flush
       * against the edge it was hiding behind. Not `scrollIntoView`: that
       * scrolls every scrollable ancestor, and the page is one of them.
       */
      const bounds = el.getBoundingClientRect();
      const tab = current.getBoundingClientRect();
      if (tab.left < bounds.left) el.scrollLeft += tab.left - bounds.left - 16;
      else if (tab.right > bounds.right) el.scrollLeft += tab.right - bounds.right + 16;
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, activeHref]);

  return (
    <div className="relative flex-none">
      <nav
        ref={nav}
        onScroll={measure}
        aria-label={`${label} tabs`}
        className="flex gap-0.5 overflow-x-auto border-b border-rule2 bg-sheet2 px-5 [scrollbar-width:none] md:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const on = t.href === activeHref;
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
      {/*
        Decoration only, and it must never eat a tap: the rightmost tab sits
        under this and has to stay pressable.
      */}
      {more ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-sheet2 to-transparent"
        />
      ) : null}
    </div>
  );
}
