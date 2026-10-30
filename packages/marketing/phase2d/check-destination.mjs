import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(process.cwd()+'/package.json');
const {chromium}=require('@playwright/test');
const out='/Volumes/T9/Developer/Builds/recipefix-phase2d-20261029/preflight/destination';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const findings=[];
try{
 for(const route of ['/adapt']){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();const blocked=[];
  // Public route/attribution readback only: prevent acquisition, analytics,
  // auth and inference writes while visiting in a fresh automation context.
  await page.route('**/*',async request=>{
   const method=request.request().method();
   if(!['GET','HEAD'].includes(method)){blocked.push({method,host:new URL(request.request().url()).hostname});await request.abort();}
   else await request.continue();
  });
  const url=new URL(route,'https://recipefix.app');
  for(const [key,value] of Object.entries({utm_source:'tiktok',utm_medium:'social',utm_campaign:'rf_first_fortnight',utm_content:'rf-more-dinner-phase2d-qa'}))url.searchParams.set(key,value);
  const response=await page.goto(url.href,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2500);
  const visible=await page.evaluate(()=>({title:document.title,headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent),buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>b.textContent?.trim()).slice(0,18),inputs:[...document.querySelectorAll('textarea,input')].map(e=>({type:e.type,placeholder:e.getAttribute('placeholder')})),attribution:Object.fromEntries(Object.keys(localStorage).filter(k=>/attribution|acquisition/i.test(k)).map(k=>{let x;try{x=JSON.parse(localStorage[k])}catch{x={}}return[k,{utm_source:x.utm_source,utm_medium:x.utm_medium,utm_campaign:x.utm_campaign,utm_content:x.utm_content,landing_path:x.landing_path}]}))}));
  const image=out+'/'+(route==='/adapt'?'adapt':'original')+'-390.png';await page.screenshot({path:image});
  findings.push({requestedUrl:url.href,finalUrl:page.url(),httpStatus:response?.status(),...visible,blockedWrites:blocked,screenshot:image,limitation:'No adaptation, account creation, billing or social action submitted. Blocking writes and automation exclusion make this a route/UTM readback, not a live conversion join.'});
  await context.close();
 }
}finally{await browser.close();}
fs.writeFileSync(out+'/receipt.json',JSON.stringify({checkedAt:new Date().toISOString(),findings},null,2)+'\n');
console.log(JSON.stringify(findings.map(f=>({url:f.finalUrl,status:f.httpStatus,headings:f.headings,attribution:f.attribution,blockedWrites:f.blockedWrites.length}))));
