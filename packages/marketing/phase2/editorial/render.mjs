import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const require=createRequire(join(here,'../../package.json'));
const {chromium}=require('@playwright/test');const sharp=require('sharp');
const run='/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/editorial';
for(const d of ['renders','evidence','scratch'])mkdirSync(join(run,d),{recursive:true});mkdirSync(join(here,'exports'),{recursive:true});
const uri=n=>'data:'+(n.endsWith('.jpg')?'image/jpeg':n.endsWith('.ttf')?'font/ttf':'font/woff')+';base64,'+readFileSync(join(here,'assets',n)).toString('base64');
const p={coconut:uri('coconut.jpg'),red:uri('red-tomatoes.jpg'),green:uri('green-tomatoes.jpg')};
const C={ink:'#191d2a',white:'#fffdf8',coral:'#ff9b88',blue:'#d7edff',red:'#ad281d',cobalt:'#293ca6'};
const box=(x,y,w,h,s,style='',cl='')=>`<div class="box ${cl}" style="left:${x}px;top:${y}px;width:${w}px;${h?'height:'+h+'px;':''}${style}">${s}</div>`;
const t=(x,y,w,size,s,style='',cl='')=>box(x,y,w,0,s,`font-size:${size}px;${style}`,'text '+cl);
const photo=(name,x,y,w,h,pos='50% 50%',style='')=>box(x,y,w,h,`<img src="${p[name]}" style="object-position:${pos}"/>`,'overflow:hidden;'+style,'art');
const head=(n,total,label,light=false)=>t(60,48,850,27,'RECIPEFIX / '+label,`font-weight:600;letter-spacing:1.6px;color:${light?C.white:C.ink};`)+t(920,48,100,27,n+'/'+total,`text-align:right;color:${light?C.white:C.ink};`);
const foot=(s,light=false)=>t(60,1270,960,29,s,`line-height:1.3;color:${light?C.white:C.ink};`,'footer');
const rule=(y,color=C.ink)=>box(60,y,960,2,'',`background:${color};`);
const pill=(x,y,w,s,bg=C.white,fg=C.ink)=>box(x,y,w,52,s,`background:${bg};color:${fg};border-radius:28px;padding:12px 22px;font-size:26px;line-height:28px;font-weight:600;`,'text');
const source=JSON.parse(readFileSync(join(here,'assets/historical-result.json')));
const record='Recorded Dairy-Free + 6-serving example · Oct 21, 2026';
const spoon=(thick)=>`<svg viewBox="0 0 450 500"><defs><linearGradient id="metal${thick}" x2="1" y2="1"><stop stop-color="#758493"/><stop offset=".35" stop-color="#fff"/><stop offset=".65" stop-color="#a7b2bc"/><stop offset="1" stop-color="#f7fafb"/></linearGradient><linearGradient id="yog${thick}" x2="1" y2="1"><stop stop-color="#fffdf8"/><stop offset=".7" stop-color="#e6e0d5"/><stop offset="1" stop-color="#cac2b6"/></linearGradient></defs><g transform="rotate(-20 225 250)"><rect x="204" y="208" width="42" height="275" rx="20" fill="url(#metal${thick})"/><ellipse cx="225" cy="153" rx="102" ry="143" fill="url(#metal${thick})"/><ellipse cx="225" cy="145" rx="89" ry="126" fill="url(#yog${thick})"/>${thick?'<path d="M162 144Q184 75 246 78T274 173Q235 238 183 207Q220 175 254 147Q209 183 162 144Z" fill="#fffdf8"/><path d="M181 156Q210 110 257 111" stroke="#d0c8bd" fill="none" stroke-width="8" stroke-linecap="round"/>':'<path d="M220 264Q223 310 218 350Q237 375 242 345L236 261" fill="#e6e0d5"/><ellipse cx="230" cy="400" rx="16" ry="26" fill="#e6e0d5"/>'}</g></svg>`;
let cards=[];const add=(id,idea,body,bg=C.white,w=1080,h=1350)=>cards.push({id,idea,platform:id.endsWith('-x')?'x':'instagram',width:w,height:h,body,bg});
add('marinade-ig-1','rf-marinade-job',head(1,4,'THE INGREDIENT’S JOB',true)+
 t(60,142,960,108,'Your yogurt swap<br/>has a job to do.',`font-weight:600;line-height:1.02;letter-spacing:-5px;color:${C.white};`)+
 photo('coconut',145,470,790,650,'50% 48%','border-radius:390px 390px 34px 34px;')+
 pill(555,1000,440,'COAT. NOT JUST SWAP.',C.coral)+
 t(60,1160,940,39,'One real tikka marinade. One useful detail.',`color:${C.white};`)+foot(record,true),C.ink);
