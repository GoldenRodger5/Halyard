import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { applyRepair, sampleTimes, type RepairPlan } from '@/lib/momentcircuit/quality-repair';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MODEL = 'gpt-5.5';
const OPENAI = 'https://api.openai.com/v1/chat/completions';

type Defect = {
  class: string;
  severity: 'critical' | 'major' | 'minor';
  atSeconds: number[];
  evidence: string;
  repairable?: boolean;
};

type AiReply = {
  verdict?: 'PASS' | 'FAIL';
  visual_story_match?: boolean;
  caption_visual_quality?: boolean;
  professional_quality?: boolean;
  text_bounds_pass?: boolean;
  artifact_scan?: {
    pass?: boolean;
    timestamp_tokens_visible?: boolean;
    ass_ssa_tokens_visible?: boolean;
    json_serialization_visible?: boolean;
    cue_numbers_visible?: boolean;
  };
  visible_text?: Array<{ atSeconds?: number; text?: string[] }>;
  defects?: Defect[];
  repair_plan?: RepairPlan;
  summary?: string;
};

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function authorize(request: NextRequest) {
  const expected = process.env.MOMENTCIRCUIT_RENDER_SECRET ?? '';
  const actual = request.headers.get('x-momentcircuit-render-secret') ?? '';
  if (!expected || !actual || !secureEqual(expected, actual)) throw new Error('UNAUTHORIZED');
}

function resolveFfmpegPath() {
  const candidates = [
    path.join(process.cwd(), 'bin', 'ffmpeg'),
    path.join(process.cwd(), 'apps', 'web', 'bin', 'ffmpeg'),
    '/var/task/apps/web/bin/ffmpeg',
    '/var/task/bin/ffmpeg',
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('FFMPEG_BINARY_MISSING');
  return found;
}

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    let binary: string;
    try { binary = resolveFfmpegPath(); } catch (error) { reject(error); return; }
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); if (err.length > 12000) err = err.slice(-12000); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`FFMPEG_FAILED_${code}: ${err.slice(-4000)}`)));
  });
}

