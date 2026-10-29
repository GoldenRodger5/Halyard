import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateIdea,validateVariant,checkQueueReadiness,fingerprintVariant,type CreativeIdea,type PlatformVariant,type CreativeQualityReview,type CreativeAsset} from '../src/socialStudioContract.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const ideas=new Map<string,CreativeIdea>();
const variants:PlatformVariant[]=[];
const roots=new Map<string,string>();
const keepIds=new Set(['rf-salt-volume','rf-autumn-originals']);
const streams:string[]=[];
const reviews:CreativeQualityReview[]=fs.existsSync(path.join(here,'independent-review.json'))?JSON.parse(fs.readFileSync(path.join(here,'independent-review.json'),'utf8')).reviews:[];

function addPacket(file:string,sourceRoot:string,onlyKeep=false){
 if(!fs.existsSync(file))return;
 const packet=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const idea of packet.ideas??[]){
  if(onlyKeep&&!keepIds.has(idea.id))continue;
  const errors=validateIdea(idea);if(errors.length)throw Error(`${idea.id}: ${errors.join('; ')}`);
  if(!ideas.has(idea.id))ideas.set(idea.id,idea);
 }
 for(const variant of packet.variants??[]){
  if(onlyKeep&&!keepIds.has(variant.ideaId))continue;
  const errors=validateVariant(variant);if(errors.length)throw Error(`${variant.id}: ${errors.join('; ')}`);
  if(variant.account||variant.scheduledAt)throw Error('This is a review packet, without invented account/time authority');
  if(variants.some(v=>v.id===variant.id))throw Error('Duplicate variant '+variant.id);
  for(const asset of variant.media){
   const file=path.isAbsolute(asset.path)?asset.path:path.join(sourceRoot,asset.path);
   const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   if(hash!==asset.sha256)throw Error('Changed media '+asset.path);
  }
  variants.push(variant);roots.set(variant.id,sourceRoot);
 }
}