add('marinade-ig-2','rf-marinade-job',head(2,4,'THE SWAP')+
 t(60,145,960,99,'Milk out.<br/>The job stays.','font-weight:600;line-height:1;letter-spacing:-4px;')+
 t(60,405,960,31,'ORIGINAL MARINADE','font-weight:600;letter-spacing:2px;')+
 t(60,463,960,52,'Plain whole-milk yogurt','font-family:Serif;')+
 t(60,550,130,80,'↓',`color:${C.cobalt};`)+
 box(60,675,960,430,'',`background:${C.white};border:3px solid ${C.ink};box-shadow:12px 12px 0 ${C.ink};`)+
 t(95,708,880,27,'RECIPEFIX’S RECORDED INGREDIENT','font-weight:600;letter-spacing:1px;')+
 t(95,790,880,68,'Plain. Unsweetened.','font-weight:600;letter-spacing:-2px;')+
 t(95,892,880,61,'Dairy-free coconut yogurt','font-family:Serif;line-height:1.1;')+
 t(95,1010,880,31,'Check the ingredient list, not just the front label.')+
 t(60,1153,960,37,'For an acidic, coating marinade — without dairy.')+foot(record),C.coral);
add('marinade-ig-3','rf-marinade-job',head(3,4,'THE TEXTURE')+
 t(60,145,960,108,'Thick beats thin.<br/>Here.','font-weight:600;line-height:1.01;letter-spacing:-5px;')+
 box(30,405,500,560,spoon(true),'','art')+box(550,405,500,560,spoon(false),'','art')+
 pill(130,1005,300,'THICK + CULTURED',C.coral)+pill(650,1005,245,'THIN',C.blue)+
 t(60,1112,960,39,'“a thick, cultured variety clings better<br/>than a thin yogurt.”','line-height:1.25;')+
 foot('Recorded method note · illustrative texture, not a test'),C.white);
add('marinade-ig-4','rf-marinade-job',head(4,4,'THE METHOD',true)+
 t(60,150,960,125,'Stir.<br/>Then coat.',`color:${C.white};font-family:Serif;line-height:.91;`)+
 rule(475,C.white)+t(60,530,940,28,'ACTUAL RECIPEFIX METHOD NOTE',`color:${C.coral};font-weight:600;letter-spacing:1px;`)+
 t(60,605,960,54,'“Stir the coconut yogurt<br/>smooth before coating<br/>the chicken.”',`color:${C.white};line-height:1.21;`)+
 t(60,875,940,39,'A swap worth checking in the method, too.',`color:${C.white};`)+
 box(60,1010,960,145,'',`background:${C.coral};border-radius:4px;`)+t(90,1040,900,42,'Chicken Tikka Masala Original','font-weight:600;')+t(90,1102,900,32,'Open RecipeFix → Make it fit → read the full method')+
 foot(record,true),C.cobalt);
