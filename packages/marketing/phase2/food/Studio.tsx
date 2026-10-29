import React from 'react';
import {AbsoluteFill,Img,staticFile,useCurrentFrame,interpolate,Easing} from 'remotion';
const blue='#173fdb',orange='#ff6b28',white='#fff9ee',yellow='#ffcf00',pink='#cb1c60',black='#301021';
const Label:React.FC<{children:React.ReactNode;color?:string}>=({children,color=white})=><div style={{position:'absolute',left:72,right:72,top:60,font:'600 25px Inter',letterSpacing:3,color}}>{children}</div>;
const Big:React.FC<{children:React.ReactNode;top?:number;color?:string;size?:number}>=({children,top=155,color=white,size=112})=><div style={{position:'absolute',left:72,right:72,top,font:`600 ${size}px/.98 Inter`,letterSpacing:-5,color}}>{children}</div>;
export const PanPrototype:React.FC<{reveal:boolean}>=({reveal})=><AbsoluteFill style={{background:blue}}>
 <Label>RECIPEFIX / PAN LOGIC</Label>
 <Big size={112}>{reveal?<>Two inches.<br/><span style={{color:'#ffcf93'}}>56% more pan.</span></>:<>Looks like<br/>a small swap.</>}</Big>
 <svg viewBox="0 0 1080 760" style={{position:'absolute',left:0,top:440,width:1080,height:760}}>
  <defs><pattern id="hatch" width="23" height="23" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="9" height="23" fill={orange}/></pattern></defs>
  <circle cx="540" cy="370" r="320" fill={reveal?'url(#hatch)':orange} stroke={white} strokeWidth="5"/>
  <circle cx="540" cy="370" r="256" fill={blue} stroke={white} strokeWidth="5"/>
  <path d="M284 370H796M284 355V385M796 355V385" stroke={white} strokeWidth="3"/>
  <text x="540" y="345" textAnchor="middle" fill={white} fontFamily="Inter" fontSize="73" fontWeight="600">8-inch</text>
  <text x="540" y="805" textAnchor="middle" fill={white} fontFamily="Inter" fontSize="42">10-inch round</text>
  {reveal&&<><path d="M790 160L910 70" stroke={white} strokeWidth="3"/><text x="800" y="47" fill={white} fontFamily="Inter" fontSize="36">extra area</text></>}
 </svg>
 <div style={{position:'absolute',left:72,right:72,top:1200,font:'32px/1.3 Inter',color:white}}>{reveal?'Same depth. Round pans. Area comparison.':'8-inch → 10-inch round. How much bigger?'}</div>
</AbsoluteFill>;

// A deliberately graphic protein-network metaphor, never a molecular simulation or kitchen test.
export const GelNetwork:React.FC<{cut:number;heat?:boolean}>=({cut,heat=false})=><svg viewBox="0 0 1080 900" style={{width:1080,height:900}}>
 <defs><linearGradient id="gelpink" x2="1" y2="1"><stop stopColor="#f774a0"/><stop offset="1" stopColor="#d81760"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="4"/></filter></defs>
 <path d="M170 180Q540 40 910 180L950 700Q540 850 130 700Z" fill="url(#gelpink)" opacity=".45"/>
 {Array.from({length:6},(_,row)=>Array.from({length:6},(_,col)=>{const x=190+col*140,y=200+row*105;const broken=cut>0&&(row+col)%3===0;const d=broken?cut*35:0;return <g key={`${row}-${col}`}>
  {col<5&&<path d={broken?`M${x} ${y}Q${x+30} ${y+d} ${x+55} ${y+d} M${x+85} ${y+d}Q${x+110} ${y+d} ${x+140} ${y}`:`M${x} ${y}Q${x+70} ${y-40} ${x+140} ${y}`} fill="none" stroke={white} strokeWidth="9" strokeLinecap="round" opacity={broken?1-cut*.45:1}/>}
  {row<5&&<path d={`M${x} ${y}Q${x+38} ${y+50} ${x} ${y+105}`} fill="none" stroke={white} strokeWidth="8" strokeLinecap="round" opacity={broken?1-cut:.8}/>}
  <circle cx={x} cy={y+(broken?d:0)} r="13" fill={white}/>
 </g>}))}
 {!heat&&<g transform={`translate(${230+cut*550} ${220+cut*410}) rotate(${cut*75})`}>
  <circle cx="-40" cy="-28" r="34" fill="none" stroke={yellow} strokeWidth="14"/><circle cx="-40" cy="46" r="34" fill="none" stroke={yellow} strokeWidth="14"/>
  <path d="M-10-10L120 75M-10 29L120-50" stroke={yellow} strokeWidth="17" strokeLinecap="round"/>
  <circle cx="20" cy="13" r="12" fill={black}/>
 </g>}
 {heat&&<g transform="translate(760 145)"><circle r="87" fill={yellow}/><path d="M-30 20L-6 43L39-37" fill="none" stroke={black} strokeWidth="17" strokeLinecap="round"/></g>}
