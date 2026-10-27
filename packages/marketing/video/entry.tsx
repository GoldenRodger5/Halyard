import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { MethodShort, type MethodShortProps } from './MethodShort.js';
import { ScreenShort } from './ScreenShort.js';
import { QuizShort } from './QuizShort.js';
import { RecipeShort } from './RecipeShort.js';
import { AppShort } from './AppShort.js';
import { TransformShort } from './TransformShort.js';

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
  <Composition id="QuizShort" component={QuizShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 20} defaultProps={{ label: '', questions: [], close: { start: 0, headline: '', product: '', audio: null, photo: '' }, sfx: null }} />
  <Composition id="RecipeShort" component={RecipeShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 30} defaultProps={{}} />
  <Composition id="AppShort" component={AppShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 20} defaultProps={{}} />
  <Composition id="TransformShort" component={TransformShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 30} defaultProps={{}} />
  </>
);

registerRoot(Root);
