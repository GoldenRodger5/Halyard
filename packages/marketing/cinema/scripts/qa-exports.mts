import{execFileSync}from'node:child_process';import{writeFileSync}from'node:fs';import path from'node:path';import{qaStill}from'../../src/qa/image.js';
const root=path.resolve('packages/marketing/cinema');const out='/Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/review';
const checks:Array<{candidate:string;at:number;intended:string[]}>= [
 {candidate:'a',at:1.2,intended:['The cream','changed.','So did the method.','Recorded-result demo']},
 {candidate:'a',at:5.8,intended:['Dairy-free.','For six.','Recorded-result demo']},
 {candidate:'a',at:8.5,intended:['Heavy cream','Coconut cream.','Recorded-result demo']},
 {candidate:'a',at:12.5,intended:['Whisk it','smooth.','RecipeFix changed this step','Recorded-result demo']},
 {candidate:'a',at:16,intended:['Then simmer','gently.','Recorded-result demo']},
 {candidate:'a',at:21,intended:['RecipeFix','Make your recipe fit.','recipefix.app','Recorded-result demo']},
 {candidate:'b',at:1.2,intended:['New cream.','New method.','Recorded-result demo']},
 {candidate:'b',at:5,intended:['Make it fit.','Dairy-free. For six.','Recorded-result demo']},
 {candidate:'b',at:8.5,intended:['A different','kind of cream.','Heavy','cream','Full-fat','coconut cream','Recorded-result demo']},
 {candidate:'b',at:12.5,intended:['The instructions','change with it.','Whisk it smooth.','RecipeFix changed this step','Recorded-result demo']},
 {candidate:'b',at:16,intended:['Keep it gentle.','Keep the sauce at a gentle simmer.','Recorded-result demo']},
 {candidate:'b',at:21.5,intended:['Your recipe.','Rethought.','Ingredients and method,','changed together.','recipefix.app','Recorded-result demo']}
];
const results=[];
for(const c of checks){const png=execFileSync('ffmpeg',['-v','error','-ss',String(c.at),'-i',path.join(root,`review/candidate-${c.candidate}.mp4`),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{maxBuffer:32*1024*1024});const report=await qaStill({png,intended:c.intended,safeBox:{x0:90,y0:240,x1:920,y1:1460},canvas:{width:1080,height:1920},minWordHeight:24,label:`${c.candidate}@${c.at}`});results.push({...c,...report});console.log(JSON.stringify({candidate:c.candidate,at:c.at,passed:report.passed,failed:report.checks.filter(x=>!x.passed)}));}
writeFileSync(path.join(out,'export-text-qa.json'),JSON.stringify({kind:'Critical-copy OCR/readability supporting check; not creative approval',safeBox:{x0:90,y0:240,x1:920,y1:1460},minWordHeight:24,results},null,2)+'\n');
if(results.some(x=>!x.passed))process.exitCode=1;