for(const stream of ['food','editorial'])addPacket(path.join(root,'packages/marketing/production-checkpoint',stream,'handoff.json'),root,true);
for(const stream of ['video','editorial','food']){
 const sourceRoot=process.env[`RECIPEFIX_${stream.toUpperCase()}_ROOT`]??root;
 const upgradedProduct=path.join(root,'packages/marketing/phase2/cinema/product-handoff.json');
 const file=stream==='video'&&fs.existsSync(upgradedProduct)?upgradedProduct:path.join(sourceRoot,'packages/marketing/phase2',stream,'handoff.json');
 if(fs.existsSync(file)){addPacket(file,file===upgradedProduct?root:sourceRoot);streams.push(stream);}
}
for(const variant of variants)if(!ideas.has(variant.ideaId))throw Error('Missing parent '+variant.ideaId);
const descriptions:Record<string,string>={
 'rf-salt-volume':'The kept salt comparison, preserved with its published-reference framing.',
 'rf-autumn-originals':'The kept seasonal soup-or-roast editorial direction.',
 'rf-marinade-job':'A real ingredient swap has a texture and method consequence.',
 'rf-tomato-clock':'A useful whole-versus-cut tomato storage decision.',
 'rf-more-dinner':'A rebuilt physical cooking-space story, using the recorded RecipeFix example.'
};
const verdicts:Record<string,string>={
 'rf-more-dinner':'NEW FILM · The image-first rebuild replaces the held orange CGI with a single generated physical action and genuine recorded RecipeFix evidence. The self-propelling tray is illustrative; this is not a filmed kitchen test. Founder review and eventual narration remain separate.',
 'rf-marinade-job':'KEEP candidate · A useful swap needs the right texture and method. Every card and the separate X graphic were reviewed at mobile size. The coconut photo is ingredient context; the actual adaptation is recorded app evidence, not a kitchen-tested brand recommendation.',
 'rf-tomato-clock':'KEEP candidate · A distinct visual direction and a useful counter/fridge decision. Whole, ripe and cut tomatoes have separate advice. The revised final card and X graphic passed mobile layout review.',
 'rf-pineapple-gelatin':'STOP · REJECTED BASELINE. New founder decision in PR116 supersedes the earlier KEEP recommendation: the illustrated protein grid and fruit icons do not meet the cinematic visual bar. The final readability export remains here for an honest comparison, not as qualified inventory. New art-to-motion work must prove a large improvement.',
 'rf-salt-volume':'KEEP · Prior founder creative selection. Original media carried forward byte for byte; publishing approval remains separate.',
 'rf-autumn-originals':'KEEP · Prior founder creative selection. Original media carried forward byte for byte; publishing approval remains separate.'
};
const ordered=[...ideas.values()].sort((a,b)=>Number(keepIds.has(a.id))-Number(keepIds.has(b.id)));
const catalogIdeas=ordered.map(idea=>({...idea,description:descriptions[idea.id]??idea.whyWatch,reviewNote:verdicts[idea.id],selectionStatus:keepIds.has(idea.id)?'KEEP · creative selection, not publishing approval':idea.id==='rf-more-dinner'?'NEW IMAGE-FIRST CUT · founder review':idea.id==='rf-pineapple-gelatin'?'STOP · founder-rejected baseline':'KEEP CANDIDATE · founder review',variants:variants.filter(v=>v.ideaId===idea.id).map(v=>({...v,media:v.media.map(a=>({...a,path:path.isAbsolute(a.path)?a.path:path.join(roots.get(v.id)!,a.path)}))}))}));
const beforeFile=path.join(root,'packages/marketing/production-checkpoint/video/review/more-dinner-v4.mp4');
const before:CreativeAsset={path:beforeFile,kind:'video',sha256:createHash('sha256').update(fs.readFileSync(beforeFile)).digest('hex'),width:1080,height:1920,durationSeconds:16,origin:'PR113 held prior film',rights:'See preserved production-checkpoint/video/rights.json',altText:'Prior dinner film, held for substantial revision.'};
const videoRoot=process.env.RECIPEFIX_VIDEO_ROOT??root;
const prototypes=['prototype-a','prototype-b'].flatMap(name=>{
 const file=path.join(videoRoot,'packages/marketing/phase2/video/review',name+'.mp4');
 return fs.existsSync(file)?[{path:file,kind:'video' as const,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),width:1080,height:1920,durationSeconds:5,origin:name==='prototype-a'?'Rejected real-food preparation/UI experiment':'Selected physical-space direction experiment',rights:'See video/PROTOTYPE_COMPARE.md and rights.json; prototype A contains licensed preparation footage, not broiling/result evidence.'}]:[];
});
const proofFile=path.join(here,'cinema/proof.json');
const proof=fs.existsSync(proofFile)?JSON.parse(fs.readFileSync(proofFile,'utf8')):null;
const proofAssets:CreativeAsset[]=(proof?.assets??[]).map((a:CreativeAsset)=>{
 const file=path.join(root,a.path);
 if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==a.sha256)throw Error('Changed proof asset '+a.path);
 return {...a,path:file};
});
const productFile=path.join(here,'cinema/api-product.json');
const product=fs.existsSync(productFile)?JSON.parse(fs.readFileSync(productFile,'utf8')):null;
const productAssets:CreativeAsset[]=(product?.assets??[]).map((a:CreativeAsset)=>{
 const file=path.join(root,a.path);
 if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==a.sha256)throw Error('Changed product proof '+a.path);
 return {...a,path:file};
});
const heldFile=path.join(root,'packages/marketing/phase2/video/handoff.json');
const heldSource=fs.existsSync(heldFile)?JSON.parse(fs.readFileSync(heldFile,'utf8')).variants[0].media[0]:null;
const heldDimensional=heldSource?{...heldSource,path:path.join(root,heldSource.path)}:null;
if(heldDimensional&&createHash('sha256').update(fs.readFileSync(heldDimensional.path)).digest('hex')!==heldDimensional.sha256)throw Error('Changed held dimensional reference');
const catalog={generatedAt:new Date().toISOString(),streams,ideas:catalogIdeas,referenceAssets:[before,...prototypes,...proofAssets,...productAssets,...(heldDimensional?[heldDimensional]:[])],beforeFilm:before,heldDimensional,prototypes,cinematicProof:proofAssets.find(a=>a.kind==='video'),styleFrames:proofAssets.filter(a=>a.kind==='image'),cinemaReviewNote:proof?.reviewNote,productProof:productAssets.find(a=>a.kind==='video'),productProofNote:product?.reviewNote,rawProductShot:productAssets.filter(a=>a.kind==='video')[1],comparisonNote:'Prior film held for substantial revision. Stopped allspice is preserved only in the old checkpoint; it does not occupy the current slate.'};
const readiness=variants.map(v=>({id:v.id,fingerprint:fingerprintVariant(v),...checkQueueReadiness(v,reviews.find(r=>r.variantId===v.id)??null,null,null)}));
if(readiness.some(r=>r.ready))throw Error('Review-only packet must not be publishable');
fs.writeFileSync(path.join(here,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(here,'offline-readiness.json'),JSON.stringify({checkedAt:new Date().toISOString(),streams,parents:ideas.size,variants:variants.length,readiness},null,2)+'\n');
console.log(JSON.stringify({parents:ideas.size,variants:variants.length,streams,ready:0}));
