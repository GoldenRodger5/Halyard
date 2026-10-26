import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { MethodShort, type MethodShortProps } from './MethodShort.js';
import { ScreenShort } from './ScreenShort.js';

const Root: React.FC = () => (
  <>
  <Composition
    id="ScreenShort"
    component={ScreenShort as unknown as React.FC<Record<string, unknown>>}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30 * 47}
    defaultProps={{ shots: [], heads: [], hook: { kicker: '', text: '' }, close: { kicker: '', text: '' }, captions: [], audio: null, photo: '', photoLabel: '', screenLabel: '', data: { from: 4, to: 6 } }}
  />
  <Composition
    id="MethodShort"
    component={MethodShort as unknown as React.FC<Record<string, unknown>>}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30 * 38}
    defaultProps={{ beats: [], captions: [], audio: null, clips: [], photo: null, photoLabel: '', provenance: '', data: { from: 4, to: 6, amountBefore: '', amountAfter: '', amountLabel: '', broil: '', checkAt: '' } } satisfies MethodShortProps}
  />
  </>
);

registerRoot(Root);
