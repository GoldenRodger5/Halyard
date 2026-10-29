import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(process.cwd()+'/package.json');
const {chromium}=require('@playwright/test');
const browser=await chromium.launch({headless:true});
const routes=[['chicken-tikka-masala','Chicken Tikka Masala'],['roasted-butternut-squash-soup','Roasted Butternut Squash Soup'],['lemon-herb-roast-chicken','Lemon Herb Roast Chicken']];
const results=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 // Read-only UI check: forbid writes, including auth creation and inference.
 await page.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
 for(const [slug,name] of routes){
  const url=`https://recipefix.app/original-recipes/${slug}?rf_qa=1&utm_source=qa&utm_medium=social&utm_campaign=rf_first_fortnight&utm_content=destination_qa`;
  try{
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
   await page.getByText(name,{exact:false}).first().waitFor({timeout:15000});
   const text=await page.locator('body').innerText();
   results.push({slug,status:response?.status(),finalUrl:page.url(),recipeTitleVisible:text.toLowerCase().includes(name.toLowerCase()),makeItFitVisible:/make it fit/i.test(text),scope:'Read-only public page, QA parameters, no CTA submission/inference/customer write.'});
  }catch(error){results.push({slug,error:String(error).slice(0,250),scope:'Route not proven by this run; source-pinned route remains separate evidence.'});}
 }
}finally{await browser.close();}
const output=new URL('./destination-receipt.json',import.meta.url);
fs.writeFileSync(output,JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
console.log(JSON.stringify(results));
