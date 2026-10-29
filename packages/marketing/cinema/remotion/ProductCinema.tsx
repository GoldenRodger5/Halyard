import React from 'react';
import {AbsoluteFill,Audio,Easing,Img,OffthreadVideo,Sequence,interpolate,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';

// A bespoke film for this one recorded transformation. No existing list format is changed.
const C={paper:'#fbf4e9',ink:'#243a2e',rust:'#b14f2e',peach:'#edc6ab',sage:'#d6dfcb'};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
const ease=Easing.bezier(.19,1,.22,1);
const mix=(f:number,a:number,b:number,x=0,y=1)=>interpolate(f,[a,b],[x,y],{...clamp,easing:ease});
const fonts=`@font-face{font-family:Inter;src:url('${staticFile('fonts/Inter-Regular.woff')}')}@font-face{font-family:Inter;font-weight:600;src:url('${staticFile('fonts/Inter-SemiBold.woff')}')}@font-face{font-family:Editorial;src:url('${staticFile('fonts/InstrumentSerif-Regular.ttf')}')}`;
const serif:React.CSSProperties={fontFamily:'Editorial',fontWeight:400,lineHeight:.96,letterSpacing:-2.5};
const sans:React.CSSProperties={fontFamily:'Inter',fontWeight:600,lineHeight:1.2,letterSpacing:-.6};
const label:React.CSSProperties={fontFamily:'Inter',fontSize:30,letterSpacing:2.3,fontWeight:600};

function Plate({f,left=245,top=650,size=1080}:{f:number;left?:number;top?:number;size?:number}){
 return <div style={{position:'absolute',left,top,width:size,height:size,borderRadius:'50%',overflow:'hidden',boxShadow:'0 55px 100px #4c2d1928',transform:`rotate(${mix(f,0,90,-5,0)}deg) scale(${mix(f,0,90,1.05,1)})`}}><Img src={staticFile('hero.jpg')} style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>;
}
function Proof({src,width,top,left=106,rotate=0}:{src:string;width:number;top:number;left?:number;rotate?:number}){
 return <Img src={staticFile(src)} style={{position:'absolute',left,top,width,height:'auto',borderRadius:24,boxShadow:'0 28px 64px #18302622',transform:`rotate(${rotate}deg)`}}/>;
}
export const ProductCinema:React.FC=()=>{
 const f=useCurrentFrame();
 const [fontHandle]=React.useState(()=>delayRender('Local editorial fonts'));
 React.useEffect(()=>{Promise.all([document.fonts.load('132px Editorial'),document.fonts.load('600 32px Inter')]).then(()=>continueRender(fontHandle)).catch(cancelRender)},[fontHandle]);
 const cut=f<90?0:f<210?1:f<330?2:f<540?3:4;
 const local=f-[0,90,210,330,540][cut]!;
 const stage=C.paper;
 return <AbsoluteFill style={{background:stage,color:C.ink,overflow:'hidden'}}>
  <style>{fonts}</style>
  <AbsoluteFill style={{background:'radial-gradient(ellipse at 100% 76%,#ecd5b0 0%,transparent 58%)'}}/>
  {cut===0&&<>
   <Plate f={local} left={490} top={1120} size={860}/>
   <div style={{position:'absolute',left:105,top:280,...label,color:C.rust}}>DAIRY-FREE TIKKA · FOR SIX</div>
   <div style={{position:'absolute',left:100,top:355,width:850,...serif,fontSize:125}}>The cream<br/><span style={{color:C.rust}}>changed.</span></div>
   <div style={{position:'absolute',left:109,top:650,...sans,fontSize:52}}>So did the method.</div>
   <div style={{position:'absolute',left:106,top:790,width:864,transform:`translateX(${local<26?mix(local,0,16,0,-14):mix(local,26,45,40,0)}px) rotate(${local<26?-1:1}deg)`}}>
    <Img src={staticFile(local<26?'ingredient.png':'method.png')} style={{width:'100%',height:'auto',borderRadius:24,boxShadow:'0 28px 64px #18302622'}}/>
   </div>
   <div style={{position:'absolute',left:109,top:1295,...sans,fontSize:32,background:C.paper,padding:'10px 14px'}}>Original recipe photo</div>
  </>}
  {cut===1&&<>
   <div style={{position:'absolute',left:-340,top:560,width:1400,height:1400,borderRadius:'50%',background:C.peach,transform:`translateX(${mix(local,0,30,-140,0)}px)`}}/>
   <div style={{position:'absolute',left:105,top:285,...label,color:C.rust}}>01 / MAKE IT FIT</div>
   <div style={{position:'absolute',left:100,top:355,...serif,fontSize:128}}>Dairy-free.<br/>For six.</div>
   <div style={{position:'absolute',left:130,top:595,width:760,height:806,borderRadius:42,overflow:'hidden',background:C.paper,boxShadow:'26px 48px 90px #52311e30',border:'6px solid #efe9df',transform:`perspective(1800px) translateY(${mix(local,0,22,150,0)}px) rotateY(${mix(local,0,45,-7,0)}deg) rotateZ(${mix(local,0,45,-3,0)}deg)`}}>
    {local<69?<Sequence from={90} durationInFrames={69} layout="none"><OffthreadVideo src={staticFile('interaction-modal.mp4')} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/></Sequence>:<Img src={staticFile('choose-modal.png')} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}
   </div>
  </>}
  {cut===2&&<>
   <div style={{position:'absolute',left:560,top:-300,width:1300,height:1300,borderRadius:'50%',background:C.peach,opacity:.65}}/>
   <div style={{position:'absolute',left:105,top:285,...label,color:C.rust}}>02 / THE INGREDIENT</div>
   <div style={{position:'absolute',left:100,top:360,...serif,fontSize:116}}>Heavy cream<span style={{color:C.rust,display:'block'}}>→ Coconut cream.</span></div>
   <div style={{position:'absolute',left:110,top:650,...sans,fontSize:36}}>½ cup → ¾ cup · scaled 4 to 6</div>
   <div style={{transform:`translateY(${mix(local,0,22,120,0)}px) rotate(${mix(local,0,110,-3,0)}deg)`,transformOrigin:'50% 60%'}}><Proof src="ingredient.png" width={864} top={795}/></div>
   <div style={{position:'absolute',left:110,top:1270,...sans,fontSize:34,color:C.rust}}>The actual ingredient change, opened.</div>
  </>}
  {cut===3&&<>
   <AbsoluteFill style={{background:C.ink}}/>
   <div style={{position:'absolute',left:560,top:1100,width:1000,height:1000,borderRadius:'50%',border:'2px solid #66745a',transform:`translateY(${mix(local,0,210,60,-50)}px)`}}/>
   <div style={{position:'absolute',left:105,top:285,...label,color:C.peach}}>03 / THE METHOD FOLLOWS</div>
   <div style={{position:'absolute',left:100,top:365,width:850,...serif,fontSize:127,color:C.paper}}>{local<100?<><span style={{color:'#efc9a5'}}>Whisk</span> it<br/>smooth.</>:<>Then <span style={{color:'#efc9a5'}}>simmer</span><br/>gently.</>}</div>
   <div style={{transform:`translateY(${mix(local,0,24,80,0)}px)`}}><Proof src="method.png" width={864} top={790}/></div>
   <div style={{position:'absolute',left:110,top:1280,width:810,...sans,fontSize:34,color:C.paper}}>A changed ingredient.<br/>An instruction that changes with it.</div>
  </>}
  {cut===4&&<>
   <div style={{position:'absolute',left:-170,top:-360,width:1500,height:1500,borderRadius:'50%',background:C.sage}}/>
   <div style={{position:'absolute',left:116,top:270,...label,color:C.rust}}>THE SWAP + THE METHOD</div>
   <div style={{position:'absolute',left:110,top:465,width:820,height:414,borderRadius:30,overflow:'hidden',background:C.paper,boxShadow:'0 40px 100px #19332324',transform:`perspective(1800px) rotateY(${mix(local,0,150,7,0)}deg) rotateZ(${mix(local,0,150,4,1)}deg) translateY(${mix(local,0,25,60,0)}px)`}}><Img src={staticFile('result-title.png')} style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>
   <div style={{position:'absolute',left:106,top:1020,...serif,fontSize:158,textShadow:`0 0 28px ${C.paper}`,background:C.paper,paddingRight:30}}>RecipeFix</div>
   <div style={{position:'absolute',left:110,top:1203,...sans,fontSize:52}}>Make your recipe fit.</div>
   <div style={{position:'absolute',left:110,top:1288,...sans,fontSize:40,color:C.rust}}>recipefix.app <span style={{display:'inline-block',transform:`translateX(${mix(local,40,90,0,12)}px)`}}>↗</span></div>

  </>}
  <div style={{position:'absolute',left:96,top:1390,width:820,padding:'12px',boxSizing:'border-box',background:cut===3?C.ink:C.paper,...sans,fontSize:32,color:cut===3?'#f2dbc3':'#494e3f'}}>Recorded-result demo · 21 Oct 2026</div>
  <div style={{position:'absolute',left:108,top:1465,height:3,width:780,background:cut===3?'#506251':'#ddd7c8'}}><div style={{width:mix(f,0,689,0,780),height:3,background:cut===3?C.peach:C.rust}}/></div>
  <Audio src={staticFile('sound.wav')} volume={1}/>
 </AbsoluteFill>;
};