async function download(url: string, dest: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('BAD_MEDIA_URL');
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'MomentCircuitQC/1.0' } });
  if (!response.ok || !response.body) throw new Error(`MEDIA_HTTP_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('EMPTY_MEDIA');
  if (bytes.length > 250_000_000) throw new Error('QC_MEDIA_TOO_LARGE');
  await fsp.writeFile(dest, bytes);
}

async function extractFrames(video: string, duration: number, work: string) {
  const frames: Array<{ atSeconds: number; bytes: Buffer }> = [];
  for (const [i, atSeconds] of sampleTimes(duration).entries()) {
    const file = path.join(work, `frame-${i}.jpg`);
    await run(['-y','-ss',String(atSeconds),'-i',video,'-frames:v','1','-vf','scale=720:-2','-q:v','3',file]);
    frames.push({ atSeconds, bytes: await fsp.readFile(file) });
  }
  return frames;
}

function artifactToken(text: string): boolean {
  return /(Dialogue:|Style:|Script Info|Format:|,Cap,,|-->|(?:^|\s)\d{1,2}:\d{2}(?::\d{2})?[.,]\d+|["']?(?:start|end)["']?\s*:|\{\s*["']|\[\s*\{)/i.test(text);
}

function classifyFailureScope(verdict: {
  defects: Defect[];
  repairPlan: RepairPlan;
  summary: string;
}): 'INFRASTRUCTURE'|'GENERATION_SYSTEMIC'|'SOURCE_IDENTITY'|'COMPLIANCE'|'CREATIVE_LOCAL' {
  const corpus = [
    verdict.repairPlan?.dominant_problem ?? '',
    verdict.summary ?? '',
    ...verdict.defects.flatMap((d) => [d.class ?? '', d.evidence ?? '']),
  ].join(' ').toLowerCase();

  if (/(incomplete_frame_inspection|incomplete exact-final visual evidence|tofu|missing[- ]glyph|font failure|font render|caption render(ing)? fail|subtitle render(ing)? fail|blank caption|empty caption box|renderer failure)/i.test(corpus)) {
    return 'INFRASTRUCTURE';
  }
  if (/(source_identity|source identity|wrong source|story mismatch|wrong story)/i.test(corpus)) {
    return 'SOURCE_IDENTITY';
  }
  if (/(disclosure|paid promotion|sponsor tag|compliance|forbidden topic|brief violation)/i.test(corpus)) {
    return 'COMPLIANCE';
  }
  if (/(template_ai_slop|template_crop_artifact|template padding|border template|white strip|canvas leak|non-native canvas|systemic crop)/i.test(corpus)) {
    return 'GENERATION_SYSTEMIC';
  }
  return 'CREATIVE_LOCAL';
}

function normalizeReply(raw: AiReply) {
  const defects = Array.isArray(raw.defects) ? raw.defects.filter((d) => d && typeof d.class === 'string') : [];
  const visible = Array.isArray(raw.visible_text) ? raw.visible_text : [];
  const forensicHits: Array<{atSeconds:number;text:string}> = [];
  for (const row of visible) {
    const at = Number(row?.atSeconds ?? 0);
    for (const text of Array.isArray(row?.text) ? row.text : []) {
      if (artifactToken(String(text))) forensicHits.push({ atSeconds: at, text: String(text).slice(0,180) });
    }
  }
  if (forensicHits.length) {
    defects.push({
      class:'caption_serialization_artifact',
      severity:'critical',
      atSeconds:[...new Set(forensicHits.map((x)=>x.atSeconds))],
      evidence:`Visible timing/ASS/JSON serialization detected: ${forensicHits.map((x)=>x.text).join(' | ').slice(0,500)}`,
      repairable:true,
    });
  }
  const artifact = {
    ...(raw.artifact_scan ?? {}),
    pass: raw.artifact_scan?.pass === true && forensicHits.length === 0
      && raw.artifact_scan?.timestamp_tokens_visible === false
      && raw.artifact_scan?.ass_ssa_tokens_visible === false
      && raw.artifact_scan?.json_serialization_visible === false
      && raw.artifact_scan?.cue_numbers_visible === false,
    deterministic_visible_text_hits: forensicHits,
  };
  const hardDefect = defects.some((d) => d.severity === 'critical' || d.severity === 'major');
  const pass =
    raw.verdict === 'PASS' &&
    raw.visual_story_match === true &&
    raw.caption_visual_quality === true &&
    raw.professional_quality === true &&
    raw.text_bounds_pass === true &&
    artifact.pass === true &&
    !hardDefect;
  return {
    pass,
    defects,
    artifact,
    visualStoryMatch: raw.visual_story_match === true,
    captionVisualQuality: raw.caption_visual_quality === true,
    professionalQuality: raw.professional_quality === true,
    textBoundsPass: raw.text_bounds_pass === true,
    visibleText: visible,
    repairPlan: raw.repair_plan ?? {},
    summary: String(raw.summary ?? ''),
  };
}

async function critique(args: {
  frames: Array<{atSeconds:number;bytes:Buffer}>;
  platform: string;
  storyFamily: string;
  storyClaim: string;
  payoff: string;
  expectedCaptions: string[];
}) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY_MISSING_FOR_AI_QC');

  const system = `You are the production QA critic for MomentCircuit, a professional short-form clipping account.
You are looking at frames from the EXACT FINAL EXPORT that would be published. Be strict and concrete.
This is not a praise task. Find ALL material defects, not just one.

You MUST inspect:
- source/story identity: visuals must plausibly match the verified story and payoff;
- perceptual sharpness, blur, compression and fake-looking upscale;
- crop/context: faces/action must not be overzoomed, chopped off, or impossible to understand;
- first-second hook and cold-viewer clarity;
- pacing/dead space inferred from frame progression;
- all visible text: headline, subtitles, spelling, legibility, line length, safe zones and coverage;
- any leaked timestamp, ASS/SSA/SRT syntax, Dialogue:, Style:, Format:, Cap,, cue numbers, JSON start/end fields or serialized metadata;
- whether captions look like real subtitles rather than a debug object;
- payoff completeness and whether the ending feels cut off or drags;
- template/AI-slop appearance;
- disclosure text if visible;
- platform-native quality for the requested platform;
- obvious duplicate/repost presentation problems.

Do not pass a technically valid but visibly amateur render.
For every defect cite the exact sampled frame timestamps where it is visible.
Transcribe EVERY readable overlay/subtitle string you can see in each frame into visible_text.
Return JSON only with this exact shape:
{
 "verdict":"PASS|FAIL",
 "visual_story_match":true,
 "caption_visual_quality":true,
 "professional_quality":true,
 "text_bounds_pass":true,
 "artifact_scan":{"pass":true,"timestamp_tokens_visible":false,"ass_ssa_tokens_visible":false,"json_serialization_visible":false,"cue_numbers_visible":false},
 "visible_text":[{"atSeconds":0.5,"text":["..."]}],
 "defects":[{"class":"caption_legibility","severity":"critical|major|minor","atSeconds":[0.5],"evidence":"specific observable problem","repairable":true}],
 "repair_plan":{"dominant_problem":"...","action":"NONE|TRIM_START|TRIM_END|REPLACE_HOOK|REMOVE_HOOK|RERENDER_CAPTIONS|REFRAME|REFRAME_AND_HOOK|REPLACE_MOMENT","trim_start_seconds":0,"trim_end_seconds":0,"new_hook_text":null,"new_focus_x":null},
 "summary":"one concise sentence"
}
When crop/context is the dominant repairable defect, use REFRAME and return new_focus_x between 0.08 and 0.92: smaller shifts the portrait crop left in the source, larger shifts it right. When both crop and hook safe-zone/text are defective, use REFRAME_AND_HOOK with both new_focus_x and a shorter hook.
PASS only when there is no material defect. A minor stylistic preference may remain a minor defect, but any major/critical defect means FAIL.`;

  const intro = `Platform: ${args.platform}
Story family: ${args.storyFamily}
Verified story: ${args.storyClaim || '(not supplied)'}
Verified payoff: ${args.payoff || '(not supplied)'}
Expected spoken subtitle phrases (timing metadata is NOT supposed to be visible): ${JSON.stringify(args.expectedCaptions)}
Sample times: ${args.frames.map((f)=>f.atSeconds).join(', ')} seconds.`;

  const content: Array<Record<string,unknown>> = [{type:'text',text:intro}];
  for (const frame of args.frames) {
    content.push({type:'text',text:`Frame at ${frame.atSeconds}s`});
    content.push({type:'image_url',image_url:{url:`data:image/jpeg;base64,${frame.bytes.toString('base64')}`}});
  }

  const response = await fetch(OPENAI,{
    method:'POST',
    headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify({
      model:MODEL,
      messages:[{role:'system',content:system},{role:'user',content}],
      max_completion_tokens:5000,
      response_format:{type:'json_object'},
    }),
  });
  const body = await response.json() as {choices?:Array<{message?:{content?:string|null}}>;error?:{message?:string}};
  if (!response.ok) throw new Error(`AI_QC_${response.status}: ${body.error?.message ?? 'unknown'}`);
  const text = body.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('AI_QC_EMPTY');
  const verdict = normalizeReply(JSON.parse(text) as AiReply);
  const inspectedAllFrames = args.frames.length >= 8 && args.frames.every(frame =>
    verdict.visibleText.some(row => Number.isFinite(Number(row.atSeconds)) &&
      Math.abs(Number(row.atSeconds)-frame.atSeconds) <= 0.03 && Array.isArray(row.text)));
  if (!inspectedAllFrames) {
    verdict.pass = false;
    verdict.artifact.pass = false;
    verdict.defects.push({class:'incomplete_frame_inspection',severity:'critical',atSeconds:[],
      evidence:'The critic did not provide an observation for every sampled frame.',repairable:false});
    verdict.summary = 'Incomplete exact-final visual evidence; publication remains blocked.';
  }
  return verdict;
}

async function processRender(renderId: string) {
  const client = db();
  const {data:rj,error:re} = await client.from('momentcircuit_render_jobs')
    .select('id,work_order_id,status,result,payload,story_family').eq('id',renderId).maybeSingle();
  if (re || !rj) throw new Error(`RENDER_NOT_FOUND: ${re?.message ?? renderId}`);
  if (rj.status !== 'ready') return {skipped:true,reason:`render_status_${rj.status}`};

  const {data:existing} = await client.from('momentcircuit_ai_qc_reports')
    .select('id,status').eq('render_job_id',renderId).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if (existing) return {duplicate:true,qc:existing};

  const {data:wo,error:we} = await client.from('momentcircuit_creative_work_orders')
    .select('id,generation,run_id,platform,candidate_moment_id,campaign_contract_id,payload,status')
    .eq('id',rj.work_order_id).maybeSingle();
  if (we || !wo) throw new Error(`WORK_ORDER_NOT_FOUND: ${we?.message ?? rj.work_order_id}`);

  const {data:ctl} = await client.from('momentcircuit_pipeline_control')
    .select('generation,active_run_id').eq('singleton',true).maybeSingle();
  if (!ctl || Number(ctl.generation)!==Number(wo.generation) || ctl.active_run_id!==wo.run_id) {
    throw new Error('STALE_QC_RUN');
  }

  const {data:cm} = await client.from('momentcircuit_candidate_moments')
    .select('story_family,verified_story_claim,verified_payoff').eq('id',wo.candidate_moment_id).maybeSingle();

  const variant = rj.result?.variants?.[0];
  const mediaUrl = String(variant?.media_url ?? '');
  const duration = Number(variant?.duration_seconds ?? 0);
  if (!mediaUrl || !(duration > 0)) throw new Error('RENDER_RESULT_INCOMPLETE');

  const work = await fsp.mkdtemp(path.join(os.tmpdir(),'mc-qc-'));
  const video = path.join(work,'final.mp4');
  try {
    await download(mediaUrl,video);
    const frames = await extractFrames(video,duration,work);
    const rawCaptionCues = wo.payload?.render_segment?.caption_cues;
    const expectedCaptions = Array.isArray(rawCaptionCues)
      ? rawCaptionCues.map((x: unknown) => {
          if (!x || typeof x !== 'object' || !('text' in x)) return '';
          return String((x as {text?: unknown}).text ?? '');
        }).filter(Boolean)
      : [];

    const verdict = await critique({
      frames,
      platform:String(wo.platform),
      storyFamily:String(cm?.story_family ?? rj.story_family ?? ''),
      storyClaim:String(cm?.verified_story_claim ?? ''),
      payoff:String(cm?.verified_payoff ?? ''),
      expectedCaptions,
    });

    const analysisId = crypto.randomUUID();
    const failureScope = verdict.pass ? 'CREATIVE_LOCAL' : classifyFailureScope(verdict);
    const artifactWithScope = {
      ...verdict.artifact,
      failure_scope: failureScope,
      renderer_release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.HALYARD_RELEASE ?? null,
    };
    const {data:qcId,error:qce} = await client.rpc('momentcircuit_record_ai_qc_report',{
      p_run_id:wo.run_id,
      p_generation:wo.generation,
      p_work_order_id:wo.id,
      p_render_job_id:rj.id,
      p_platform:wo.platform,
      p_media_url:mediaUrl,
      p_analysis_provider:'openai_exact_final_v4',
      p_analysis_id:analysisId,
      p_status:verdict.pass?'PASS':'FAIL',
      p_visual_story_match:verdict.visualStoryMatch,
      p_caption_visual_quality:verdict.captionVisualQuality,
      p_professional_quality:verdict.professionalQuality,
      p_artifact_scan:artifactWithScope,
      p_defects:verdict.defects,
      p_repair_plan:verdict.repairPlan,
      p_ai_summary:verdict.summary,
    });
    if (qce) throw new Error(`QC_RECORD_FAILED: ${qce.message}`);

    // This is the exact frame set inspected by the critic, not a manual waiver.
    const {error:forensicError} = await client.rpc('momentcircuit_record_forensic_frame_review',{
      p_run_id:wo.run_id,p_generation:wo.generation,p_work_order_id:wo.id,p_render_job_id:rj.id,
      p_platform:wo.platform,p_method:'MODEL_PIXEL_FRAME_SET',p_sampled_frame_count:frames.length,
      p_expected_overlay_text:expectedCaptions,p_artifact_free:verdict.artifact.pass && verdict.textBoundsPass,
      p_artifact_classes_checked:['timestamps','ASS_SSA_markup','serialized_cue_rows','JSON_timing_keys','subtitle_overflow','unexpected_overlay_text'],
      p_observed_artifacts:verdict.defects.filter(d=>/caption|subtitle|text|artifact/i.test(d.class)),
      p_evidence:{exact_final_media_url:mediaUrl,qc_report_id:qcId,analysis_id:analysisId,
        sampled_seconds:frames.map(f=>f.atSeconds),visible_text:verdict.visibleText,
        text_bounds_pass:verdict.textBoundsPass,review_scope:'VISUAL_FRAMES_NOT_AUDIO'},
    });
    if (forensicError) throw new Error(`FORENSIC_RECORD_FAILED: ${forensicError.message}`);


    if (!verdict.pass) {
      await client.from('momentcircuit_render_jobs').update({
        status:'failed',
        error:`AI_QC_${failureScope}:${String(verdict.repairPlan?.dominant_problem ?? verdict.defects?.[0]?.class ?? 'quality')}`,
        completed_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      }).eq('id',rj.id);

      if (failureScope !== 'CREATIVE_LOCAL') {
        await client.from('momentcircuit_creative_work_orders').update({
          status:'repair_required',
          updated_at:new Date().toISOString(),
        }).eq('id',wo.id);

        await client.from('momentcircuit_ai_repair_queue').update({
          state:'RESOLVED',
          repair_instruction:{
            ...(verdict.repairPlan ?? {}),
            root_cause_first:true,
            failure_scope:failureScope,
            renderer_release:process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.HALYARD_RELEASE ?? null,
            creative_attempt_not_counted:true,
          },
          updated_at:new Date().toISOString(),
        }).eq('failed_qc_report_id',qcId);

        await client.from('momentcircuit_architecture_events').insert({
          severity: failureScope === 'INFRASTRUCTURE' ? 'critical' : 'high',
          component:'ai_qc_rejection_loop',
          error_class:`AI_QC_${failureScope}`,
          root_cause:String(verdict.repairPlan?.dominant_problem ?? verdict.defects?.[0]?.evidence ?? 'systemic rejection'),
          fix_applied:'ROOT_CAUSE_REPAIR_REQUIRED_BEFORE_TARGETED_RERENDER',
          regression_guard:'Failure does not consume creative repair budget; affected work stays blocked until systemic repair is resolved.',
          evidence:{
            work_order_id:wo.id,
            render_job_id:rj.id,
            qc_report_id:qcId,
            platform:wo.platform,
            defects:verdict.defects,
            repair_plan:verdict.repairPlan,
            renderer_release:process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.HALYARD_RELEASE ?? null,
          },
        });

        return {
          ok:false,
          qc_id:qcId,
          failure_scope:failureScope,
          root_cause_repair_required:true,
          creative_attempt_consumed:false,
          defects:verdict.defects,
          repair_plan:verdict.repairPlan,
        };
      }

      const {count} = await client.from('momentcircuit_ai_repair_queue')
        .select('id',{count:'exact',head:true})
        .eq('work_order_id',wo.id)
        .eq('failure_scope','CREATIVE_LOCAL');
      const attempt = Number(count ?? 0);
      const repaired = attempt < 2 ? applyRepair(wo.payload as Record<string,unknown>,verdict.repairPlan) : null;

      if (repaired) {
        await client.from('momentcircuit_creative_work_orders').update({
          payload:repaired,
          status:'ready_to_render',
          updated_at:new Date().toISOString(),
        }).eq('id',wo.id);
        await client.from('momentcircuit_ai_repair_queue').update({
          state:'REWATCH_REQUIRED',
          updated_at:new Date().toISOString(),
        }).eq('work_order_id',wo.id).eq('failure_scope','CREATIVE_LOCAL').eq('state','QUEUED');
        await client.rpc('momentcircuit_dispatch_pending_renders',{p_limit:8});
        return {ok:false,qc_id:qcId,failure_scope:failureScope,repair_enqueued:true,defects:verdict.defects,repair_plan:verdict.repairPlan};
      }
      return {ok:false,qc_id:qcId,failure_scope:failureScope,replace_moment:true,defects:verdict.defects,repair_plan:verdict.repairPlan};
    }

    const {data:validationId,error:ve} = await client.rpc('momentcircuit_record_validation',{
      p_run_id:wo.run_id,p_generation:wo.generation,p_work_order_id:wo.id,p_render_job_id:rj.id,
      p_variant:wo.platform,p_revision:1,p_status:'PASS_FIRST_RENDER',p_failure_class:null,
      p_critique:{ai_qc_report_id:qcId,summary:verdict.summary,defects:verdict.defects},
      p_evidence:{exact_final:true,analysis_id:analysisId,artifact_scan:verdict.artifact,frame_count:frames.length,media_url:mediaUrl},
    });
    if (ve) throw new Error(`VALIDATION_RECORD_FAILED: ${ve.message}`);

    const {error:ae} = await client.rpc('momentcircuit_record_quality_audit',{
      p_run_id:wo.run_id,p_generation:wo.generation,p_work_order_id:wo.id,p_render_job_id:rj.id,
      p_stage:'POST_RENDER',p_status:'PASS',
      p_metrics:{ai_exact_final:true,visual_story_match:verdict.visualStoryMatch,caption_visual_quality:verdict.captionVisualQuality,professional_quality:verdict.professionalQuality,artifact_scan:verdict.artifact,frame_count:frames.length,forensic_frame_review_pass:verdict.artifact.pass && verdict.textBoundsPass,raw_caption_artifact_free:verdict.artifact.pass,timestamp_artifact_free:verdict.artifact.pass,text_bounds_pass:verdict.textBoundsPass},
      p_treatment:{critic:'OPENAI_EXACT_FINAL_V4',caption_mode:wo.payload?.render_segment?.caption_mode ?? null},
      p_reasons:[],
    });
    if (ae) throw new Error(`QUALITY_AUDIT_FAILED: ${ae.message}`);

    await client.from('momentcircuit_creative_work_orders').update({status:'critic_pass',updated_at:new Date().toISOString()}).eq('id',wo.id);

    const disclosure = wo.platform === 'youtube'
      ? {provider:'metricool+youtube_data_api',youtube_paid_promotion_required:true}
      : {provider:'metricool',commercialContentThirdParty:true};

    const {data:readyId,error:pe} = await client.rpc('momentcircuit_promote_ready',{
      p_run_id:wo.run_id,p_generation:wo.generation,p_work_order_id:wo.id,p_render_job_id:rj.id,
      p_validation_result_id:validationId,p_platform:wo.platform,p_story_family:cm?.story_family ?? rj.story_family,
      p_media_url:mediaUrl,
      p_packaging:{post_caption:wo.payload?.selected_packaging ?? '',youtube_title:wo.payload?.youtube_title ?? null,ai_qc_report_id:qcId},
      p_disclosure_route:disclosure,
      p_dependencies:{ai_qc_v4:true,exact_final_reviewed:true,artifact_scan_pass:true,source_visual_story_match:true},
      p_valid_until:new Date(Date.now()+12*60*60*1000).toISOString(),
    });
    if (pe) throw new Error(`READY_PROMOTION_FAILED: ${pe.message}`);

    return {ok:true,qc_id:qcId,ready_id:readyId,summary:verdict.summary,frames:frames.length};
  } finally {
    await fsp.rm(work,{recursive:true,force:true}).catch(()=>undefined);
  }
}

export async function POST(request: NextRequest) {
  try {
    authorize(request);
    const body = await request.json() as {id?:string};
    if (!body.id) return NextResponse.json({error:'id_required'},{status:400});
    return NextResponse.json({ok:true,result:await processRender(body.id)});
  } catch (error) {
    const message=String(error instanceof Error?error.message:error);
    const status=message==='UNAUTHORIZED'?401:500;
    console.error('MomentCircuit exact-final QC failed',{error:message});
    return NextResponse.json({error:message},{status});
  }
}
