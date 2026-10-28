import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import{execFileSync}from'node:child_process';
import{Ledger}from'../../../packages/marketing/src/ledger.js';
const cfg=Object.fromEntries(readFileSync('/Users/isaacmineo/PROJECT_2025/Halyard/.env','utf8').split(/\r?\n/).filter(x=>/^(ELEVENLABS_API_KEY|OPENAI_API_KEY)=/.test(x)).map(x=>[x.split('=')[0],x.slice(x.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'')]));
const catalog=JSON.parse(readFileSync('/tmp/halyard-eleven-voice-catalog.json','utf8'));
const text="A cup of flour. A cup of sugar. Same size, right? On King Arthur's chart, that's a hundred and twenty grams of flour, and a hundred and ninety-eight of sugar. Equal cups don't mean equal weight.";
const dir='runs/2026-10-28/voice-quality';mkdirSync(dir,{recursive:true});const ledger=new Ledger('runs/ledger.jsonl',12.50);
const variants=[
 {id:'A',name:'Roger',model:'eleven_v4',settings:{stability:.5,similarity_boost:.75}},
 {id:'B',name:'Roger',model:'eleven_v4',settings:{stability:.25,similarity_boost:.75}},
 {id:'C',name:'Roger',model:'eleven_v4',settings:{stability:.25,similarity_boost:.5}},
 {id:'D',name:'Eric',model:'eleven_v4',settings:{stability:.25,similarity_boost:.5}},
 {id:'E',name:'Alice',model:'eleven_v4',settings:{stability:.25,similarity_boost:.5}},
 {id:'F',name:'Roger',model:'eleven_v3',settings:{stability:.5,similarity_boost:.75}},
 {id:'G',name:'cedar',model:'gpt-4o-mini-tts'},
 {id:'H',name:'marin',model:'gpt-4o-mini-tts'}
];
async function main(){const results:any[]=[];for(const v of variants){const file=`${dir}/${v.id}-raw.mp3`;const provider=v.model.startsWith('eleven')?'elevenlabs':'openai';const cost=provider==='elevenlabs'?text.length/1000*.22:.04;let requestId:string|null=null;
 if(!existsSync(file)){ledger.assertCanSpend(cost);const ev=provider==='elevenlabs'?catalog.find((x:any)=>x.name.startsWith(v.name+' -')):null;if(provider==='elevenlabs'&&!ev)throw Error('Missing catalog voice');
 const instructions='Speak to one friend across a kitchen counter. Interested, understated and conversational. Use connected phrasing with varied natural emphasis, a genuine brief question on "Same size, right?", and a short pause before the answer. No presenter cadence, sales voice, artificial excitement, exaggerated breaths or sing-song delivery. Do not rush or stretch words.';
 const url=provider==='elevenlabs'?`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ev.id)}?output_format=mp3_44100_128`:'https://api.openai.com/v1/audio/speech';
 const headers=provider==='elevenlabs'?{'xi-api-key':cfg.ELEVENLABS_API_KEY!,'content-type':'application/json'}:{Authorization:`Bearer ${cfg.OPENAI_API_KEY}`,'content-type':'application/json'};
 const body=provider==='elevenlabs'?{text,model_id:v.model,voice_settings:v.settings}:{model:v.model,voice:v.name,input:text,instructions,response_format:'mp3'};
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});requestId=r.headers.get('request-id')||r.headers.get('x-request-id');if(!r.ok)throw Error(`Variant ${v.id} ${r.status}: ${(await r.text()).slice(0,180)}`);writeFileSync(file,Buffer.from(await r.arrayBuffer()));ledger.record({run:'voice-quality-20261028',provider,model:v.model,purpose:`Continuous same-script audition ${v.id} ${v.name}`,units:{characters:text.length},usd:cost,basis:provider==='elevenlabs'?'$0.22/1k characters plan-dependent estimate':'Conservative $0.04 reserve for one short TTS sample; not invoice usage'});}
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'}).trim());
 const normalized=`${dir}/${v.id}.mp3`;if(!existsSync(normalized))execFileSync('ffmpeg',['-v','error','-i',file,'-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','libmp3lame','-q:a','2','-y',normalized]);
 results.push({...v,provider,text,file,normalized,duration,requestId,estimatedUsd:cost,status:'audition only; not approved'});writeFileSync(`${dir}/auditions.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({id:v.id,provider,model:v.model,seconds:duration,total:ledger.spent()}));}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
