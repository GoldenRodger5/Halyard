import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const require=createRequire(join(here,'../../package.json'));
const {chromium}=require('@playwright/test');
const sharp=require('sharp');
const run=process.env.EDITORIAL_BUILD||'/Volumes/T9/Developer/Builds/recipefix-social-team-20261029/editorial';
for(const d of ['renders','evidence','scratch'])mkdirSync(join(run,d),{recursive:true});
mkdirSync(join(here,'exports'),{recursive:true});
const uri=(name)=>'data:'+ (name.endsWith('.webp')?'image/webp':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.ttf')?'font/ttf':'font/woff')+';base64,'+readFileSync(join(here,'assets',name)).toString('base64');
const photos={curry:uri('tikka-serving-inspiration.jpg'),soup:uri('roasted-butternut-squash-soup.webp'),roast:uri('lemon-herb-roast-chicken.webp')};
const colors={ink:'#182c2a',cream:'#f8f1e4',saffron:'#f3cb69',rust:'#9a4028',plum:'#342032',pink:'#f1dfda'};
const box=(x,y,w,h,content,style='',cls='')=>`<div class="box ${cls}" style="left:${x}px;top:${y}px;width:${w}px;${h?'height:'+h+'px;':''}${style}">${content}</div>`;
const text=(x,y,w,size,content,style='',cls='')=>box(x,y,w,0,content,`font-size:${size}px;${style}`,`text ${cls}`);
const img=(key,x,y,w,h,pos='50% 50%',style='')=>box(x,y,w,h,`<img src="${photos[key]}" style="object-position:${pos}"/>`,`overflow:hidden;${style}`,'art');
const tag=(x,y,w,content,dark=false)=>box(x,y,w,48,content,`background:${dark?colors.ink:colors.cream};color:${dark?colors.cream:colors.ink};font-size:30px;padding:9px 14px;letter-spacing:.1px;line-height:30px;`,'text tag');
const top=(n,total,label='THE DINNER PLAN')=>text(64,55,800,27,`RECIPEFIX / ${label}`,'font-weight:600;letter-spacing:2px;')+text(925,55,90,27,`${n}/${total}`,'text-align:right;font-weight:600;');
const foot=(content,dark=false)=>text(64,1275,952,29,content,`color:${dark?colors.cream:colors.ink};line-height:1.25;`,'footer');
const foil=(label)=>`<svg class="foil" viewBox="0 0 600 410" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="rim${label}" x2="1" y2="1"><stop stop-color="#fafbf5"/><stop offset=".2" stop-color="#9ba9a5"/><stop offset=".5" stop-color="#eef2ec"/><stop offset=".75" stop-color="#8c9d9a"/><stop offset="1" stop-color="#e0e6df"/></linearGradient><linearGradient id="base${label}" x2=".8" y2="1"><stop stop-color="#c0cfcb"/><stop offset=".4" stop-color="#ecf0e7"/><stop offset="1" stop-color="#acbdb6"/></linearGradient><filter id="shadow${label}" x="-.2" y="-.2" width="1.5" height="1.5"><feDropShadow dx="8" dy="18" stdDeviation="12" flood-color="#102a26" flood-opacity=".23"/></filter></defs><rect x="20" y="25" width="560" height="360" rx="36" fill="url(#rim${label})" stroke="#899c96" stroke-width="3" filter="url(#shadow${label})"/><rect x="44" y="49" width="512" height="312" rx="20" fill="url(#base${label})" stroke="#a1afa8" stroke-width="2"/>${Array.from({length:18},(_,i)=>`<path d="M${55+i*28} 60l${i%2?12:-9} 65 ${i%3?-11:8} 72 9 82-7 66" fill="none" stroke="${i%2?'#fffef5':'#7d9690'}" stroke-opacity="${i%2?'.65':'.18'}" stroke-width="${i%3?1.8:3}"/>`).join('')}<path d="M65 65H535M65 345H535" stroke="#fefef5" opacity=".7" stroke-width="3"/><circle cx="300" cy="180" r="62" fill="#182c2a"/><text x="300" y="202" text-anchor="middle" fill="#f8f1e4" font-family="Inter" font-size="66" font-weight="600">${label}</text></svg>`;
const sheets=(x,y,w,h,label,rot=0)=>box(x,y,w,h,foil(label),`transform:rotate(${rot}deg);`,'art');
let cards=[];
const add=(id,idea,platform,body,bg=colors.cream,width=1080,height=1350)=>cards.push({id,idea,platform,width,height,bg,body});
// Shared product parent: photographic field guide, rather than app instructions.
add('more-dinner-ig-1','rf-more-dinner','instagram',
 img('curry',0,0,1080,1350,'51% 50%')+
 box(0,0,1080,410,'',`background:${colors.cream};`)+top(1,5)+
 text(64,130,960,105,'More dinner.<br/>Same broiler.','font-weight:600;line-height:1.02;letter-spacing:-5px;')+
 tag(64,1050,380,'Serving inspiration')+
 box(0,1150,1080,200,'',`background:${colors.ink};`)+
 text(64,1190,950,43,'4 → 6 servings. The method moves, too.',`color:${colors.cream};font-weight:600;`)+
 text(64,1270,950,28,'A real RecipeFix dinner plan →',`color:${colors.saffron};`));
add('more-dinner-ig-2','rf-more-dinner','instagram',top(2,5)+
 text(64,150,950,80,'The chicken grows.','font-weight:600;letter-spacing:-3px;')+
 text(70,315,400,28,'FOUR SERVINGS','font-weight:600;letter-spacing:2px;')+
 text(650,315,360,28,'SIX SERVINGS','font-weight:600;letter-spacing:2px;')+
 text(64,370,440,183,'1½<span style="font-size:49px;letter-spacing:0;display:inline-block;margin-left:16px">lb</span>','font-weight:600;letter-spacing:-8px;')+
 text(490,415,150,103,'→',`color:${colors.rust};`)+
 text(650,370,400,183,'2¼<span style="font-size:49px;letter-spacing:0;display:inline-block;margin-left:16px">lb</span>','font-weight:600;letter-spacing:-8px;')+
 text(64,620,960,45,'The broiler space stays the same.','line-height:1.25;')+
 img('curry',64,740,952,440,'70% 45%','border-radius:4px;')+
 tag(80,1107,380,'Serving inspiration')+
 foot('Recorded Dairy-Free example · 4 → 6 servings'));
add('more-dinner-ig-3','rf-more-dinner','instagram',top(3,5)+
 text(64,145,960,96,'Two sheets.<br/>One broiler.','font-weight:600;letter-spacing:-5px;line-height:1.04;')+
 sheets(20,420,650,445,'1',-8)+sheets(465,680,590,403,'2',7)+
 text(64,1150,950,49,'Broil one sheet at a time.','font-weight:600;')+
 foot('Illustrated batch plan · recorded 6-serving result'),colors.saffron);
add('more-dinner-ig-4','rf-more-dinner','instagram',
 img('curry',0,0,1080,620,'70% 48%')+
 tag(64,535,380,'Serving inspiration')+
 text(64,685,950,100,'Then into<br/>the sauce.','font-weight:600;letter-spacing:-5px;line-height:1.03;')+
 text(64,935,900,45,'Promptly finish each broiler batch<br/>in the simmering sauce.','line-height:1.3;')+
 box(64,1120,952,91,'Full recipe: 165°F / 74°C internal check.',`background:${colors.ink};color:${colors.cream};padding:24px 30px;font-size:34px;font-weight:600;`,'text')+
 foot('One recorded RecipeFix result · October 21, 2026'));
add('more-dinner-ig-5','rf-more-dinner','instagram',
 img('curry',0,0,1080,1350,'32% 52%')+
 box(330,195,690,935,'',`background:${colors.cream};box-shadow:0 24px 70px #101c2240;`)+
 text(385,255,580,27,'RECIPEFIX ORIGINAL','letter-spacing:2px;font-weight:600;')+
 text(385,355,590,103,'Make it fit<br/>your table.','font-family:Serif;line-height:.98;letter-spacing:-2px;')+
 text(385,635,570,43,'Chicken Tikka Masala','font-weight:600;')+
 text(385,765,540,38,'Set your needs<br/>and servings.','line-height:1.25;')+
 box(385,925,575,103,'Open Original → Make it fit',`background:${colors.ink};color:${colors.cream};font-size:31px;line-height:1.3;padding:30px 22px;text-align:center;font-weight:600;`,'text')+
 tag(64,1215,380,'Serving inspiration')+
 tag(640,1215,376,'recipefix.app',true));
// X is a separate contribution and composition, with a reserved footer strip.
add('more-dinner-x','rf-more-dinner','x',
 img('curry',0,0,430,567,'72% 45%')+tag(24,492,380,'Serving inspiration')+
 text(485,52,660,72,'More dinner.<br/>Same broiler.','font-weight:600;line-height:1.03;letter-spacing:-3px;')+
 text(485,252,650,36,'4 → 6 servings · 1½ → 2¼ lb','font-weight:600;')+
 text(485,345,640,37,'Two sheets. Broil one at a time.<br/>Then finish each batch in sauce.','line-height:1.35;')+
 box(0,567,1200,108,'',`background:${colors.ink};`)+
 text(32,600,950,32,'Recorded Dairy-Free example · Oct 21, 2026',`color:${colors.cream};`,'footer')+
 text(1010,600,160,30,'RecipeFix',`color:${colors.saffron};font-weight:600;text-align:right;`,'footer'),colors.cream,1200,675);
// New qualified-reach parent: a tactile, quieter magazine world with two choices.
add('autumn-ig-1','rf-autumn-originals','instagram',
 text(64,55,960,27,'RECIPEFIX ORIGINALS / THE COOL-EVENING EDIT',`color:${colors.pink};letter-spacing:2px;font-weight:600;`)+
 text(64,145,960,120,'For darker<br/>evenings.',`color:${colors.cream};font-family:Serif;line-height:.95;letter-spacing:-2px;`)+
 text(70,425,900,36,'A bowl night. A roast night.<br/>Two recipes to make your own.',`color:${colors.pink};line-height:1.3;`)+
 img('soup',-25,590,720,580,'48% 45%','transform:rotate(-5deg);border:14px solid #f1dfda;box-shadow:0 20px 60px #130b1450;')+
 img('roast',560,755,550,445,'53% 50%','transform:rotate(7deg);border:14px solid #f8f1e4;box-shadow:0 20px 60px #130b1460;')+
 foot('Licensed serving inspiration · swipe to choose',true),colors.plum);
add('autumn-ig-2','rf-autumn-originals','instagram',
 img('soup',0,0,1080,765,'50% 50%')+
 tag(64,55,385,'01 / A BOWL NIGHT')+
 box(0,765,1080,585,'',`background:${colors.pink};`)+
 text(64,815,960,96,'Roasted butternut<br/>squash soup.','font-family:Serif;line-height:1.0;letter-spacing:-1px;')+
 text(64,1050,950,40,'Roast the squash.<br/>Add lemon at the finish.','line-height:1.3;')+
 text(64,1195,950,30,'60 MIN · SERVES 4 · RECIPEFIX ORIGINAL','font-weight:600;letter-spacing:1px;')+
 foot('Licensed serving inspiration · full recipe in app'),colors.pink);
add('autumn-ig-3','rf-autumn-originals','instagram',
 text(64,55,950,27,'02 / A ROAST NIGHT',`color:${colors.pink};font-weight:600;letter-spacing:2px;`)+
 text(64,160,970,105,'Lemon. Herbs.<br/>A Sunday roast.',`color:${colors.cream};font-family:Serif;line-height:.96;letter-spacing:-1px;`)+
 img('roast',64,460,952,640,'50% 50%','border-radius:3px;')+
 text(64,1135,960,39,'Lemon Herb Roast Chicken',`color:${colors.cream};font-weight:600;`)+
 text(64,1200,960,30,'90 MIN · SERVES 4 · includes a 15-minute rest',`color:${colors.pink};`)+
 foot('RecipeFix Original · licensed serving inspiration',true),colors.plum);
add('autumn-ig-4','rf-autumn-originals','instagram',
 text(64,55,960,27,'THE COOL-EVENING EDIT / RECIPEFIX ORIGINALS','font-weight:600;letter-spacing:2px;')+
 text(64,155,960,106,'Which evening<br/>are you cooking for?','font-family:Serif;line-height:.98;letter-spacing:-1px;')+
 img('soup',64,480,455,510,'50% 50%','border-radius:230px 230px 4px 4px;')+
 img('roast',561,480,455,510,'50% 50%','border-radius:230px 230px 4px 4px;')+
 text(64,1020,455,42,'A bowl night.','font-family:Serif;')+
 text(561,1020,455,42,'A roast night.','font-family:Serif;')+
 text(64,1135,960,40,'Find both in RecipeFix Originals.','font-weight:600;')+
 text(64,1200,960,32,'Open a recipe → Make it fit.','font-weight:600;')+
 foot('Licensed serving inspiration · full recipes in app'),colors.pink);
add('autumn-x','rf-autumn-originals','x',
 text(48,50,1100,25,'RECIPEFIX ORIGINALS / THE COOL-EVENING EDIT',`color:${colors.pink};letter-spacing:2px;font-weight:600;`)+
 text(48,115,550,83,'A bowl night.<br/>A roast night.',`color:${colors.cream};font-family:Serif;line-height:1.03;`)+
 text(48,355,490,35,'Which kind of evening<br/>are you cooking for?',`color:${colors.pink};line-height:1.3;`)+
 img('soup',620,125,260,385,'50% 50%','border-radius:135px 135px 5px 5px;')+
 img('roast',910,125,240,385,'50% 50%','border-radius:135px 135px 5px 5px;')+
 box(0,570,1200,105,'',`background:${colors.pink};`)+
 text(48,602,1100,32,'Two RecipeFix recipes · licensed serving inspiration',`color:${colors.plum};`,'footer'),colors.plum,1200,675);
const common=`@font-face{font-family:Inter;src:url(${uri('fonts/Inter-Regular.woff')})} @font-face{font-family:Inter;src:url(${uri('fonts/Inter-SemiBold.woff')});font-weight:600}@font-face{font-family:Serif;src:url(${uri('fonts/InstrumentSerif-Regular.ttf')})}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Inter;color:${colors.ink};-webkit-font-smoothing:antialiased}.canvas{position:relative;overflow:hidden}.box{position:absolute}.text{line-height:1.13}.box img{width:100%;height:100%;object-fit:cover;display:block}.foil{width:100%;height:100%;display:block}.footer{z-index:20}`;
const browser=await chromium.launch({headless:true});
let receipts=[];
try{for(const c of cards){
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>${common}</style></head><body><main class="canvas" style="width:${c.width}px;height:${c.height}px;background:${c.bg}">${c.body}</main></body></html>`;
 writeFileSync(join(run,'scratch',c.id+'.html'),html);
 const page=await browser.newPage({viewport:{width:c.width,height:c.height},deviceScaleFactor:1});await page.setContent(html);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
 const layout=await page.locator('.canvas').evaluate(el=>[...el.querySelectorAll('.box')].map((e,i)=>{const r=e.getBoundingClientRect();return {i,type:e.className,text:e.classList.contains('text')?e.textContent:null,x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflow:getComputedStyle(e).overflow}}));
 const png=join(run,'renders',c.id+'.png');await page.screenshot({path:png});
 const file=join(here,'exports',c.id+'.jpg');await sharp(png).jpeg({quality:96,chromaSubsampling:'4:4:4'}).toFile(file);
 await sharp(file).resize(390).png().toFile(join(run,'evidence',c.id+'-390.png'));
 receipts.push({id:c.id,ideaId:c.idea,platform:c.platform,width:c.width,height:c.height,path:'exports/'+c.id+'.jpg',layout});
 await page.close();console.log('rendered '+c.id);
}}finally{await browser.close()}
writeFileSync(join(run,'evidence','layout-final.json'),JSON.stringify(receipts,null,2));
writeFileSync(join(here,'render-receipt.json'),JSON.stringify({renderedAt:new Date().toISOString(),renderer:'Existing Playwright Chromium + Sharp; local fonts/assets; no network or paid calls',cards:receipts.map(({layout,...x})=>x)},null,2));
