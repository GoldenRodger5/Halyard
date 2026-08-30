'use client';

/**
 * §393. What a monitor shows when the file is not there.
 *
 * A render's `public_url` can point at a file that is gone — expired storage, a
 * dev database carried across a reset, a bucket that never received the object.
 *
 * ## Why the picture is a background and not an `<img>`
 *
 * Because a broken `<img>` draws a broken-image glyph, and nothing turns that
 * off: `alt=""` removes the text and Chrome still paints the icon. Seventeen of
 * them on a wall reads as a broken product rather than as seventeen missing
 * files. A background image that fails to load simply does not paint, and the
 * monitor's own ground shows through — which is what a dead source looks like
 * in a real gallery.
 *
 * ## Why there is still an `<img>`
 *
 * As a **probe**, at zero size, purely so `onError` can tell a missing file
 * apart from a dark one. Without it the two are indistinguishable and the
 * corner label would have to guess. It draws nothing, so it cannot show a
 * glyph.
 */
import { useEffect, useRef, useState } from 'react';

export function MonitorPicture({
  src,
  absent,
}: {
  src: string | undefined;
  /** The corner label when there is no picture at all. */
  absent: string;
}) {
  const [broken, setBroken] = useState(false);
  const probe = useRef<HTMLImageElement>(null);

  /*
   * `onError` alone is not enough on a server-rendered image.
   *
   * The browser requests the picture while parsing the HTML and has already
   * failed it long before React hydrates and attaches a handler, so the event
   * is missed entirely — thirteen missing files went unlabelled while the four
   * with no render at all were labelled, which is the inconsistency this
   * component exists to remove.
   *
   * A finished image with no intrinsic width is a failed one. Checking that on
   * mount catches the ones that failed before anybody was listening; `onError`
   * still catches any that fail after.
   */
  useEffect(() => {
    const img = probe.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, [src]);

  const missing = !src || broken;

  return (
    <>
      {src && !broken ? (
        <span
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${JSON.stringify(src)})` }}
        />
      ) : null}

      {/*
        The probe. One pixel rather than zero — a zero-size image is not
        reliably fetched, so `onError` never fired and a missing file went
        unlabelled while a missing *render* was labelled. Invisible either way,
        so it can never draw a broken-image glyph.
      */}
      {src ? (
        <img
          src={src}
          alt=""
          aria-hidden
          ref={probe}
          onError={() => setBroken(true)}
          className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
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
