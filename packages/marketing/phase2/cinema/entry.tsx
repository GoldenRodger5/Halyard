import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Composition, Img, OffthreadVideo, Sequence, cancelRender, continueRender, delayRender, interpolate, registerRoot, staticFile, useCurrentFrame} from 'remotion';

const Film = () => {
 const frame = useCurrentFrame();
 const ending = frame >= 285;
 const [handle] = useState(() => delayRender('Existing licensed font'));
 useEffect(() => {new FontFace('Inter', `url(${staticFile('Inter-SemiBold.woff')})`, {weight:'600'}).load().then(font => {document.fonts.add(font); continueRender(handle);}).catch(cancelRender);}, [handle]);
 const headline = frame < 90 ? 'Gelatin has a\npineapple problem.' : frame < 180 ? 'Fresh pineapple can\nstop it setting.' : !ending ? 'Bromelain breaks down\ngelatin proteins.' : 'Canning heat\ninactivates the enzyme.';
 const reveal = interpolate(frame-(frame<90?0:frame<180?90:180), [0, 8], [0, 1], {extrapolateRight:'clamp'});
 return <AbsoluteFill style={{background:'#10272b', fontFamily:'Inter', color:'#fff9ee'}}>
  {!ending ? <OffthreadVideo muted src={staticFile('pineapple-preparation.mp4')} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <Img src={staticFile('canned-pineapple-style.png')} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${interpolate(frame,[285,389],[1.04,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})})`}}/>}
  <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(4,19,22,.85),rgba(4,19,22,.15) 33%,transparent 54%,rgba(4,19,22,.65) 100%)'}}/>
  <div style={{position:'absolute',left:80,top:142,fontSize:28,letterSpacing:3,fontWeight:600}}>RECIPEFIX / FOOD NOTES</div>
  <div style={{position:'absolute',left:78,right:74,top:222,fontSize:ending?65:72,lineHeight:1.13,fontWeight:600,whiteSpace:'pre-line',letterSpacing:-2,opacity:ending?1:reveal}}>{headline}</div>
  {ending && <div style={{position:'absolute',left:80,right:90,top:1445,fontSize:40,lineHeight:1.24,fontWeight:600}}>Use your recipe’s fruit instructions.</div>}
  <div style={{position:'absolute',left:80,right:70,top:1608,fontSize:32,lineHeight:1.28,fontWeight:600}}>Prep footage + AI illustration<br/>Not a kitchen test · Sources: UGA / EatRight</div>
 </AbsoluteFill>;
};
const ProductFilm=()=>{
 const frame=useCurrentFrame();
 const [handle]=useState(()=>delayRender('Licensed product font'));
 useEffect(()=>{new FontFace('Inter',`url(${staticFile('Inter-SemiBold.woff')})`,{weight:'600'}).load().then(font=>{document.fonts.add(font);continueRender(handle);}).catch(cancelRender);},[handle]);
 const ui=frame>=156&&frame<231;
 const method=frame>=231&&frame<285;
 const close=frame>=285;
 return <AbsoluteFill style={{background:'#13272b',fontFamily:'Inter',color:'#fff9ee'}}>
  {frame<156?<Sequence from={0} durationInFrames={156}><OffthreadVideo muted startFrom={24} src={staticFile('broiler-hero.mp4')} style={{width:1080,height:1920,objectFit:'cover'}}/></Sequence>:<Img src={staticFile('broiler-end.jpg')} style={{width:1080,height:1920,objectFit:'cover'}}/>}
  <AbsoluteFill style={{background:ui?'rgba(4,18,22,.66)':'linear-gradient(180deg,transparent 35%,rgba(4,18,22,.06) 50%,rgba(4,18,22,.88) 100%)'}}/>
  <div style={{position:'absolute',left:96,top:140,fontSize:28,letterSpacing:2.5,textShadow:'0 2px 8px #071416'}}>RecipeFix</div>
  {frame<156?<div style={{position:'absolute',left:96,right:155,top:1120,fontSize:90,lineHeight:1.04,letterSpacing:-3}}><span style={{color:'#ffe064'}}>{frame<72?'Two more':'Same oven.'}</span><br/>{frame<72?'for dinner?':'Two sheets.'}</div>:null}
  {ui?<><div style={{position:'absolute',left:96,top:260,fontSize:74,lineHeight:1.08,letterSpacing:-2}}><span style={{color:'#ffe064'}}>4 → 6.</span><br/>Dairy-Free.</div><div style={{position:'absolute',left:150,top:600,width:780,height:760,overflow:'hidden',borderRadius:30,boxShadow:'0 15px 45px #0006'}}>{frame<201?<Sequence from={156} durationInFrames={45} layout="none"><OffthreadVideo muted src={staticFile('recipefix-settings.mp4')} style={{width:780,height:1688,transform:'translateY(-636px)'}}/></Sequence>:<Img src={staticFile('settings-end.png')} style={{width:780,height:1688,transform:'translateY(-636px)'}}/>}</div></>:null}
  {method?<><div style={{position:'absolute',left:96,right:150,top:690,fontSize:68,lineHeight:1.06,letterSpacing:-2}}>The method<br/><span style={{color:'#ffe064'}}>changes, too.</span></div><div style={{position:'absolute',left:96,top:980,width:820,padding:'18px 20px',background:'#fff9ee',borderRadius:10}}><Img src={staticFile('broil-line1.png')} style={{display:'block',width:780}}/><Img src={staticFile('broil-line2.png')} style={{display:'block',width:287}}/></div></>:null}
  {close?<><div style={{position:'absolute',left:96,right:160,top:900,fontSize:101,lineHeight:1.02,letterSpacing:-3}}>Make your<br/><span style={{color:'#ffe064'}}>recipe fit.</span></div><div style={{position:'absolute',left:96,top:1175,fontSize:46}}>recipefix.app</div></>:null}
  <div style={{position:'absolute',left:96,right:150,top:1560,fontSize:30,lineHeight:1.25,textShadow:'0 2px 6px #051517'}}>AI planning illustration · not a cooked result<br/>Recorded Dairy-Free 4 → 6 · Oct 21, 2026</div>
 </AbsoluteFill>;
};
registerRoot(() => <><Composition id="PineappleCinemaProof" component={Film} width={1080} height={1920} durationInFrames={390} fps={30}/><Composition id="BroilerProductProof" component={ProductFilm} width={1080} height={1920} durationInFrames={360} fps={30}/></>);
