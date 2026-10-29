import React from 'react';
import {AbsoluteFill,Img,staticFile} from 'remotion';
const ink='#192f31',paper='#f6f0e3',rust='#9b4329',lime='#dcf087';
const Eyebrow=({n,dark=false,label}:{n:string;dark?:boolean;label:string})=><div style={{position:'absolute',left:72,right:72,top:55,display:'flex',justifyContent:'space-between',font:'600 24px Inter',letterSpacing:2,color:dark?paper:ink}}><span>RECIPEFIX / {label}</span><span>{n}</span></div>;
const Serif=({children,top=160,color=ink,size=105}:{children:React.ReactNode;top?:number;color?:string;size?:number})=><div style={{position:'absolute',left:72,right:72,top,font:`${size}px/.95 Instrument`,letterSpacing:-2,color}}>{children}</div>;
const Footer=({children,dark=false}:{children:React.ReactNode;dark?:boolean})=><div style={{position:'absolute',left:72,right:72,top:1213,font:'29px/1.35 Inter',color:dark?'#e1e8de':ink}}>{children}</div>;
export const SaltCard:React.FC<{page:number}>=({page})=><AbsoluteFill style={{background:page===2?paper:ink}}>
 {page===2&&<Eyebrow n="2/3" label="KITCHEN DETAILS"/>}
 {page===1?<>
  <Img src={staticFile('salt-material.png')} style={{position:'absolute',inset:0,width:1080,height:1350,objectFit:'cover'}}/>
  <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,#102729e8 0%,#102729bf 29%,transparent 56%,#102729a8 100%)'}}/>
  <Eyebrow n="1/3" dark label="KITCHEN DETAILS"/>
  <Serif color={paper} size={117}>Same spoon.<br/><em>Twice the salt.</em></Serif>
  <div style={{position:'absolute',left:74,top:430,font:'32px Inter',color:paper}}>One tablespoon isn’t one weight.</div>
  <Footer dark>Two kosher salts. One useful difference.<br/>Illustrated scene • Swipe for the chart.</Footer>
 </>:page===2?<>
  <Serif>Which kosher salt<br/>does it mean?</Serif>
  <div style={{position:'absolute',left:72,top:450,width:936,borderTop:`2px solid ${ink}`,borderBottom:`2px solid ${ink}`,padding:'38px 0'}}>
   {[['Diamond Crystal','8','1 tablespoon'],['Morton’s','16','1 tablespoon']].map(([name,value,unit],i)=><div key={name} style={{display:'grid',gridTemplateColumns:'1fr 270px',alignItems:'center',borderBottom:i===0?'1px solid #b4beb4':'none',padding:'26px 0'}}><div><div style={{font:'600 42px Inter',color:ink}}>{name}</div><div style={{font:'30px Inter',marginTop:15,color:'#526564'}}>{unit}</div></div><div style={{font:'130px/.9 Instrument',color:rust,textAlign:'right'}}>{value}<span style={{font:'40px Inter',marginLeft:12}}>g</span></div></div>)}
  </div>
  <div style={{position:'absolute',left:72,right:72,top:1010,font:'38px/1.35 Inter',color:ink}}>Same volume.<br/>Different amounts of salt.</div>
  <Footer>Published reference values from<br/>King Arthur Baking’s Ingredient Weight Chart.</Footer>
 </>:<>
  <Eyebrow n="3/3" dark label="KITCHEN DETAILS"/>
  <Serif color={paper}>Before you<br/><em>season by the spoon.</em></Serif>
  <div style={{position:'absolute',left:72,right:72,top:530,color:paper}}>
   <div style={{font:'600 50px/1.2 Inter',borderTop:'2px solid #829c92',paddingTop:40}}>Match the salt type.</div>
   <div style={{font:'36px/1.4 Inter',marginTop:25}}>A recipe’s “kosher salt” may<br/>be written for a different brand.</div>
   <div style={{font:'600 50px/1.2 Inter',borderTop:'2px solid #829c92',paddingTop:40,marginTop:60}}>Use its weight, if given.</div>
   <div style={{font:'36px/1.4 Inter',marginTop:25}}>Follow the recipe’s stated grams<br/>rather than swapping equal spoonfuls.</div>
  </div>
  <Footer dark>Same spoonful ≠ same salt weight.<br/>Check the recipe before you substitute.</Footer>
 </>}
</AbsoluteFill>;

