import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve('packages/marketing/phase1c');
const out = '/Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029/captures';
const disk = execFileSync('diskutil',['info','/Volumes/T9'],{encoding:'utf8'});
if(!/B1ADFFB0-BCCF-441A-8086-365120C88DB7/.test(disk)||!/FileVault:\s+Yes/.test(disk))throw Error('Verified encrypted T9 required.');
mkdirSync(out+'/raw',{recursive:true});
process.env.TMPDIR='/Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029/scratch';
const result=JSON.parse(readFileSync(root+'/assets/real-result.json','utf8'));
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,colorScheme:'light',recordVideo:{dir:out+'/raw',size:{width:390,height:844}}});
await ctx.addInitScript(()=>localStorage.setItem('rf_qa','1'));
const network=[],events=[];
await ctx.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());
 if(/posthog|analytics|googletagmanager|google-analytics/.test(u.hostname))return route.fulfill({status:204,body:''});
 if(u.pathname.includes('/functions/v1/')){
  const fn=u.pathname.split('/').pop();network.push({function:fn,method:req.method(),sentToProvider:false,recorded:fn==='adapt-recipe'});
  return route.fulfill({status:fn==='adapt-recipe'?200:503,contentType:'application/json',body:fn==='adapt-recipe'?JSON.stringify(result):'{"error":"Provider requests disabled for recorded demonstration"}'});
 }
 if(/supabase\.co$/.test(u.hostname)&&!['GET','HEAD','OPTIONS'].includes(req.method())){
  network.push({path:u.pathname,method:req.method(),sentToProvider:false,blockedWrite:true});
  return route.fulfill({status:403,contentType:'application/json',body:'{"error":"Writes disabled for QA capture"}'});
 }
 return route.continue();
});
const p=await ctx.newPage();const start=Date.now();
const mark=async name=>{events.push({name,at:(Date.now()-start)/1000});await p.screenshot({path:out+'/'+name+'.png'});};
try{
 const destination='https://recipefix.app/original-recipes/chicken-tikka-masala?utm_source=qa&utm_medium=social&utm_campaign=rf_headcount_1c&utm_content=qa_excluded';
 await p.goto(destination,{waitUntil:'domcontentloaded'});
 await p.getByRole('heading',{name:'Chicken Tikka Masala',exact:true}).waitFor();
 await p.waitForTimeout(500);await mark('original');
 await p.getByRole('button',{name:'Make it fit',exact:false}).click();
 await p.waitForTimeout(400);await mark('modal-four');
 await p.getByRole('button',{name:'Dairy-Free',exact:true}).click();
 await p.waitForTimeout(250);
 await p.getByRole('button',{name:'Increase servings',exact:true}).click();await p.waitForTimeout(350);
 await p.getByRole('button',{name:'Increase servings',exact:true}).click();await p.waitForTimeout(700);await mark('modal-six');
 await p.getByRole('button',{name:'Adapt recipe',exact:false}).click();
 await p.getByText('Chicken Tikka Masala with Coconut Cream',{exact:false}).first().waitFor({timeout:30000});
 await p.waitForTimeout(500);await mark('result');
 const step=p.getByText('Broil the Marinated Chicken',{exact:true});
 await step.scrollIntoViewIfNeeded();await p.waitForTimeout(600);await mark('broiler');
 const text=p.getByText(/spread in a single uncrowded layer on two foil-lined baking sheets/).first();
 await text.locator('..').screenshot({path:root+'/assets/broiler-proof.png'});
 await p.waitForTimeout(1300);
 writeFileSync(out+'/result-dom.txt',await p.locator('body').innerText());
 const local=await p.evaluate(()=>({first:JSON.parse(localStorage.getItem('rf_attribution_first')||'null'),last:JSON.parse(localStorage.getItem('rf_attribution_last')||'null'),qa:localStorage.getItem('rf_qa')}));
 writeFileSync(out+'/destination.json',JSON.stringify({url:p.url(),originalDestination:destination,originalHeadingVerified:true,makeItFitModalOpened:true,localAttribution:local,bundleUrls:await p.locator('script[src]').evaluateAll(s=>s.map(v=>v.src))},null,2)+'\n');
}catch(e){await p.screenshot({path:out+'/error.png'});writeFileSync(out+'/error-dom.txt',await p.locator('body').innerText());console.error(e.message);process.exitCode=1;}
finally{
 const video=p.video();await ctx.close();await video.saveAs(out+'/interaction.webm');await browser.close();
 writeFileSync(out+'/capture.json',JSON.stringify({mode:'Current live UI, exact recorded Oct21 production result fulfilled locally. No fresh adaptation.',date:'2026-10-29',viewport:[390,844],dpr:3,recording:[390,844],events,network,providerCalls:0,customerWrites:0,qaExcluded:true},null,2)+'\n');
 console.log(JSON.stringify({events,network,capture:out+'/capture.json'}));
}
