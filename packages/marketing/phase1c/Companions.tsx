import React from 'react';
import {AbsoluteFill,Img,staticFile} from 'remotion';
import {Broiler,C,Defs,Tray} from './Visuals.js';

const Header=({n,label='RECIPEFIX / COOKING FOR MORE'}:{n:string;label?:string})=><div style={{position:'absolute',left:78,top:57,right:78,display:'flex',justifyContent:'space-between',font:'600 25px Inter',letterSpacing:2,color:C.green}}><span>{label}</span><span>{n}</span></div>;
const H=({children,top=145,size=88}:{children:React.ReactNode;top?:number;size?:number})=><div style={{position:'absolute',left:78,right:78,top,font:'600 '+size+'px/1.04 Inter',letterSpacing:-4,color:C.ink}}>{children}</div>;
const Note=({children,top=1210}:{children:React.ReactNode;top?:number})=><div style={{position:'absolute',left:78,right:78,top,font:'32px/1.35 Inter',color:C.green}}>{children}</div>;
const P=({children,top,size=41}:{children:React.ReactNode;top:number;size?:number})=><div style={{position:'absolute',left:78,right:78,top,font:`${size}px/1.35 Inter`,color:C.ink}}>{children}</div>;

export const InstagramCard:React.FC<{page:number}>=({page})=><AbsoluteFill style={{background:C.cream}}>
 <Header n={`${page}/5`}/>
 {page===1?<>
  <H>6 PEOPLE.<br/><span style={{color:C.orange}}>SAME BROILER.</span></H>
  <P top={360} size={35}>The part of scaling dinner that<br/>a bigger ingredient list can miss.</P>
  <Img src={staticFile('hero.jpg')} style={{position:'absolute',left:78,top:510,width:924,height:610,objectFit:'cover',borderRadius:24}}/>
  <div style={{position:'absolute',left:100,top:1025,background:C.cream,padding:'12px 16px',font:'600 34px Inter',color:C.ink}}>CHICKEN TIKKA MASALA / ORIGINAL PHOTO</div>
  <Note>A real RecipeFix example: Dairy-Free, 4 → 6 servings.<br/>Swipe for the quantities AND the cooking plan.</Note>
 </>:page===2?<>
  <H>The numbers<br/>are half the job.</H>
  <div style={{position:'absolute',left:78,top:405,width:924,height:380,background:C.green,borderRadius:24,color:C.cream,padding:45}}>
   <div style={{font:'34px Inter'}}>CHICKEN / FOUR → SIX SERVINGS</div><div style={{font:'600 118px Inter',letterSpacing:-5,marginTop:34}}>1½ <span style={{fontSize:50}}>lb</span> → 2¼ <span style={{fontSize:50}}>lb</span></div>
  </div>
  <P top={855}>The quantity grows.<br/>Your broiler space stays the same.</P>
  <P top={1035} size={33}>RecipeFix’s recorded result changes<br/>how the larger batch is arranged.</P>
  <Note>Specific example, not a universal scaling rule.<br/>Recorded production adaptation, October 21, 2026.</Note>
 </>:page===3?<>
  <H>The new plan:<br/><span style={{color:C.orange}}>two sheets.</span></H>
  <svg viewBox="0 0 1080 1350" width="1080" height="1350"><Defs/><Tray x={295} y={680} scale={.56} count={9} split label="1"/><Tray x={785} y={680} scale={.56} count={9} split label="2"/><path d="M430 925H650l-22-18m22 18-22 18" fill="none" stroke={C.green} strokeWidth="8" strokeLinecap="round"/></svg>
  <P top={965}>One sheet at a time.<br/>Then finish each batch in the sauce.</P>
  <Note>Illustrated arrangement of the recorded instructions.<br/>Not actual trays, portion counts or a cooked result.</Note>
 </>:page===4?<>
  <H size={78}>It rewrote the<br/>broiler step, too.</H>
  <div style={{position:'absolute',left:78,right:78,top:400,borderTop:'3px solid '+C.orange,paddingTop:35,font:'42px/1.38 Instrument',color:C.ink}}>
   <div style={{font:'600 28px Inter',color:C.orange,marginBottom:24}}>EXCERPTS FROM THE ACTUAL RESULT</div>
   <div>“spread in a single uncrowded layer on two foil-lined baking sheets”</div>
   <div style={{marginTop:35}}>“broil one sheet at a time”</div>
  </div>
  <P top={910} size={34}>The full recipe then finishes the chicken<br/>in simmering sauce, to 165°F (74°C) internally.</P>
  <P top={1060} size={31}>Amounts + a batch plan.<br/>That is more useful than multiplying numbers alone.</P>
  <Note>Recorded Oct 21 result; full instructions in RecipeFix.<br/>No new cooking test or nutrition result claimed.</Note>
 </>:<>
  <H>Your dinner.<br/><span style={{color:C.orange}}>Your headcount.</span></H>
  <div style={{position:'absolute',left:78,right:78,top:420,color:C.ink}}>
   {['Open the Chicken Tikka Masala Original.','Tap “Make it fit”.','Choose your needs and servings.'].map((line,i)=><div key={line} style={{display:'flex',alignItems:'center',gap:28,padding:'31px 0',borderBottom:'1px solid #bbbcae',font:'38px/1.25 Inter'}}><span style={{color:C.orange,fontWeight:600,fontSize:57}}>{i+1}</span><span>{line}</span></div>)}
  </div>
  <P top={980} size={57}>recipefix.app</P>
  <P top={1070} size={33}>Bring your own recipe next.<br/>Read the full adapted method before cooking.</P>
  <Note>This example: Dairy-Free, 6 servings.<br/>Historical result; individual requests can differ.</Note>
 </>}
</AbsoluteFill>;

export const XGraphic:React.FC=()=><AbsoluteFill style={{background:C.cream}}>
 <div style={{position:'absolute',left:65,top:42,font:'600 22px Inter',letterSpacing:2,color:C.green}}>RECIPEFIX / A SCALING EXAMPLE</div>
 <div style={{position:'absolute',left:65,top:112,font:'600 61px/1.05 Inter',letterSpacing:-3,color:C.ink}}>More chicken.<br/><span style={{color:C.orange}}>A different batch plan.</span></div>
 <div style={{position:'absolute',left:65,top:312,font:'600 37px Inter',color:C.green}}>4 → 6 servings · 1½ → 2¼ lb</div>
 <div style={{position:'absolute',left:65,top:396,font:'34px/1.3 Inter',color:C.ink}}>Two uncrowded sheets.<br/>Broil one at a time.<br/>Finish each batch in the sauce.</div>
 <svg viewBox="0 0 1200 675" width="1200" height="675"><Defs/><Tray x={900} y={290} scale={.52} count={9} split label="1"/><Tray x={950} y={500} scale={.52} count={9} split label="2"/></svg>
 <div style={{position:'absolute',left:65,top:600,font:'32px Inter',color:C.green}}>Recorded dairy-free adaptation, Oct 21, 2026 · illustrated plan</div>
</AbsoluteFill>;
