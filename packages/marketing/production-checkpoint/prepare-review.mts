import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateIdea,validateVariant,checkQueueReadiness,fingerprintVariant,type CreativeIdea,type PlatformVariant,type CreativeQualityReview} from '../src/socialStudioContract.js';

// Local authoring adapter only: no provider imports, account lookup or submission.
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const reviewPath=path.join(here,'independent-review.json');
const reviews:CreativeQualityReview[]=fs.existsSync(reviewPath)?JSON.parse(fs.readFileSync(reviewPath,'utf8')).reviews:[];
const ideaMap=new Map<string,CreativeIdea>();
const variants:PlatformVariant[]=[];
const variantRoots=new Map<string,string>();
const streams:string[]=[];
for(const stream of ['video','editorial','food']){
 const sourceRoot=process.env[`RECIPEFIX_${stream.toUpperCase()}_ROOT`]??root;
 const file=path.join(sourceRoot,'packages/marketing/production-checkpoint',stream,'handoff.json');
 if(!fs.existsSync(file))continue;
 const packet=JSON.parse(fs.readFileSync(file,'utf8'));
 streams.push(stream);
 for(const idea of packet.ideas??[]){
  const errors=validateIdea(idea);if(errors.length)throw Error(`${idea.id}: ${errors.join(', ')}`);
  if(!ideaMap.has(idea.id))ideaMap.set(idea.id,idea);
 }
 for(const v of packet.variants??[]){
  const errors=validateVariant(v);if(errors.length)throw Error(`${v.id}: ${errors.join(', ')}`);
  if(v.account||v.scheduledAt)throw Error(`${v.id}: review packet must not fabricate account/time`);
  for(const asset of v.media){
   const full=path.isAbsolute(asset.path)?asset.path:path.join(sourceRoot,asset.path);
   const digest=createHash('sha256').update(fs.readFileSync(full)).digest('hex');
   if(digest!==asset.sha256)throw Error(`Media hash mismatch: ${asset.path}`);
  }
  if(variants.some(x=>x.id===v.id))throw Error(`Duplicate variant ${v.id}`);
  variants.push(v);
  variantRoots.set(v.id,sourceRoot);
 }
}
if(!streams.length)throw Error('No finished specialist handoff found');
for(const variant of variants){
 if(!ideaMap.has(variant.ideaId))throw Error(`Variant ${variant.id} has no parent idea`);
}
const titles:Record<string,string>={'rf-more-dinner':'More dinner','rf-autumn-originals':'The evening edit','rf-salt-volume':'Same spoon','rf-allspice-quiz':'Allspice quiz'};
const notes:Record<string,string>={
 'rf-more-dinner':'A recorded 4→6-serving, Dairy-Free result. Food footage/photos are serving context; the sheet-pan scene illustrates its actual batch instruction. This is not a cooked-result test. Sound needs your listening review.',
 'rf-autumn-originals':'Two real RecipeFix Originals, shown with licensed serving inspiration. The photographs do not establish the exact cooked recipe or a dietary result.',
 'rf-salt-volume':'Published King Arthur chart values, with original illustrative 3D spoons. No live weighing is implied.',
 'rf-allspice-quiz':'A real pantry ingredient and a two-card reveal. Photography is licensed and credited; factual identity is sourced.'
};
const ideas=[...ideaMap.values()].map(idea=>{
 const nativeVariants=variants.filter(v=>v.ideaId===idea.id).map(variant=>{
  const sourceRoot=variantRoots.get(variant.id)!;
  const media=variant.media.map(asset=>({
   ...asset,path:path.isAbsolute(asset.path)?asset.path:path.join(sourceRoot,asset.path)
  }));
  return {...variant,media};
 });
 return {...idea,shortTitle:titles[idea.id],reviewNote:notes[idea.id],variants:nativeVariants};
});
const catalog={generatedAt:new Date().toISOString(),streams,ideas};
const readiness=variants.map(v=>({id:v.id,fingerprint:fingerprintVariant(v),...checkQueueReadiness(v,reviews.find(r=>r.variantId===v.id)??null,null,null)}));
if(readiness.some(x=>x.ready))throw Error('Review-only packet unexpectedly publishable');
fs.writeFileSync(path.join(here,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(here,'offline-readiness.json'),JSON.stringify({checkedAt:new Date().toISOString(),streams,parents:ideaMap.size,variants:variants.length,readiness},null,2)+'\n');
console.log(JSON.stringify({streams,parents:ideaMap.size,variants:variants.length,ready:0}));
