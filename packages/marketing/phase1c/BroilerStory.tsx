import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Broiler,C,Chicken,Defs,Sauce,Tray,ease,mix} from './Visuals.js';

export const DURATION=543;
const Heading=({top=310,children,size=100}:{top?:number;children:React.ReactNode;size?:number})=><div style={{position:'absolute',left:100,right:150,top,fontFamily:'Inter',fontSize:size,fontWeight:600,lineHeight:1.06,letterSpacing:-5,color:C.ink}}>{children}</div>;
const crowded=Array.from({length:18},(_,i)=>i<12?{x:(i%4-1.5)*135,y:(Math.floor(i/4)-1)*125}:{x:((i-12)%3-1)*140,y:(Math.floor((i-12)/3)-.5)*125});

export const BroilerStory:React.FC=()=>{
 const f=useCurrentFrame(),t=f/30;
 const grow=ease((t-.7)/1.2),crowd=t<4?Math.sin(t*11)*.7:0;
 const split=ease((t-8.8)/.9);
 const firstEnter=ease((t-9.7)/.65),firstExit=ease((t-10.8)/.65),second=ease((t-11.7)/.9);
 return <AbsoluteFill style={{background:C.cream,overflow:'hidden'}}>
  {t<4.2?<>
   <Heading>More dinner.<br/><span style={{color:C.orange}}>Same broiler.</span></Heading>
   <div style={{position:'absolute',left:104,top:570,font:'36px Inter',color:C.green}}>Chicken Tikka Masala · 4 → 6 servings</div>
   <svg viewBox="0 0 1080 1920" width="1080" height="1920"><Defs/><Broiler y={1035}/><Tray x={540} y={1080} scale={.94} count={12}/>
    {Array.from({length:6},(_,i)=>{const p=ease((t-.3-i*.07)/1.25),pos=crowded[i+12]!;return <Chicken key={i} x={mix(200+i*130,540+pos.x*.94,p)+crowd*12} y={mix(690,1080+pos.y*.94,p)-Math.sin(p*Math.PI)*80} angle={i*27+crowd*12} scale={1.5*.94}/>;})}
   </svg>
   <div style={{position:'absolute',left:100,top:1390,font:'600 49px Inter',color:C.ink}}>Chicken: {grow<.6?'1½':'2¼'} lb</div>
  </>:null}
  {t>=4.2&&t<8.5?<>
   <Heading size={82}>Make it fit<br/>the actual dinner.</Heading>
   {t<6?<div style={{position:'absolute',left:125,top:535,width:790,height:800,overflow:'hidden',borderRadius:30,boxShadow:'0 20px 70px #21302530',background:'#f8f4ee'}}>
    <Sequence from={126} durationInFrames={54} layout="none"><OffthreadVideo src={staticFile('ui-action.mp4')} style={{width:790,height:1710,objectFit:'cover',transform:'translateY(-870px)'}} muted/></Sequence>
   </div>:<>
    <div style={{position:'absolute',left:100,top:570,font:'600 48px Inter',color:C.orange}}>The actual revised step:</div>
    <div style={{position:'absolute',left:100,top:690,width:790,height:350,overflow:'hidden',borderTop:'3px solid '+C.orange,borderBottom:'3px solid '+C.orange}}><Img src={staticFile('broiler-proof.png')} style={{width:790,transform:'translateY(-320px)'}}/></div>
    <div style={{position:'absolute',left:100,top:1110,font:'600 58px/1.2 Inter',color:C.green}}>Two sheets.<br/>Broil one at a time.</div>
   </>}
   <div style={{position:'absolute',left:100,top:1380,font:'600 40px Inter',color:C.green}}>Request: Dairy-Free · 6 servings</div>
  </>:null}
  {t>=8.5&&t<15.9?<>
   <Heading size={92}>{t<10.1?<>The plan changes.</>:t<13.6?<>Two sheets.<br/><span style={{color:C.orange}}>One at a time.</span></>:<>Then finish<br/>in the sauce.</>}</Heading>
   <svg viewBox="0 0 1080 1920" width="1080" height="1920"><Defs/>
    {t<13.6?<>
     <Broiler y={1020} scale={.82}/>
     <g opacity={1-split}><Tray x={540} y={1080} scale={.94} count={0}/></g>
     <g opacity={split}>
      <Tray x={mix(mix(540,300,split),540,firstEnter)-firstExit*1100} y={mix(mix(1080,1320,split),1050,firstEnter)} scale={mix(mix(.94,.48,split),.67,firstEnter)} count={0} label="1"/>
      <Tray x={mix(mix(540,780,split),540,second)} y={mix(mix(1080,1320,split),1050,second)} scale={mix(mix(.94,.48,split),.67,second)} count={0} label="2"/>
     </g>
     {crowded.map((pos,i)=>{const one=i<9,j=i%9,sc=one?mix(.48,.67,firstEnter):mix(.48,.67,second),px=one?mix(300,540,firstEnter)-firstExit*1100:mix(780,540,second),py=one?mix(1320,1050,firstEnter):mix(1320,1050,second);return <Chicken key={i} x={mix(540+pos.x*.94,px+(j%3-1)*155*sc,split)} y={mix(1080+pos.y*.94,py+(Math.floor(j/3)-1)*125*sc,split)} angle={mix(i*27,(i*37)%52-26,split)} scale={mix(1.5*.94,1.23*sc,split)}/>;})}
     
    </>:<>
     <Tray x={220-ease((t-14)/1.1)*400} y={915} scale={.37} count={9} split/>
     <Tray x={840-ease((t-14.5)/1.1)*1300} y={915} scale={.37} count={9} split/>
     <path d="M230 1090Q540 1370 840 1090" fill="none" stroke={C.green} strokeWidth="9" strokeDasharray="16 12"/>
     <Sauce x={540} y={1180} scale={1.3}/>
    </>}
   </svg>
   <div style={{position:'absolute',left:100,top:1410,font:'36px Inter',color:C.green}}>{t<13.6?'RecipeFix rewrote the broiler step.':'Follow the full recipe for doneness.'}</div>
  </>:null}
  {t>=15.9?<>
   <div style={{position:'absolute',left:100,top:270,font:'600 38px Inter',letterSpacing:3,color:C.green}}>RECIPEFIX</div>
   <Heading top={360} size={96}>Cooking for more?<br/><span style={{color:C.orange}}>Try this recipe.</span></Heading>
   <Img src={staticFile('hero.jpg')} style={{position:'absolute',left:100,top:655,width:790,height:530,objectFit:'cover',borderRadius:26}}/>
   <div style={{position:'absolute',left:120,top:1105,background:C.cream,padding:'10px 15px',font:'30px Inter',color:C.ink}}>Original recipe photo</div>
   <div style={{position:'absolute',left:100,top:1260,font:'600 66px Inter',color:C.green}}>recipefix.app</div>
   <div style={{position:'absolute',left:100,top:1355,font:'35px Inter',color:C.ink}}>Chicken Tikka Masala → Make it fit</div>
  </>:null}
  <div style={{position:'absolute',left:100,top:242,right:150,font:'34px Inter',color:C.ink}}>{t>=4.2&&t<8.5?'Current UI · recorded result, Oct 21, 2026':'Illustrated plan · recorded result, Oct 21, 2026'}</div>
 </AbsoluteFill>;
};