add('marinade-x','rf-marinade-job',
 photo('coconut',0,0,395,565,'50% 50%')+
 t(445,48,705,27,'RECIPEFIX / THE INGREDIENT’S JOB','font-weight:600;letter-spacing:1px;')+
 t(445,115,705,75,'Your yogurt swap<br/>has a job to do.','font-weight:600;line-height:1.01;letter-spacing:-3px;')+
 t(445,315,695,39,'Plain + unsweetened coconut yogurt.<br/>Thick and cultured, so it clings.','line-height:1.3;')+
 t(445,455,695,34,'Recorded note: stir smooth before coating.')+
 box(0,565,1200,110,'',`background:${C.coral};`)+t(32,602,1140,29,'Recorded Dairy-Free + 6-serving example · Oct 21, 2026','font-weight:600;','footer'),C.white,1200,675);
// Produce-desk direction: blue newsprint, red rules, full-bleed macro photographs.
add('tomato-ig-1','rf-tomato-clock',head(1,4,'THE PRODUCE DESK')+
 t(60,148,960,115,'Counter?<br/>Fridge?','font-family:Serif;line-height:.9;')+
 photo('green',60,455,465,610,'60% 48%','border-radius:240px 240px 0 0;')+
 photo('red',555,455,465,610,'51% 48%','border-radius:240px 240px 0 0;')+
 box(60,1098,960,106,'',`background:${C.red};`)+t(88,1126,910,44,'First question: is it ripe?',`color:${C.white};font-weight:600;`)+foot('Whole tomatoes and cut tomatoes have different rules.'),C.blue);
add('tomato-ig-2','rf-tomato-clock',photo('green',0,0,1080,835,'60% 55%')+
 pill(60,50,390,'01 / WHOLE + UNDERRIPE')+
 box(0,835,1080,515,'',`background:${C.blue};`)+
 t(60,885,960,114,'Counter first.','font-family:Serif;letter-spacing:-2px;')+
 t(60,1055,960,44,'Let it ripen at room temperature,<br/>away from direct sunlight.','line-height:1.25;')+
 foot('Source: Iowa State University Extension'),C.blue);
add('tomato-ig-3','rf-tomato-clock',head(3,4,'WHOLE + RIPE',true)+
 t(60,145,960,102,'Ripe, but<br/>not tonight?',`font-family:Serif;line-height:.94;color:${C.white};`)+
 photo('red',60,430,960,520,'51% 48%','border-radius:4px;')+
 box(60,905,960,260,'',`background:${C.white};box-shadow:10px 10px 0 #641d16;`)+
 t(92,939,895,45,'Use soon. If it will spoil first,<br/>refrigerate for a few days.','font-weight:600;line-height:1.25;')+
 t(92,1084,895,30,'A short pause — with a flavor and texture tradeoff.')+
 foot('Source: Iowa State Extension · whole ripe tomatoes',true),C.red);
const cutTom=`<svg viewBox="0 0 560 500"><defs><radialGradient id="tom"><stop stop-color="#f3a364"/><stop offset=".72" stop-color="#f26043"/><stop offset="1" stop-color="#b8251b"/></radialGradient></defs><ellipse cx="280" cy="260" rx="233" ry="202" fill="url(#tom)" stroke="#8c211b" stroke-width="9"/><path d="M280 78L294 232L457 171L313 270L426 400L277 299L130 407L243 269L98 159L265 232Z" fill="#f6b68e"/>${[0,1,2,3,4].map((n)=>`<g transform="rotate(${n*72} 280 260)"><path d="M256 130Q281 94 307 135L302 207Q280 226 258 205Z" fill="#982d20"/><ellipse cx="272" cy="158" rx="7" ry="13" fill="#f9dd9b"/><ellipse cx="292" cy="186" rx="7" ry="13" fill="#f9dd9b"/></g>`).join('')}</svg>`;
add('tomato-ig-4','rf-tomato-clock',head(4,4,'THE CUT CHANGES IT')+
 t(60,145,960,111,'Cut changes<br/>the rule.','font-family:Serif;line-height:.92;')+
 box(560,400,500,450,cutTom,'transform:rotate(12deg);','art')+
 t(60,475,540,32,'COVER + REFRIGERATE','font-weight:600;letter-spacing:1px;')+
 t(60,580,500,150,'40°F','font-weight:600;letter-spacing:-5px;')+
 t(64,760,480,38,'4°C or colder','font-weight:600;')+
 t(64,835,450,40,'Within 2 hours.','font-weight:600;')+
 box(60,935,960,190,'',`background:${C.ink};`)+t(90,974,895,39,'Hotter than 90°F / 32°C?<br/>Make that 1 hour.',`color:${C.white};line-height:1.3;font-weight:600;`)+
 t(60,1175,960,34,'The counter advice above is for whole tomatoes.')+
 foot('Sources: UC Davis Health + FDA · illustration'),C.blue);
