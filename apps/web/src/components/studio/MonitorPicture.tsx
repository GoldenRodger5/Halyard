'use client';

/**
 * §391. What a monitor shows when the file is not there.
 *
 * A render's `public_url` can point at a file that is gone — expired storage, a
 * dev database carried across a reset, a bucket that never got the object. The
 * browser's answer is an empty box, which is indistinguishable from a piece
 * that was never rendered at all.
 *
 * On the wall that produced two states meaning the same thing and looking
 * different: pieces with no URL showed **no render**, and pieces with a *broken*
 * URL showed nothing. Same fact, two appearances, and the second one silently.
 *
 * Client-side because `onError` is the only way to learn a file is missing —
 * the server has a URL and no way to know whether it resolves without fetching
 * every one of them, which is seventeen requests to render a list.
 */
import { useState } from 'react';
import { cx } from '@halyard/ui/studio';

export function MonitorPicture({
  src,
  className,
  /** Shown in the corner when there is nothing to show. */
  absent,
}: {
  src: string | undefined;
  className?: string;
  absent: string;
}) {
  const [broken, setBroken] = useState(false);
  const missing = !src || broken;

  return (
    <>
      {src && !broken ? (
        <img
          src={src}
          alt=""
          onError={() => setBroken(true)}
          className={cx('h-full w-full object-cover', className)}
          style={{ color: 'transparent' }}
        />
      ) : null}
      {missing ? (
        <span
          className="absolute right-2 top-2 font-data text-[7.5px] uppercase tracking-[0.12em] text-[#5F7975]"
          title={broken ? 'The render exists in the database; the file is not there.' : undefined}
        >
          {broken ? 'file missing' : absent}
        </span>
      ) : null}
    </>
  );
}
