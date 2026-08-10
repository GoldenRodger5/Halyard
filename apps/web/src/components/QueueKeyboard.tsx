'use client';

/**
 * Queue keyboard shortcuts. v1 §8: `j`/`k` navigate, `a` approve, `e` edit,
 * `r` regenerate, `x` reject.
 *
 * Approval happens in spare moments. On a desktop that means never reaching for
 * the mouse; the cards themselves stay plain forms so the same screen works on a
 * phone with no JavaScript at all.
 */
import { useEffect, useState } from 'react';

export function QueueKeyboard({ ids }: { ids: string[] }) {
  const [index, setIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (ids.length === 0) return;

    const focus = (next: number): void => {
      const clamped = Math.max(0, Math.min(ids.length - 1, next));
      setIndex(clamped);
      const card = document.getElementById(`queue-item-${ids[clamped]}`);
      card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      for (const [i, id] of ids.entries()) {
        document.getElementById(`queue-item-${id}`)?.classList.toggle('ring-2', i === clamped);
        document.getElementById(`queue-item-${id}`)?.classList.toggle('ring-primary/40', i === clamped);
      }
    };

    const click = (selector: string): void => {
      const card = document.getElementById(`queue-item-${ids[index]}`);
      (card?.querySelector(selector) as HTMLElement | null)?.click();
    };

    const onKey = (event: KeyboardEvent): void => {
      // Never hijack a key while the operator is editing copy.
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case 'j':
          event.preventDefault();
          focus(index + 1);
          break;
        case 'k':
          event.preventDefault();
          focus(index - 1);
          break;
        case 'a':
          event.preventDefault();
          click('[data-action="approve"]');
          break;
        case 'e': {
          event.preventDefault();
          const card = document.getElementById(`queue-item-${ids[index]}`);
          (card?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
          break;
        }
        case 'r':
          event.preventDefault();
          click('[data-action="regenerate"]');
          break;
        case 'x':
          event.preventDefault();
          click('[data-action="reject"]');
          break;
        case '?':
          setShowHelp((current) => !current);
          break;
        case 'Escape':
          setShowHelp(false);
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids, index]);

  if (ids.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-30 hidden md:block">
      {showHelp ? (
        <div className="mb-2 w-56 rounded-xl border border-line bg-surface p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Shortcuts
          </p>
          <dl className="space-y-1 text-xs">
            {[
              ['j / k', 'next / previous'],
              ['a', 'approve'],
              ['e', 'edit copy'],
              ['r', 'regenerate'],
              ['x', 'reject'],
            ].map(([key, label]) => (
              <div key={key} className="flex justify-between">
                <dt className="font-mono text-ink">{key}</dt>
                <dd className="text-muted">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <button
        onClick={() => setShowHelp((current) => !current)}
        className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-sm hover:text-ink"
      >
        {index + 1} of {ids.length} · press ? for keys
      </button>
    </div>
  );
}