add('tomato-x','rf-tomato-clock',
 t(44,40,1100,26,'RECIPEFIX / THE PRODUCE DESK','font-weight:600;letter-spacing:1.5px;')+
 t(44,110,735,75,'Counter or fridge?<br/>Ripeness first.','font-family:Serif;line-height:.94;')+
 photo('red',805,50,350,410,'50% 50%','border-radius:180px 180px 5px 5px;')+
 t(44,318,735,34,'Whole + underripe → counter, out of sun.<br/>Whole + ripe → fridge if it will spoil first.','line-height:1.4;')+
 t(44,465,1110,31,'Cut → cover + chill at 40°F / 4°C or colder within 2 hours.','font-weight:600;')+
 box(0,565,1200,110,'',`background:${C.ink};`)+t(32,599,1140,28,'1 hour above 90°F / 32°C · Sources: Iowa State, UC Davis + FDA',`color:${C.white};`,'footer'),C.blue,1200,675);
const common=`@font-face{font-family:Inter;src:url(${uri('fonts/Inter-Regular.woff')})}@font-face{font-family:Inter;src:url(${uri('fonts/Inter-SemiBold.woff')});font-weight:600}@font-face{font-family:Serif;src:url(${uri('fonts/InstrumentSerif-Regular.ttf')})}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Inter;color:${C.ink};-webkit-font-smoothing:antialiased}.canvas{position:relative;overflow:hidden}.box{position:absolute}.text{line-height:1.13}.box img{width:100%;height:100%;object-fit:cover;display:block}.art svg{width:100%;height:100%;display:block}.footer{z-index:20}`;
const browser=await chromium.launch({headless:true});let receipt=[];
try{for(const c of cards){const html=`<!doctype html><html><head><meta charset="utf-8"><style>${common}</style></head><body><main class="canvas" style="width:${c.width}px;height:${c.height}px;background:${c.bg}">${c.body}</main></body></html>`;writeFileSync(join(run,'scratch',c.id+'.html'),html);const page=await browser.newPage({viewport:{width:c.width,height:c.height}});await page.setContent(html);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});const layout=await page.locator('.canvas').evaluate(el=>[...el.querySelectorAll('.box')].map((e,i)=>{const r=e.getBoundingClientRect();return{i,type:e.className,text:e.classList.contains('text')?e.textContent:null,x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflow:getComputedStyle(e).overflow}}));const png=join(run,'renders',c.id+'.png');await page.screenshot({path:png});await sharp(png).jpeg({quality:96,chromaSubsampling:'4:4:4'}).toFile(join(here,'exports',c.id+'.jpg'));await sharp(png).resize(390).png().toFile(join(run,'evidence',c.id+'-390.png'));receipt.push({id:c.id,ideaId:c.idea,platform:c.platform,width:c.width,height:c.height,path:'exports/'+c.id+'.jpg',layout});await page.close();console.log('rendered '+c.id)}}finally{await browser.close()}
writeFileSync(join(run,'evidence/layout-final.json'),JSON.stringify(receipt,null,2));writeFileSync(join(here,'render-receipt.json'),JSON.stringify({renderedAt:new Date().toISOString(),cards:receipt.map(({layout,...c})=>c)},null,2)+'\n');
