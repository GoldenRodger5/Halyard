import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Composition, cancelRender, continueRender, delayRender, registerRoot, staticFile} from 'remotion';
import {YolkGame} from './egg/YolkGame.js';
import {PopcornStory, POPCORN_DURATION} from './popcorn/PopcornStory.js';

export const Fonts: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [handle] = useState(() => delayRender('Local fonts'));
  useEffect(() => {
    const faces = [new FontFace('Inter', `url(${staticFile('fonts/Inter-Regular.woff')})`, {weight: '400'}), new FontFace('Inter', `url(${staticFile('fonts/Inter-SemiBold.woff')})`, {weight: '600'})];
    Promise.all(faces.map(face => face.load())).then(loaded => { loaded.forEach(face => document.fonts.add(face)); continueRender(handle); }).catch(cancelRender);
  }, [handle]);
  return <>{children}</>;
};
const EggFilm = () => <Fonts><AbsoluteFill><YolkGame/><Audio src={staticFile('egg.wav')}/></AbsoluteFill></Fonts>;
const PopcornFilm = () => <Fonts><AbsoluteFill><PopcornStory/><Audio src={staticFile('popcorn.wav')}/></AbsoluteFill></Fonts>;
const Root = () => <><Composition id="YolkGame" component={EggFilm} width={1080} height={1920} fps={30} durationInFrames={450}/><Composition id="PopcornStory" component={PopcornFilm} width={1080} height={1920} fps={30} durationInFrames={POPCORN_DURATION}/></>;
registerRoot(Root);
