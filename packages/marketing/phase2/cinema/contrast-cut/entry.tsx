import React,{useEffect,useState}from'react';
import{AbsoluteFill,Composition,Img,OffthreadVideo,Sequence,cancelRender,continueRender,delayRender,interpolate,registerRoot,staticFile,useCurrentFrame}from'remotion';
const Film=()=>{
 const f=useCurrentFrame();const[h]=useState(()=>delayRender('Existing licensed Inter'));
 useEffect(()=>{new FontFace('Inter',`url(${staticFile('Inter-SemiBold.woff')})`,{weight:'600'}).load().then(font=>{document.fonts.add(font);continueRender(h)}).catch(cancelRender)},[h]);
 const style=f>=78&&f<132||f>=210;const canned=f>=96&&f<132||f>=210;
 const heading=f<78?'Fresh or canned?':f<96?'Fresh?':f<132?'CANNED.':f<210?'Fresh bromelain\ncan stop the set.':'Canned, please.';
 const imageScale=interpolate(f>=210?f-210:f-78,[0,f>=210?104:54],[1.07,1.01],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 return <AbsoluteFill style={{background:'#0c2529',fontFamily:'Inter',color:'#fff8e9'}}>
  {f<78?<Sequence from={0} durationInFrames={78}><OffthreadVideo muted src={staticFile('pineapple-preparation.mp4')} style={{width:1080,height:1920,objectFit:'cover'}}/></Sequence>:f<132?<Img src={staticFile(canned?'canned-pineapple-style.png':'fresh-pineapple-style.png')} style={{width:1080,height:1920,objectFit:'cover',transform:`scale(${imageScale})`}}/>:f<210?<Sequence from={132} durationInFrames={78}><OffthreadVideo muted startFrom={162} src={staticFile('pineapple-preparation.mp4')} style={{width:1080,height:1920,objectFit:'cover',transform:'scale(1.12)',transformOrigin:'38% 55%'}}/></Sequence>:<Img src={staticFile('canned-pineapple-style.png')} style={{width:1080,height:1920,objectFit:'cover',transform:`scale(${imageScale})`}}/>}
  <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(3,19,22,.62),rgba(3,19,22,.15) 28%,transparent 45%,transparent 63%,rgba(3,19,22,.30) 100%)'}}/>
  <div style={{position:'absolute',left:96,top:208,fontSize:26,letterSpacing:2.5}}>RECIPEFIX / FOOD NOTES</div>
  {f<78?<div style={{position:'absolute',left:96,top:275,fontSize:45,color:'#ffe06d'}}>GELATIN TONIGHT?</div>:null}
  <div style={{position:'absolute',left:96,right:160,top:f<78?355:275,fontSize:f<78?82:f<132?102:75,lineHeight:1.07,letterSpacing:-2.5,whiteSpace:'pre-line',color:canned?'#ffe06d':'#fff8e9',textShadow:'0 2px 8px #0c25294d'}}>{heading}</div>
  {f>=96&&f<132?<div style={{position:'absolute',left:96,top:405,fontSize:47}}>For gelatin.</div>:null}
  {f>=210?<><div style={{position:'absolute',left:96,top:398,fontSize:45,lineHeight:1.18}}>Canning heat inactivates<br/>bromelain.</div><div style={{position:'absolute',left:96,right:165,top:1225,fontSize:42,lineHeight:1.2,textShadow:'0 2px 8px #10272b'}}>Follow your recipe’s<br/>fruit instructions.</div></>:null}
  <div style={{position:'absolute',left:96,right:165,top:1340,padding:'9px 12px',background:'#10272be6',fontSize:28,lineHeight:1.23}}>{style?'AI illustration · not a kitchen test':'Licensed pineapple preparation footage'}<br/>Food science note · UGA / EatRight</div>
 </AbsoluteFill>;
};
registerRoot(()=><Composition id="PineappleContrastCut" component={Film} width={1080} height={1920} fps={30} durationInFrames={315}/>);