</svg>;
export const PineapplePrototype:React.FC<{network:boolean}>=({network})=><AbsoluteFill style={{background:network?pink:yellow}}>
 <Label color={network?white:black}>RECIPEFIX / DESSERT SABOTAGE</Label>
 <Big size={112} color={network?white:black}>{network?<>Tiny enzyme.<br/>Big problem.</>:<>The pineapple<br/>that breaks<br/>dessert.</>}</Big>
 {network?<div style={{position:'absolute',top:390}}><GelNetwork cut={.7}/></div>:<Img src={staticFile('jelly-studio.png')} style={{position:'absolute',left:0,top:440,width:1080,height:830,objectFit:'cover',mixBlendMode:'multiply',filter:'saturate(1.35)'}}/>}
 <div style={{position:'absolute',left:72,right:72,top:1215,font:'30px/1.3 Inter',color:network?white:black}}>{network?'Bromelain can break gelatin’s protein network.':'Fresh pineapple can stop gelatin setting.'}</div>
</AbsoluteFill>;
// Continuous visual progression: studio wobble → severed support → collapse → ingredient choice.
const ease=(n:number)=>Math.max(0,Math.min(1,n));
const FruitIcon:React.FC<{canned:boolean}>=({canned})=><svg viewBox="0 0 300 340" style={{width:250,height:280}}>
 {canned?<g><defs><linearGradient id="tin" x2="1"><stop stopColor="#a9aab9"/><stop offset=".45" stopColor="#fff9ee"/><stop offset="1" stopColor="#a2a1ae"/></linearGradient></defs><rect x="49" y="64" width="202" height="235" fill="url(#tin)"/><ellipse cx="150" cy="64" rx="101" ry="28" fill="#dbdae1" stroke={black} strokeWidth="5"/><ellipse cx="150" cy="299" rx="101" ry="26" fill="#c4c3cd" stroke={black} strokeWidth="5"/><path d="M49 64V299M251 64V299" stroke={black} strokeWidth="5"/><rect x="49" y="115" width="202" height="132" fill={pink}/><text x="150" y="193" fill={white} fontFamily="Inter" fontSize="35" textAnchor="middle" fontWeight="600">PINEAPPLE</text><path d="M95 79Q150 94 205 79" fill="none" stroke="#7d7784" strokeWidth="4"/></g>:<g><path d="M150 102Q110 50 80 48L112 119Q72 89 48 96L101 146M150 100Q185 48 214 45L188 119Q227 85 254 101L201 147M150 112L145 20L173 107" fill="#556b36" stroke={black} strokeWidth="5"/><path d="M92 129Q150 102 208 129Q245 190 221 260Q150 323 79 260Q56 191 92 129Z" fill="#f2a524" stroke={black} strokeWidth="5"/>{[0,1,2,3].map(i=><path key={i} d={`M${78+i*37} 140L${212-i*28} 279M${221-i*37} 140L${88+i*28} 279`} stroke="#875428" strokeWidth="3" opacity=".6"/>)}</g>}