export const AllspiceCard:React.FC<{page:number}>=({page})=><AbsoluteFill style={{background:paper}}>
 <Eyebrow n={`${page}/2`} label="PANTRY RIDDLE"/>
 {page===1?<>
  <div style={{position:'absolute',left:72,top:145,font:'600 24px Inter',letterSpacing:6,color:rust}}>THE NAME IS A TRAP.</div>
  <Serif top={220} size={128}>Allspice.</Serif>
  <div style={{position:'absolute',left:72,top:390,font:'44px/1.23 Inter',color:ink}}>One spice?<br/>Or a whole spice blend?</div>
  <div style={{position:'absolute',left:40,top:610,width:1000,height:530,overflow:'hidden',mixBlendMode:'multiply'}}><Img src={staticFile('allspice-berries.jpg')} style={{width:1300,height:897,objectFit:'cover',objectPosition:'left',transform:'translate(-75px,-110px)'}}/></div>
  <div style={{position:'absolute',left:72,top:1160,font:'600 33px Inter',color:rust}}>Pick your answer. Then swipe →</div>
  <div style={{position:'absolute',left:72,top:1250,font:'23px Inter',color:ink}}>Dried allspice fruits • Brian Arthur / CC BY 2.5 • cropped</div>
 </>:<>
  <Serif top={160} size={125}>One spice.<br/><em>One tree.</em></Serif>
  <div style={{position:'absolute',left:610,top:450,width:398,height:710,overflow:'hidden',border:'1px solid #bdb69f'}}><div style={{width:398,height:570,overflow:'hidden',mixBlendMode:'multiply'}}><Img src={staticFile('allspice-berries.jpg')} style={{width:1400,height:967,transform:'translate(-260px,-160px)'}}/></div><div style={{padding:'24px 26px',color:ink}}><div style={{font:'35px Instrument'}}><em>Pimenta dioica</em></div><div style={{font:'600 20px Inter',letterSpacing:3,marginTop:10}}>DRIED FRUIT</div></div></div>
  <div style={{position:'absolute',left:72,top:550,width:520,font:'39px/1.35 Inter',color:ink}}>Allspice comes from<br/>the dried, unripe fruit<br/>of <em>Pimenta dioica.</em></div>
  <div style={{position:'absolute',left:72,top:835,width:500,font:'34px/1.4 Inter',color:ink}}>Its flavor recalls cinnamon,<br/>clove and nutmeg.<br/><strong>The ingredient isn’t a blend.</strong></div>
  <div style={{position:'absolute',left:72,right:72,top:1210,font:'27px/1.35 Inter',color:ink}}>In spice cakes, sauces and pickles: one ingredient.<br/>Photo: Brian Arthur • CC BY 2.5 • cropped</div>
 </>}
</AbsoluteFill>;

export const SaltX:React.FC=()=><AbsoluteFill style={{background:ink}}>
 <Img src={staticFile('salt-material.png')} style={{position:'absolute',right:0,top:-175,width:610,height:900,objectFit:'cover'}}/>
 <div style={{position:'absolute',left:0,top:0,width:710,height:675,background:'linear-gradient(90deg,#192f31 83%,transparent)'}}/>
 <div style={{position:'absolute',left:65,top:49,font:'600 23px Inter',letterSpacing:2,color:lime}}>RECIPEFIX / KITCHEN DETAILS</div>
 <div style={{position:'absolute',left:65,top:125,font:'84px/1 Instrument',color:paper}}>Same tablespoon.<br/><em>Different salt.</em></div>
 <div style={{position:'absolute',left:65,top:365,font:'36px/1.5 Inter',color:paper}}>Diamond Crystal kosher: <strong>8 g</strong><br/>Morton’s kosher: <strong>16 g</strong></div>
 <div style={{position:'absolute',left:65,top:548,width:565,font:'26px/1.35 Inter',color:'#d9e5dd'}}>King Arthur Baking’s chart • per tablespoon<br/>Original 3D illustration</div>
</AbsoluteFill>;

export const AllspiceX:React.FC=()=><AbsoluteFill style={{background:paper}}>
 <div style={{position:'absolute',left:65,top:49,font:'600 23px Inter',letterSpacing:2,color:rust}}>RECIPEFIX / PANTRY RIDDLE</div>
 <div style={{position:'absolute',left:65,top:145,font:'108px/.95 Instrument',color:ink}}>Allspice isn’t<br/><em>a spice blend.</em></div>
 <div style={{position:'absolute',right:20,top:140,width:500,height:440,overflow:'hidden',mixBlendMode:'multiply'}}><Img src={staticFile('allspice-berries.jpg')} style={{width:650,height:450,objectFit:'cover',objectPosition:'left',transform:'translateX(-20px)'}}/></div>
 <div style={{position:'absolute',left:65,top:420,width:580,font:'34px/1.35 Inter',color:ink}}>It’s the dried, unripe fruit<br/>of <em>Pimenta dioica.</em></div>
 <div style={{position:'absolute',left:65,top:595,font:'32px Inter',color:ink}}>Photo: Brian Arthur • CC BY 2.5 • cropped</div>
</AbsoluteFill>;
