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
 */
import React, { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

export const FONT_FACE_CSS = `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('${'FONT_INTER_REGULAR'}') format('woff');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: block;
  src: url('${'FONT_INTER_SEMIBOLD'}') format('woff');
}
@font-face {
  font-family: 'Instrument Serif';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('${'FONT_INSTRUMENT_SERIF'}') format('truetype');
}
`;

function css(): string {
  return FONT_FACE_CSS.replace('FONT_INTER_REGULAR', staticFile('fonts/Inter-Regular.woff'))
    .replace('FONT_INTER_SEMIBOLD', staticFile('fonts/Inter-SemiBold.woff'))
    .replace('FONT_INSTRUMENT_SERIF', staticFile('fonts/InstrumentSerif-Regular.ttf'));
}

/**
 * Mount once per composition. Blocks rendering until both families have loaded,
 * so the first frame is already on-brand.
 */
export const Fonts: React.FC = () => {
  const [handle] = useState(() => delayRender('loading brand fonts'));

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        await Promise.all([
          document.fonts.load('400 64px "Instrument Serif"'),
          document.fonts.load('400 40px "Inter"'),
          document.fonts.load('600 40px "Inter"'),
        ]);
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