</svg>;
const CollapsingNetwork:React.FC<{frame:number}>=({frame})=>{
 const cut=ease((frame-100)/62);const fall=ease((frame-164)/54);const rows=5,cols=6;
 const point=(r:number,c:number)=>({x:190+c*140+Math.sin(r*3+c*5)*fall*80,y:210+r*115+fall*fall*(690-r*115)+Math.sin(c*2+r)*fall*38});
 const bladeX=190+cut*680,bladeY=230+cut*470;
 return <svg viewBox="0 0 1080 1050" style={{width:1080,height:1050}}>
 <ellipse cx="540" cy="930" rx={260+fall*110} ry={25+fall*28} fill="#ffb3ca" opacity={fall*.8}/>
 {Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>{
  const a=point(r,c),b=point(r,Math.min(c+1,cols-1));const order=(r+c)/(rows+cols-2);const severed=cut>order&&c<cols-1;const next=point(Math.min(r+1,rows-1),c);const gap=severed?18+fall*60:0;
  return <g key={`${r}-${c}`}>
   {c<cols-1&&<path d={severed?`M${a.x} ${a.y}Q${a.x+30} ${a.y+25+fall*45} ${a.x+65-gap/2} ${a.y+22+fall*45} M${b.x-65+gap/2} ${b.y+22+fall*45}Q${b.x-30} ${b.y+25+fall*45} ${b.x} ${b.y}`:`M${a.x} ${a.y}Q${(a.x+b.x)/2} ${a.y-26} ${b.x} ${b.y}`} fill="none" stroke={white} strokeWidth="10" strokeLinecap="round" opacity={1-fall*.65}/>}
   {r<rows-1&&<path d={`M${a.x} ${a.y}Q${a.x+30} ${(a.y+next.y)/2} ${next.x} ${next.y}`} fill="none" stroke={white} strokeWidth="8" opacity={(1-fall)*(severed?.4:1)}/>}
   <circle cx={a.x} cy={a.y} r={13-fall*7} fill={white} opacity={1-fall*.35}/>
  </g>
 }))}
 {frame<173&&<g transform={`translate(${bladeX} ${bladeY}) rotate(${Math.sin(frame*.5)*15-25})`}><circle cx="-42" cy="-31" r="32" fill="none" stroke={yellow} strokeWidth="14"/><circle cx="-42" cy="43" r="32" fill="none" stroke={yellow} strokeWidth="14"/><path d="M-9-10L110 65M-9 30L110-47" stroke={yellow} strokeWidth="16" strokeLinecap="round"/><circle cx="18" cy="11" r="11" fill={black}/></g>}
 </svg>;
};
export const PineappleMotion:React.FC=()=>{
 const f=useCurrentFrame();const hero=f<84;const network=f>=84&&f<240;const ping=f%118;const gelFrame=ping<=59?ping:118-ping;const gelSrc=staticFile(`wobble/${String(gelFrame).padStart(3,'0')}.png`);
 return <AbsoluteFill style={{background:hero?'#f9c64e':network?pink:'#f6c246',color:hero?black:network?white:black}}>
  <Label color={network?white:black}>RECIPEFIX / DESSERT SABOTAGE</Label>
  {hero?<>
   <div style={{position:'absolute',left:65,right:65,top:150,font:'600 105px/.98 Inter',letterSpacing:-5,zIndex:2}}>The pineapple<br/>that breaks<br/>dessert.</div>
   <Img src={gelSrc} style={{position:'absolute',left:-260,top:180,width:1600,height:1600}}/>
   <div style={{position:'absolute',left:72,right:72,top:1560,font:'38px/1.3 Inter'}}>Fresh pineapple can stop<br/>gelatin from setting.</div>
  </>:network?<>
   <div style={{position:'absolute',left:72,right:72,top:160,font:'600 96px/1 Inter',letterSpacing:-4}}>{f<164?<>Fresh pineapple.<br/>Tiny enzyme.<br/>Big problem.</>:<>No network.<br/>No wobble.</>}</div>
   <div style={{position:'absolute',top:510}}><CollapsingNetwork frame={f}/></div>
   <div style={{position:'absolute',left:72,right:72,top:1560,font:'37px/1.3 Inter'}}>Bromelain breaks down<br/>gelatin proteins.</div>
  </>:<>
   <div style={{position:'absolute',left:72,right:72,top:160,font:'600 100px/1 Inter',letterSpacing:-4}}>Same fruit.<br/>Different prep.</div>
   <div style={{position:'absolute',left:72,top:495,width:420,textAlign:'center',font:'600 43px Inter'}}>FRESH</div><div style={{position:'absolute',left:588,top:495,width:420,textAlign:'center',font:'600 43px Inter'}}>CANNED</div>
   <div style={{position:'absolute',left:155,top:575}}><FruitIcon canned={false}/></div><div style={{position:'absolute',left:670,top:575}}><FruitIcon canned/></div>
   <div style={{position:'absolute',left:72,top:905,width:420,textAlign:'center',font:'34px/1.3 Inter'}}>Bromelain active.</div><div style={{position:'absolute',left:585,top:905,width:420,textAlign:'center',font:'34px/1.3 Inter'}}>Heat-inactivated.</div>
   <svg viewBox="0 0 450 270" style={{position:'absolute',left:72,top:1070,width:420,height:260}}><ellipse cx="225" cy="190" rx="170" ry="35" fill={pink}/><path d="M80 135Q140 95 200 145T355 133" stroke="#ffadc7" strokeWidth="8" fill="none"/></svg>
   <Img src={gelSrc} style={{position:'absolute',left:565,top:1020,width:470,height:470}}/>
   <div style={{position:'absolute',left:72,right:72,top:1485,font:'600 57px/1.1 Inter',letterSpacing:-1}}>Gelatin?<br/>Choose canned pineapple.</div>
   <div style={{position:'absolute',left:72,right:72,top:1680,font:'31px/1.3 Inter'}}>Follow the recipe’s fruit instructions.</div>
  </>}
  <div style={{position:'absolute',left:72,right:72,top:1780,font:'32px/1.3 Inter',color:network?white:black}}>{network?'Illustrated protein network':'Original 3D/graphic illustration'} · not a kitchen test<br/>Sources: UGA Extension / EatRight.org</div>
 </AbsoluteFill>
};
