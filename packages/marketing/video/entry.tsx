import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { MethodShort, type MethodShortProps } from './MethodShort.js';
import { ScreenShort } from './ScreenShort.js';
import { QuizShort } from './QuizShort.js';
import { RecipeShort } from './RecipeShort.js';
import { AppShort } from './AppShort.js';
import { ListShort } from './ListShort.js';
import { FactCard, QuizDeck, SwapDeck } from './Slides.js';
import { TransformShort } from './TransformShort.js';
import { HistoryShort } from './HistoryShort.js';
import { VersusShort } from './VersusShort.js';

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
  <Composition id="ListShort" component={ListShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 25} defaultProps={{}} />
  <Composition id="HistoryShort" component={HistoryShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 35} defaultProps={{}} />
  <Composition id="VersusShort" component={VersusShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 35} defaultProps={{}} />
  <Composition id="AppShort" component={AppShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 20} defaultProps={{}} />
  {/* Still formats (mk slides / mk image): frame n = slide n. */}
  <Composition id="QuizDeckFeed" component={QuizDeck as unknown as React.FC<Record<string, unknown>>} width={1080} height={1350} fps={30} durationInFrames={30} defaultProps={{ canvas: 'feed', slides: [] }} />
  <Composition id="QuizDeckTall" component={QuizDeck as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30} defaultProps={{ canvas: 'tall', slides: [] }} />
  <Composition id="SwapDeckFeed" component={SwapDeck as unknown as React.FC<Record<string, unknown>>} width={1080} height={1350} fps={30} durationInFrames={30} defaultProps={{ canvas: 'feed', slides: [], footer: '' }} />
  <Composition id="SwapDeckTall" component={SwapDeck as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30} defaultProps={{ canvas: 'tall', slides: [], footer: '' }} />
  <Composition id="FactCard" component={FactCard as unknown as React.FC<Record<string, unknown>>} width={1080} height={1350} fps={30} durationInFrames={1} defaultProps={{ kicker: '', question: '', options: [], myth: false, photo: '', color: '#C1714F', foot: '' }} />
  <Composition id="TransformShort" component={TransformShort as unknown as React.FC<Record<string, unknown>>} width={1080} height={1920} fps={30} durationInFrames={30 * 30} defaultProps={{}} />
  </>
);

registerRoot(Root);
