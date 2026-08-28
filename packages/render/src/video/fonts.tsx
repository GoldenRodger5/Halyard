/**
 * Fonts inside Remotion.
 *
 * Without this, every composition renders in the browser's default serif — the
 * brand typography is simply absent, and the first render made that obvious.
 *
 * The faces are served from the bundle's public directory rather than fetched
 * from Google, so a render works offline and cannot be changed underneath us by
 * a CDN. `delayRender` holds the first frame until the faces are actually ready;
 * without it, frame 0 captures a fallback face and the video opens on the wrong
 * type for a beat.
 *
 * §226. Five more families, all SIL OFL — see `assets/fonts/PROVENANCE.md`.
 * Variable faces, so one file covers a weight range and a typography system can
 * ask for 800 without another download. Every family here must also appear in
 * `AVAILABLE_FAMILIES` in `@halyard/core`: a system naming a face that is not
 * bundled renders in a fallback and silently loses its identity, which is
 * exactly how §224's 700-weight serif quietly became a 400.
 */
import React, { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

interface BundledFace {
  family: string;
  file: string;
  format: 'woff' | 'truetype';
  /** A variable face declares its range; a static one its single weight. */
  weight: string;
}

export const BUNDLED_FACES: BundledFace[] = [
  { family: 'Inter', file: 'fonts/Inter-Regular.woff', format: 'woff', weight: '400' },
  { family: 'Inter', file: 'fonts/Inter-SemiBold.woff', format: 'woff', weight: '600' },
  {
    family: 'Instrument Serif',
    file: 'fonts/InstrumentSerif-Regular.ttf',
    format: 'truetype',
    weight: '400',
  },
  { family: 'Archivo', file: 'fonts/Archivo-Variable.ttf', format: 'truetype', weight: '100 900' },
  { family: 'Fraunces', file: 'fonts/Fraunces-Variable.ttf', format: 'truetype', weight: '100 900' },
  {
    family: 'Bricolage Grotesque',
    file: 'fonts/Bricolage-Variable.ttf',
    format: 'truetype',
    weight: '200 800',
  },
  { family: 'Sora', file: 'fonts/Sora-Variable.ttf', format: 'truetype', weight: '100 800' },
  { family: 'DM Sans', file: 'fonts/DMSans-Variable.ttf', format: 'truetype', weight: '100 1000' },
];

function css(): string {
  return BUNDLED_FACES.map(
    (f) => `@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: block;
  src: url('${staticFile(f.file)}') format('${f.format}');
}`,
  ).join('\n');
}

/**
 * Mount once per composition. Blocks rendering until the faces have loaded, so
 * the first frame is already on-brand.
 *
 * Every bundled face is loaded rather than only the ones this piece uses:
 * which system a piece uses is decided per render, and a face that arrives one
 * frame late is a frame in the wrong type — the specific bug `delayRender` is
 * here to prevent.
 */
export const Fonts: React.FC = () => {
  const [handle] = useState(() => delayRender('loading brand fonts'));

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        await Promise.all(
          BUNDLED_FACES.map((f) =>
            document.fonts.load(`${f.weight.split(' ')[0]} 64px "${f.family}"`),
          ),
        );
        await document.fonts.ready;
      } finally {
        if (!cancelled) continueRender(handle);
      }
    };

    void load();
    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [handle]);

  return <style dangerouslySetInnerHTML={{ __html: css() }} />;
};
