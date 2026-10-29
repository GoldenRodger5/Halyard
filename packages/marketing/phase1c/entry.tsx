import React,{useState,useEffect} from 'react';
import {AbsoluteFill,Audio,Composition,cancelRender,continueRender,delayRender,registerRoot,staticFile} from 'remotion';
import {BroilerStory,DURATION} from './BroilerStory.js';
import {InstagramCard,XGraphic} from './Companions.js';
const Fonts:React.FC<{children:React.ReactNode}>=({children})=>{
 const [handle]=useState(()=>delayRender('Local fonts'));
 useEffect(()=>{const faces=[new FontFace('Inter',`url(${staticFile('fonts/Inter-Regular.woff')})`,{weight:'400'}),new FontFace('Inter',`url(${staticFile('fonts/Inter-SemiBold.woff')})`,{weight:'600'}),new FontFace('Instrument',`url(${staticFile('fonts/InstrumentSerif-Regular.ttf')})`)];Promise.all(faces.map(f=>f.load())).then(fs=>{fs.forEach(f=>document.fonts.add(f));continueRender(handle);}).catch(cancelRender);},[handle]);
 return <>{children}</>;
};
const Film=()=> <Fonts><AbsoluteFill><BroilerStory/><Audio src={staticFile('score.wav')}/></AbsoluteFill></Fonts>;
const Card:React.FC<{page:number}>=props=><Fonts><InstagramCard {...props}/></Fonts>;
const X=()=> <Fonts><XGraphic/></Fonts>;
const Root=()=> <><Composition id="BroilerStory" component={Film} width={1080} height={1920} fps={30} durationInFrames={DURATION}/>{[1,2,3,4,5].map(page=><Composition key={page} id={'Instagram'+page} component={Card} defaultProps={{page}} width={1080} height={1350} fps={30} durationInFrames={1}/>)}<Composition id="XGraphic" component={X} width={1200} height={675} fps={30} durationInFrames={1}/></>;
registerRoot(Root);
