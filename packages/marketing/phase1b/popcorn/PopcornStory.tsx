import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';

export const POPCORN_DURATION = 405;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const tween = (f: number, a: number, b: number, x = 0, y = 1) => interpolate(f, [a,b], [x,y], {extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
const kernel = 'M-26-264 C59-278 162-182 181-64 C203 76 131 214 14 263 C-26 279-59 248-94 202 C-166 109-211-45-163-151 C-135-212-77-254-26-264Z';
// One irregular butterfly form: broad upper wing, folded side arms and a narrow hull.
const popped = 'M-50 168 C-89 213-142 186-125 141 C-193 163-255 110-230 64 C-287 53-291-17-246-42 C-269-88-224-135-184-113 C-195-169-152-196-118-165 C-153-222-107-287-54-263 C-40-324 44-326 65-266 C116-299 174-242 148-194 C206-189 220-126 180-96 C227-121 275-82 256-44 C311-30 305 38 262 53 C284 104 235 140 195 108 C181 159 131 167 103 123 C123 190 72 236 26 202 C-6 240-61 215-50 168Z';
const kernelPoints: [number,number][] = [[-26,-264],[-6.59,-265.33],[12.75,-263.24],[31.56,-258.23],[49.55,-250.79],[66.59,-241.37],[82.61,-230.3],[97.58,-217.84],[111.49,-204.2],[124.3,-189.54],[136.01,-173.97],[146.58,-157.61],[155.96,-140.54],[164.11,-122.85],[170.96,-104.62],[176.46,-85.93],[180.52,-66.89],[183.15,-47.59],[184.61,-28.16],[184.91,-8.69],[184.04,10.77],[182.01,30.14],[178.82,49.36],[174.48,68.35],[169.01,87.04],[162.42,105.37],[154.71,123.26],[145.91,140.63],[136.02,157.42],[125.08,173.53],[113.09,188.88],[100.08,203.38],[86.1,216.93],[71.18,229.45],[55.37,240.82],[38.74,250.96],[21.37,259.77],[3.06,266.26],[-16.31,266.45],[-34.62,260.02],[-50.81,249.24],[-65.18,236.1],[-78.27,221.68],[-90.52,206.53],[-102.22,190.96],[-113.16,174.84],[-123.31,158.21],[-132.7,141.15],[-141.35,123.7],[-149.26,105.89],[-156.42,87.77],[-162.8,69.37],[-168.4,50.71],[-173.17,31.83],[-177.07,12.74],[-180.03,-6.51],[-181.99,-25.89],[-182.87,-45.35],[-182.56,-64.82],[-180.97,-84.23],[-177.97,-103.48],[-173.43,-122.42],[-167.25,-140.88],[-159.28,-158.65],[-149.55,-175.52],[-138.24,-191.37],[-125.5,-206.11],[-111.49,-219.62],[-96.31,-231.82],[-80.07,-242.58],[-62.87,-251.71],[-44.81,-258.97]];
const poppedPoints: [number,number][] = [[4.9,-309.89],[32.41,-303.47],[54.35,-285.7],[70.16,-269.02],[97.52,-275.8],[124.65,-268.22],[145.19,-248.86],[154.31,-222.21],[148.38,-194.72],[174.43,-186.49],[195.04,-167.32],[202.76,-140.27],[195.42,-113.11],[184.77,-98.32],[212.46,-103.86],[239.45,-95.85],[257.73,-74.64],[257.31,-46.87],[278.57,-32.96],[293.9,-9.48],[293.72,18.64],[279.14,42.69],[264.87,60.82],[266.13,88.94],[250.87,112.3],[224.06,120.01],[197.75,110.09],[184.72,130.69],[163.12,148.63],[135.22,149.71],[111.66,134.29],[106.2,136.86],[106.45,165.22],[96.45,191.65],[75.12,209.93],[47.23,212.21],[22.79,205.52],[-1.58,219.48],[-29.34,216.3],[-48.39,195.98],[-50,168],[-72.09,185.69],[-99.68,190.7],[-123.11,176.09],[-127.27,148.65],[-144.98,145.41],[-173.35,144.76],[-200.25,135.77],[-222.56,118.34],[-235,93.1],[-230.75,65.43],[-254.59,53.72],[-272.17,31.76],[-276.33,3.89],[-266.91,-22.7],[-246.22,-41.88],[-252.22,-69.24],[-243.89,-96.11],[-222.8,-114.67],[-194.98,-117.34],[-185.75,-129.52],[-179.92,-157.13],[-159.56,-176.05],[-131.85,-174.34],[-123.45,-175.35],[-130.13,-202.87],[-125.93,-230.84],[-110.44,-254.44],[-85.45,-267.31],[-57.48,-264.45],[-44.13,-285.48],[-22.65,-303.72]];
// Both authored contours must have one corresponding point at every index.
if (kernelPoints.length !== poppedPoints.length) throw new Error('Popcorn contour point counts must match.');
const expandingStarch = (p:number) => {
 const pts=kernelPoints.map(([x,y],i)=>{
  // Equal lengths above guarantee this corresponding tuple exists.
  const target=poppedPoints[i]!;
  return [x*.88+(target[0]-x*.88)*p,y*.88+(target[1]-y*.88)*p];
 });
 return "M"+pts.map(v=>v.join(",")).join("L")+"Z";
};

/** Original illustrative geometry. All animation is a pure function of the frame. */
export const PopcornStory: React.FC = () => {
 const f=useCurrentFrame();
 const cut=tween(f,32,66);
 const heat=tween(f,91,203);
 const rupture=tween(f,245,263);
 const blossom=tween(f,250,294);
 const settle=tween(f,294,345);
 const pressure=heat*(1-rupture);
 const vibration=(Math.sin(f*2.3)+Math.sin(f*1.17))*(2.8+pressure*5)*(1-rupture);
 const camera=f<235?tween(f,23,80,1.1,1.62):tween(f,235,308,1.62,1.0);
 const rotation=f<245?-8+Math.sin(f*.07)*(1.2+pressure*3):tween(f,245,318,-8,6);
 const intro=1-tween(f,40,54);
 const caption=(a:number,b:number) => tween(f,a,a+12)*(1-tween(f,b-10,b));
 const titleStyle:React.CSSProperties={position:'absolute',left:100,right:160,color:'#fff5d9',fontFamily:'Inter',fontSize:72,fontWeight:600,lineHeight:1.09,letterSpacing:-3};
 return <AbsoluteFill style={{background:'#111b22',overflow:'hidden'}}>
  <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position:'absolute',inset:0}}>
   <defs>
    <radialGradient id="pc-bg"><stop stopColor="#523329"/><stop offset=".6" stopColor="#18272c"/><stop offset="1" stopColor="#0a151e"/></radialGradient>
    <radialGradient id="pc-gold" cx="34%" cy="25%" r="82%"><stop stopColor="#ffed9d"/><stop offset=".36" stopColor="#f1be48"/><stop offset=".7" stopColor="#bd6c1d"/><stop offset="1" stopColor="#633318"/></radialGradient>
    <radialGradient id="pc-starch" cx="39%" cy="22%" r="85%"><stop stopColor="#fffdf1"/><stop offset=".5" stopColor="#f8e7b5"/><stop offset=".83" stopColor="#d7b675"/><stop offset="1" stopColor="#9a703d"/></radialGradient>
    <radialGradient id="pc-white" cx="27%" cy="20%" r="90%"><stop stopColor="#fffff5"/><stop offset=".5" stopColor="#fff0c8"/><stop offset=".8" stopColor="#e6c382"/><stop offset="1" stopColor="#a86b35"/></radialGradient>
    <radialGradient id="pc-fold-top" cx="33%" cy="12%" r="92%"><stop stopColor="#fffff7"/><stop offset=".36" stopColor="#fff8de"/><stop offset=".66" stopColor="#eed29b"/><stop offset=".9" stopColor="#bc8d50"/><stop offset="1" stopColor="#865126"/></radialGradient>
    <linearGradient id="pc-fold-left" x1="0" y1="0" x2="1" y2=".75"><stop stopColor="#fffef0"/><stop offset=".48" stopColor="#fff0c6"/><stop offset=".77" stopColor="#d6ae6b"/><stop offset="1" stopColor="#9b642e"/></linearGradient>
    <linearGradient id="pc-fold-right" x1=".2" y1="0" x2=".8" y2="1"><stop stopColor="#ffffee"/><stop offset=".44" stopColor="#faeac2"/><stop offset=".75" stopColor="#cea261"/><stop offset="1" stopColor="#865225"/></linearGradient>
    <radialGradient id="pc-hollow" cx="47%" cy="45%" r="61%"><stop stopColor="#392214"/><stop offset=".35" stopColor="#6b3b1b"/><stop offset=".76" stopColor="#bc8740"/><stop offset="1" stopColor="#e1b878"/></radialGradient>
    <radialGradient id="pc-water" cx="30%" cy="20%"><stop stopColor="#d0f7ff"/><stop offset=".5" stopColor="#73d4e7"/><stop offset="1" stopColor="#247c99"/></radialGradient>
    <linearGradient id="pc-hot"><stop stopColor="#e95b1c" stopOpacity="0"/><stop offset=".5" stopColor="#ff9c45" stopOpacity=".65"/><stop offset="1" stopColor="#e95b1c" stopOpacity="0"/></linearGradient>
    <filter id="pc-blur"><feGaussianBlur stdDeviation="20"/></filter>
    <filter id="pc-soft"><feGaussianBlur stdDeviation="3"/></filter>
    <clipPath id="pc-expanded"><path d={expandingStarch(blossom)}/></clipPath>
    <clipPath id="pc-inside"><path d={kernel}/></clipPath><clipPath id="pc-left"><rect x="-300" y="-350" width="300" height="700"/></clipPath><clipPath id="pc-right"><rect x="0" y="-350" width="300" height="700"/></clipPath>
   </defs>
   <rect width="1080" height="1920" fill="url(#pc-bg)"/>
   <ellipse cx="560" cy="1334" rx={225+blossom*110} ry="44" fill="#030c12" opacity=".7" filter="url(#pc-blur)"/>
   <ellipse cx="540" cy="1290" rx="255" ry="43" fill="#db6d2c" opacity={(.18+pressure*.33)*(1-rupture)} filter="url(#pc-blur)"/>
   {/* Copper heat ribbons rise toward the intact hull, then cease on rupture. */}
   {[0,1,2,3,4].map(i=><path key={i} d={`M${330+i*100} 1360 Q${285+i*100} 1260 ${345+i*100} 1190 Q${405+i*100} 1130 ${350+i*100} 1040`} fill="none" stroke="url(#pc-hot)" strokeWidth="9" strokeDasharray="60 110" strokeDashoffset={-f*2-i*31} opacity={(.24+heat*.3)*(1-rupture)}/>) }
   <g transform={`translate(${540+vibration} ${935-settle*10}) scale(${camera}) rotate(${rotation})`}>
    {/* The same seed stays spatially continuous through exterior and cutaway. */}
    <g transform={`scale(${1+pressure*.15+Math.sin(f*.17)*pressure*.016} ${1-pressure*.025})`} opacity={1-tween(f,245,247)}>
     <path d={kernel} fill="url(#pc-gold)" stroke="#f3c36b" strokeWidth="2"/>
     <path d="M-45-238 C-121-170-146-38-93 126 C-69 201-23 239 11 254" fill="none" stroke="#fff3a7" strokeWidth="7" opacity={(1-cut)*.42}/>
     <path d="M72-207 C137-133 162 25 82 174" fill="none" stroke="#80421a" strokeWidth="12" opacity={(1-cut)*.3}/>
     <path d="M-19-252 C21-161 17-19 3 108" fill="none" stroke="#fff6c5" strokeWidth="2" opacity={(1-cut)*.35}/>
     <path d="M-24 199 Q4 235 29 226 L12 260 Q-5 273-22 256Z" fill="#76431f"/>
     <g clipPath="url(#pc-inside)" opacity={cut}>
      <path d={kernel} fill="url(#pc-starch)" transform="scale(.88)" stroke="#a66224" strokeWidth="15"/>
      {/* Starch cells: shaped facets, not a space/planet particle field. */}
      {Array.from({length:32},(_,i)=>{const a=i*2.39996;const r=38+Math.sqrt(i)*28;const x=Math.cos(a)*r*.75;const y=Math.sin(a)*r;return <path key={i} d={`M${x-18} ${y} q14-25 34-4 q8 19-14 31 q-25 3-20-27Z`} fill="#fff9dc" stroke="#caa973" strokeWidth="1.5" opacity=".55"/>;})}
      <g opacity={tween(f,30,45)*(1-tween(f,112,155))} transform={`translate(${-12+tween(f,31,76,62,0)} ${tween(f,31,76,-198,27)-tween(f,83,127,0,20)}) scale(${1-tween(f,109,155,0,.92)})`}>
       <path d="M0-78 C-17-48-56-7-56 22 C-56 97 58 97 58 22 C58-7 20-48 0-78Z" fill="url(#pc-water)"/>
       <path d="M-22 5 Q-40 37-18 47" fill="none" stroke="#e0fcff" strokeWidth="6" strokeLinecap="round"/>
      </g>
      {[0,1,2].map(i=>{const wave=((f-130+i*25)%75+75)%75/75;return <ellipse key={'wave'+i} cx="-8" cy="0" rx={40+wave*140} ry={60+wave*210} fill="none" stroke="#dc9757" strokeWidth={3+heat*4} opacity={tween(f,134,155)*(1-wave)*.6}/>})}
      {/* The water becomes visibly trapped vapor; paths accelerate as heat rises. */}
      {Array.from({length:18},(_,i)=>{const t=(f-100)/30;const a=i*2.39996+t*(.7+heat*1.5);const r=35+((i*37)%104)*(.4+heat*.7);return <g key={i} opacity={tween(f,109+i*1.4,129+i*1.4)*(.45+heat*.3)} transform={`translate(${Math.cos(a)*r*.85} ${Math.sin(a)*r*1.25}) rotate(${a*30})`}><path d="M-17 3 Q-21-12-9-14 Q-8-29 7-21 Q20-24 20-8 Q35-2 23 10 L-9 12Q-22 13-17 3Z" fill="#bfe4d9" opacity=".6"/></g>;})}
     </g>
     <path d={kernel} fill="none" stroke="#d78e34" strokeWidth={8+pressure*2} opacity={cut}/>
     {/* Outward impulse arrows terminate at the shell that is straining. */}
     {[0,1,2,3,4].map(i=>{const a=-132+i*64;const rad=a*Math.PI/180;const x=Math.cos(rad)*119,y=Math.sin(rad)*167;return <g key={i} transform={`translate(${x} ${y}) rotate(${a})`} opacity={tween(f,163,182)*(.55+Math.sin(f*.17+i)*.2)}><path d="M-20 0H12 M1-10L14 0 1 10" stroke="#b76126" strokeWidth="4" fill="none" strokeLinecap="round"/></g>})}
     <path d="M22-221 L-7-171 24-129-19-75 12-22-21 22 10 69-17 101 7 142-16 190" fill="none" stroke="#4b251c" strokeWidth={tween(f,215,244,0,11)} strokeLinejoin="round" strokeDasharray="650" strokeDashoffset={650*(1-tween(f,213,245))}/>
     <path d="M22-221 L-7-171 24-129-19-75 12-22-21 22 10 69-17 101 7 142-16 190" fill="none" stroke="#fff8de" strokeWidth="3" strokeDasharray="650" strokeDashoffset={650*(1-tween(f,219,247))}/>
    </g>
    {/* A single physical release: warm starch billows outward from the split. */}
    <g opacity={f>=245?1:0} transform={`translate(0 ${-Math.sin(clamp((f-250)/65)*Math.PI)*65}) rotate(${tween(f,250,318,0,14)})`}>
     <g>
      <path d={expandingStarch(blossom)} fill="url(#pc-white)" stroke="#f1d69a" strokeWidth="2"/>
      <g opacity={tween(f,251,271)} clipPath="url(#pc-expanded)">
       {/* Deep asymmetric recess, partly occluded by three raised folded surfaces. */}
       <path d="M-142-84 C-76-162 35-177 101-97 C157-76 166-9 113 30 C148 105 61 165 7 116 C-64 159-149 108-124 48 C-180 11-183-48-142-84Z" fill="url(#pc-hollow)"/>
       <path d="M-227 20 C-267-8-252-79-201-71 C-218-123-176-160-137-132 C-113-171-61-137-73-96 C-45-54-77-29-65 2 C-111 23-116 77-162 72 C-200 84-232 57-227 20Z" fill="url(#pc-fold-left)"/>
       <path d="M-103-188 C-143-231-104-279-62-260 C-50-311 21-309 43-263 C88-291 145-246 123-204 C171-181 160-132 118-122 C132-88 92-58 55-78 C27-50-18-68-20-101 C-63-78-112-116-91-150 C-112-158-118-176-103-188Z" fill="url(#pc-fold-top)"/>
       <path d="M112-64 C141-110 199-98 203-60 C249-79 282-36 259-6 C306 7 292 68 247 67 C268 112 220 150 187 118 C181 164 130 169 103 128 C74 126 69 87 92 67 C66 31 80-10 109-15 C91-29 96-51 112-64Z" fill="url(#pc-fold-right)"/>
       {/* The lower starch folds forward over the retained hull, rather than a radial rosette. */}
       <path d="M-121 75 C-115 25-62 14-42 53 C-16 37 5 53 4 79 C31 49 76 67 74 102 C109 130 96 180 62 184 C53 226 6 231-17 201 C-50 233-94 205-89 171 C-136 174-158 120-121 102Z" fill="url(#pc-fold-left)"/>
       <path d="M-49-12 C-33-44 8-39 18-15 C45-21 67 10 46 34 C62 61 27 83 7 62 C-18 87-55 63-43 37 C-72 24-70-3-49-12Z" fill="url(#pc-hollow)"/>
       <path d="M-39 9 Q-20-10-7 12 Q12 7 20 24 L-5 42-31 31Z" fill="#51301a"/>
       {/* Broad edge highlights expose volume; no repeated spoke/crease pattern. */}
       <path d="M-201-41 Q-212-76-180-88 M-78-233 Q-53-263-35-237 M3-268 Q32-270 42-242 M165-55 Q197-63 200-35 M212 14 Q243 9 250 34 M-99 111 Q-82 90-61 106" fill="none" stroke="#fffff4" strokeWidth="13" opacity=".68" strokeLinecap="round"/>
       <path d="M-70-100 Q-47-84-36-104 M86-91 Q99-111 118-115 M103 82 Q117 112 144 111 M-76 164 Q-47 159-35 181" fill="none" stroke="#ad7b3d" strokeWidth="8" opacity=".5" strokeLinecap="round"/>
      </g>
     </g>
     <path opacity={tween(f,270,295)} d="M-53 170Q-31 194-4 173 Q4 214 28 218 L42 169 65 186 43 243-4 253-42 225Z" fill="url(#pc-gold)" stroke="#b37228" strokeWidth="3"/>
    </g>
    {/* Two curved hull pieces originate at opposite outside edges; none cross the white center. */}
    {[-1,1].map(dir=>{const t=clamp((f-245)/64);const x=dir*(190+blossom*175+t*230);const y=dir<0?-37-t*140+t*t*270:42-t*80+t*t*280;return <g key={'hull'+dir} opacity={f>=245?1-tween(f,278,308):0} transform={`translate(${x} ${y}) rotate(${dir*(18+t*115)})`}><path d={dir<0?'M-14-99 Q-49-18-20 91 L9 72 Q-8-15 13-82Z':'M-7-87 Q37-17 19 85 L-12 65 Q6-13-27-65Z'} fill="url(#pc-gold)" stroke="#895121" strokeWidth="2"/><path d={dir<0?'M-5-68Q-20-6-4 55':'M-11-58Q13 0 7 55'} fill="none" stroke="#f5cd78" strokeWidth="5" opacity=".7"/></g>})}
   </g>
   {/* A soft steam release moves out of the object; it does not replace it. */}
   {[0,1,2,3,4].map(i=>{const t=clamp((f-250-i*3)/90);return <path key={i} d={`M${460+i*34} ${850-t*320}q${-45+i*12}-55 0-100q40-40 4-85`} fill="none" stroke="#f5efcd" strokeWidth="13" opacity={tween(f,251+i*2,261+i*2)*(1-t)*.18} filter="url(#pc-soft)"/>})}
  </svg>
  <div style={{...titleStyle,top:260,opacity:intro}}>An explosion.<br/><span style={{color:'#efbe70'}}>In a snack.</span></div>
  <div style={{...titleStyle,top:260,opacity:caption(58,132)}}>Inside a kernel.<br/><span style={{color:'#8ed6df'}}>A little water.</span></div>
  <div style={{...titleStyle,top:260,opacity:caption(140,241)}}>Water → steam.<br/><span style={{color:'#efbe70'}}>Pressure builds.</span></div>
  <div style={{...titleStyle,top:1210,opacity:tween(f,339,355),fontSize:72}}>The starch becomes<br/><span style={{color:'#efbe70'}}>the fluffy part.</span></div>
  <div style={{position:'absolute',left:100,top:1406,color:'#dfd4bf',fontFamily:'Inter',fontSize:26,letterSpacing:1}}>RECIPEFIX <span style={{marginLeft:25,opacity:.7}}>• ILLUSTRATED</span></div>
 </AbsoluteFill>;
};
