import React from 'react';

export const C = {cream:'#f5f0e6',ink:'#2b3029',orange:'#994329',gold:'#e6b64c',green:'#304c3b',light:'#e5e0d5'};
export const clamp = (x:number) => Math.min(1,Math.max(0,x));
export const ease = (x:number) => {const p=clamp(x);return p*p*(3-2*p);};
export const mix = (a:number,b:number,p:number) => a+(b-a)*p;
const pieces=Array.from({length:18},(_,i)=>({x:(i%6-2.5)*89,y:(Math.floor(i/6)-1)*105,r:(i*37)%52-26}));

export function Defs(){return <defs>
 <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f5f3ed"/><stop offset=".2" stopColor="#969d9e"/><stop offset=".47" stopColor="#eef0eb"/><stop offset=".7" stopColor="#a8b0af"/><stop offset="1" stopColor="#f4eee2"/></linearGradient>
 <linearGradient id="foil" x1="0" y1="0" x2="1" y2=".7"><stop stopColor="#c8cecc"/><stop offset=".4" stopColor="#f8f6ed"/><stop offset=".65" stopColor="#bfc8c7"/><stop offset="1" stopColor="#eef0e9"/></linearGradient>
 <radialGradient id="chicken" cx=".3" cy=".2"><stop stopColor="#e9a16c"/><stop offset=".55" stopColor="#d77e51"/><stop offset="1" stopColor="#a34731"/></radialGradient>
 <linearGradient id="oven" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#414844"/><stop offset="1" stopColor="#1a211e"/></linearGradient>
 <filter id="shadow"><feGaussianBlur stdDeviation="12"/></filter>
 </defs>;}

export function Chicken({x,y,angle=0,scale=1}:{x:number;y:number;angle?:number;scale?:number}){
 return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
  <path d="M-37-22Q-29-44-3-35Q18-46 36-25Q54-8 33 18Q26 46-1 32Q-28 43-40 18Q-56-5-37-22Z" fill="#6b3929" opacity=".15" transform="translate(3 7)"/>
  <path d="M-37-22Q-29-44-3-35Q18-46 36-25Q54-8 33 18Q26 46-1 32Q-28 43-40 18Q-56-5-37-22Z" fill="url(#chicken)" stroke="#b56d49" strokeWidth="1.5"/>
  <path d="M-28-17Q-21-27-4-21M13-24L27-13M-17 15L-1 20" fill="none" stroke="#f5bc89" strokeWidth="6" strokeLinecap="round" opacity=".6"/>
  <path d="M-12-11L-9-7M20 8L23 9M-28 2L-26 4M4 24L9 22" stroke="#743d2d" strokeWidth="3" opacity=".7"/>
 </g>;
}

export function Tray({x,y,scale=1,count=18,split=false,jam=0,label}:{x:number;y:number;scale?:number;count?:number;split?:boolean;jam?:number;label?:string}){
 return <g transform={`translate(${x} ${y}) scale(${scale})`}>
  <rect x="-330" y="-235" width="660" height="470" rx="42" fill="#18231c" opacity=".2" transform="translate(9 20)" filter="url(#shadow)"/>
  <rect x="-330" y="-235" width="660" height="470" rx="42" fill="url(#steel)" stroke="#7f8987" strokeWidth="5"/>
  <rect x="-304" y="-208" width="608" height="416" rx="24" fill="url(#foil)" stroke="#a3acab" strokeWidth="3"/>
  {Array.from({length:11},(_,i)=><path key={i} d={`M${-285+i*55} -195l17 90-28 62 23 94-11 131`} fill="none" stroke={i%2?'#fffdf4':'#a2adad'} strokeWidth={i%2?2:1.4} opacity=".45"/>)}
  {pieces.slice(0,count).map((p,i)=>{
   const x=split?((i%3)-1)*155:count===12?(i%4-1.5)*135:p.x;
   const y=split?(Math.floor(i/3)-1)*125:count===12?(Math.floor(i/4)-1)*125:p.y;
   return <Chicken key={i} x={x+(i>11?jam*Math.sin(i*2.1)*24:0)} y={y+(i>11?jam*25:0)} angle={p.r+jam*Math.sin(i)*13} scale={split?1.23:count===12?1.5:1.2}/>;
  })}
  {label?<g><circle cy="-253" r="35" fill={C.green}/><text y="-241" textAnchor="middle" fill={C.cream} fontFamily="Inter" fontWeight="600" fontSize="36">{label}</text></g>:null}
 </g>;
}

export function Broiler({x=540,y=1000,scale=1}:{x?:number;y?:number;scale?:number}){
 return <g transform={`translate(${x} ${y}) scale(${scale})`}>
  <rect x="-420" y="-305" width="840" height="610" rx="44" fill="#17271e" opacity=".18" transform="translate(0 20)" filter="url(#shadow)"/>
  <rect x="-420" y="-305" width="840" height="610" rx="44" fill="url(#oven)" stroke="#727972" strokeWidth="8"/>
  <rect x="-375" y="-250" width="750" height="465" rx="20" fill="#101b15"/>
  <path d="M-325-190H-260Q-240-190-240-165T-220-140H-160Q-140-140-140-165T-120-190H-60Q-40-190-40-165T-20-140H40Q60-140 60-165T80-190H140Q160-190 160-165T180-140H240Q260-140 260-165T280-190H330" fill="none" stroke="#eaa05e" strokeWidth="13" strokeLinecap="round"/>
  {[-140,-90,-40,10,60,110,160].map(y=><path key={y} d={`M-355 ${y}H355`} stroke="#74827b" strokeWidth="3" opacity=".65"/>)}
  <rect x="-320" y="240" width="640" height="18" rx="9" fill="#8a948b"/>
 </g>;
}

export function Sauce({x,y,scale=1}:{x:number;y:number;scale?:number}){return <g transform={`translate(${x} ${y}) scale(${scale})`}>
 <path d="M-160-45L-140 110Q0 190 140 110L160-45Z" fill={C.orange} stroke="#8d452d" strokeWidth="5"/><ellipse cy="-45" rx="160" ry="64" fill="#a04a2e"/><ellipse cy="-50" rx="143" ry="48" fill="#d77b47"/>
 <path d="M-152-8H-204Q-235 30-193 45H-144M152-8H204Q235 30 193 45H144" fill="none" stroke="#8d452d" strokeWidth="14"/>
 <path d="M-35-70Q-65-112-35-143M18-75Q-5-105 20-137" fill="none" stroke="#c4b9a3" strokeWidth="7" opacity=".6" strokeLinecap="round"/>
 </g>;}
