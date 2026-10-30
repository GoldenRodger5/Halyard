import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateIdea,validateVariant,checkQueueReadiness,fingerprintVariant,type CreativeIdea,type PlatformVariant,type CreativeAsset,type CreativeQualityReview} from '../src/socialStudioContract.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const ideas=new Map<string,CreativeIdea>();
const variants:PlatformVariant[]=[];
const mediaRoots=new Map<string,string>();
const selected=new Set(['rf-more-dinner','rf-salt-volume','rf-autumn-originals','rf-marinade-job','rf-tomato-clock']);
function packet(file:string,sourceRoot:string,allowed=selected){
 if(!fs.existsSync(file))return false;
 const p=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const idea of p.ideas??[]){if(!allowed.has(idea.id))continue;const errors=validateIdea(idea);if(errors.length)throw Error(errors.join('; '));ideas.set(idea.id,idea);}
 for(const v of p.variants??[]){
  if(!allowed.has(v.ideaId))continue;
  const errors=validateVariant(v);if(errors.length)throw Error(v.id+': '+errors.join('; '));
  if(v.account||v.scheduledAt)throw Error('Review packet cannot invent account/time authority');
  if(variants.some(x=>x.id===v.id))throw Error('Duplicate variant');
  variants.push(v);mediaRoots.set(v.id,sourceRoot);
 }
 return true;
}
function checked(a:CreativeAsset,sourceRoot=root){
 const file=path.isAbsolute(a.path)?a.path:path.join(sourceRoot,a.path);
 if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==a.sha256)throw Error('Changed asset '+file);
 return {...a,path:file};
}
for(const stream of ['food','editorial'])packet(path.join(root,'packages/marketing/production-checkpoint',stream,'handoff.json'),root,new Set(['rf-salt-volume','rf-autumn-originals']));
packet(path.join(root,'packages/marketing/phase2/editorial/handoff.json'),root);
const audioRoot=process.env.RECIPEFIX_AUDIO_ROOT??root;
const editRoot=process.env.RECIPEFIX_EDIT_ROOT??root;
if(!packet(path.join(audioRoot,'packages/marketing/phase2b/audio/handoff.json'),audioRoot)&&!packet(path.join(editRoot,'packages/marketing/phase2b/video/handoff.json'),editRoot))packet(path.join(root,'packages/marketing/phase2/cinema/product-handoff.json'),root);
for(const v of variants)if(!ideas.has(v.ideaId))throw Error('Missing parent '+v.ideaId);
const visible=[...ideas.values()].sort((a,b)=>Number(b.id==='rf-more-dinner')-Number(a.id==='rf-more-dinner')).map(i=>({...i,selectionStatus:i.id==='rf-more-dinner'?'PHASE 2B · finishing review':'KEEP candidate · exact artwork retained',variants:variants.filter(v=>v.ideaId===i.id).map(v=>({...v,media:v.media.map(a=>checked(a,mediaRoots.get(v.id)))}))}));
const baseline=checked(JSON.parse(fs.readFileSync(path.join(root,'packages/marketing/phase2/cinema/product-handoff.json'),'utf8')).variants[0].media[0]);
const legacyRejected=checked(JSON.parse(fs.readFileSync(path.join(root,'packages/marketing/phase2/food/handoff.json'),'utf8')).variants[0].media[0]);
const contrastFile=path.join(root,'packages/marketing/phase2/cinema/contrast-cut/pineapple-contrast-cut-v1.mp4');
const contrast:CreativeAsset={path:contrastFile,kind:'video',sha256:createHash('sha256').update(fs.readFileSync(contrastFile)).digest('hex'),width:1080,height:1920,durationSeconds:10.5,origin:'Prior licensed preparation/generated-still R&D',rights:'See preserved phase2/cinema/contrast-cut/review.json; this is held R&D, not approved inventory.'};
const mixesFile=path.join(here,'finished-media.json');
const mixes=fs.existsSync(mixesFile)?JSON.parse(fs.readFileSync(mixesFile,'utf8')):[];
const finishedFilms=mixes.map((m:any)=>({...m,...checked(m,m.sourceRoot??root)}));
const product=visible.find(i=>i.id==='rf-more-dinner')?.variants[0]?.media[0];
const catalog={generatedAt:new Date().toISOString(),ideas:visible,referenceAssets:[baseline,legacyRejected,contrast,...finishedFilms],beforeFilm:baseline,productProof:product,productProofNote:'Recommended working direction: narration-led. The founder delegated treatment selection; the director chose narration for a clearer dinner problem → method change → action story. Sound-only remains the comparison. Food motion is limited; audible naturalness and publication approval remain unverified.',finishedFilms,blockedReferences:[{label:'Rejected science baseline · STOP',asset:legacyRejected},{label:'Pineapple contrast cut · STOP further rescue / R&D hold',asset:contrast}],comparisonNote:'PR118 original12s is preserved byte for byte. The new edit improves product clarity and removes the floating tray, with less continuous food action. Rejected science is reference-only and excluded from the typed five-parent candidate packet.'};
if(variants.some(v=>v.ideaId==='rf-pineapple-gelatin'))throw Error('Rejected science leaked into current candidate packet');
const reviewsPath=path.join(here,'quality-reviews.json');
const reviews:CreativeQualityReview[]=fs.existsSync(reviewsPath)?JSON.parse(fs.readFileSync(reviewsPath,'utf8')):[];
const readiness=variants.map(v=>({id:v.id,fingerprint:fingerprintVariant(v),...checkQueueReadiness(v,reviews.find(r=>r.variantId===v.id)??null,null,null)}));
if(readiness.some(v=>v.ready))throw Error('Review-only packet cannot publish');
fs.writeFileSync(path.join(here,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(here,'offline-readiness.json'),JSON.stringify({parents:ideas.size,variants:variants.length,blockedIdeaIds:['rf-pineapple-gelatin'],readiness},null,2)+'\n');
console.log(JSON.stringify({parents:ideas.size,variants:variants.length,finishedFilms:finishedFilms.length,ready:0,rejectedScienceInCandidates:false}));
