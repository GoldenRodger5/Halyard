import React, {useEffect, useState} from 'react';
import {
  AbsoluteFill, Composition, Img, OffthreadVideo, Sequence,
  cancelRender, continueRender, delayRender, interpolate,
  registerRoot, staticFile, useCurrentFrame,
} from 'remotion';

const move = (frame: number, start: number, end: number, from: number, to: number) =>
  interpolate(frame, [start, end], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
const fade = (frame: number, start: number, end: number) =>
  Math.min(move(frame, start, start + 9, 0, 1), move(frame, end - 9, end, 1, 0));

/** One food scene. Shot boundaries follow action, never a website content section. */
function SecondTray() {
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Existing licensed Inter'));
  useEffect(() => {
    new FontFace('Inter', `url(${staticFile('Inter-SemiBold.woff')})`, {weight: '600'})
      .load().then(font => {document.fonts.add(font); continueRender(fontHandle);})
      .catch(cancelRender);
  }, [fontHandle]);

  const batchCamera = move(frame, 138, 383, 1.10, 1.02);
  const imageStyle: React.CSSProperties = {width: 1080, height: 1920, objectFit: 'cover'};
  const annotation: React.CSSProperties = {
    position: 'absolute', color: '#fff7e5', fontWeight: 600,
    textShadow: '0 2px 7px #111a', letterSpacing: -0.6,
  };

  return <AbsoluteFill style={{backgroundColor: '#202b2a', fontFamily: 'Inter', overflow: 'hidden'}}>
    <Sequence from={0} durationInFrames={105}>
      <OffthreadVideo muted src={staticFile('hero.mp4')} startFrom={0} playbackRate={1 / 3.5}
        style={{...imageStyle, transform: `scale(${move(frame, 0, 95, 1.58, 1.02)})`, transformOrigin: '47% 60%'}} />
    </Sequence>
    <Sequence from={105} durationInFrames={33}>
      <OffthreadVideo muted src={staticFile('hero.mp4')} startFrom={33} playbackRate={1.6 / 3}
        style={{...imageStyle, transform: 'scale(3.0)', transformOrigin: `52% ${move(frame, 105, 194, 42, 20)}%`}} />
    </Sequence>
    <Sequence from={138} durationInFrames={90}>
      <OffthreadVideo muted src={staticFile('hero.mp4')} startFrom={144} playbackRate={0.4}
        style={{...imageStyle, transform: `scale(${batchCamera})`, transformOrigin: '50% 48%'}} />
    </Sequence>
    {frame >= 228 && <Img src={staticFile('settled.jpg')}
      style={{...imageStyle, transform: `scale(${batchCamera})`, transformOrigin: '50% 48%'}} />}

    {/* A cook's brief annotation occupies the oven's dark negative space. */}
    <div style={{...annotation, left: 150, top: 262, opacity: fade(frame, 44, 103)}}>
      <div style={{fontSize: 54, lineHeight: 1.15}}>Dinner <span style={{opacity: 0.55, textDecoration: 'line-through'}}>4</span> → 6</div>
      <div style={{fontSize: 37, marginTop: 10, letterSpacing: 0.3}}>Dairy-Free</div>
    </div>

    {/* Small leaders refer to physical sheet positions, not a fabricated interface. */}
    <svg width={1080} height={1920} style={{position: 'absolute', opacity: fade(frame, 146, 278)}}>
      <g fill="none" stroke="#fff3d8" strokeWidth={2} opacity={0.9}>
        <path d="M166 784 L260 784 L325 705" />
        <path d="M182 1035 L320 1035 L575 1100" />
      </g>
      <g fill="#fff3d8"><circle cx={325} cy={705} r={4}/><circle cx={575} cy={1100} r={4}/></g>
    </svg>
    <div style={{...annotation, left: 100, top: 720, opacity: fade(frame, 146, 278), fontSize: 43}}>1 · now</div>
    <div style={{...annotation, left: 100, top: 969, opacity: fade(frame, 146, 278), fontSize: 43}}>2 · next</div>

    <div style={{...annotation, left: 112, top: 1160, opacity: fade(frame, 276, 383), width: 740}}>
      <div style={{fontSize: 58, letterSpacing: -1.5}}>RecipeFix</div>
      <div style={{fontSize: 37, marginTop: 14, lineHeight: 1.35}}>Open Chicken Tikka Masala.</div>
      <div style={{fontSize: 33, marginTop: 13, opacity: 0.9, letterSpacing: 0.2}}>recipefix.app</div>
    </div>
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="SecondTray" component={SecondTray}
  width={1080} height={1920} fps={30} durationInFrames={384}/>);
