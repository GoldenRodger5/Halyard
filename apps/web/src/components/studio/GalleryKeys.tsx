'use client';

/**
 * §386. Moving along the wall without the mouse.
 *
 * The old queue bound `a` to approve, because a row carried an approve button.
 * A monitor does not — approving happens on the piece, where the render and the
 * gates are visible, which is the rule this product has held since v1: you do
 * not approve a description of an asset. So the wall binds only what the wall
 * can do, and the slate says exactly that. A shortcut advertised and not wired
 * is the same defect as a payload key nobody reads.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function GalleryKeys({ ids }: { ids: string[] }) {
  const [index, setIndex] = useState(0);
  const router = useRouter();
  /* Kept in a ref so the listener is bound once and never sees a stale index. */
  const at = useRef(0);

  useEffect(() => {
    if (ids.length === 0) return;

    const monitors = (): HTMLElement[] =>
      ids.map((id) => document.querySelector<HTMLElement>(`a[href="/gallery/${id}"]`)!).filter(Boolean);

    const focus = (next: number): void => {
      const clamped = Math.max(0, Math.min(ids.length - 1, next));
      at.current = clamped;
      setIndex(clamped);
      const el = monitors()[clamped];
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      /*
       * Four across on a laptop, so `j`/`k` step one and the arrows step a row.
       * The grid is responsive, which means the row width is a guess here — the
       * arrows are a convenience, and `j`/`k` are the contract.
       */
      switch (event.key) {
        case 'j': case 'ArrowRight': event.preventDefault(); focus(at.current + 1); break;
        case 'k': case 'ArrowLeft': event.preventDefault(); focus(at.current - 1); break;
        case 'ArrowDown': event.preventDefault(); focus(at.current + 4); break;
        case 'ArrowUp': event.preventDefault(); focus(at.current - 4); break;
        case 'Enter':
          if (target?.tagName === 'A') return; // the browser is already doing it
          event.preventDefault();
          router.push(`/gallery/${ids[at.current]}`);
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids, router]);

  void index;
  return null;
}
