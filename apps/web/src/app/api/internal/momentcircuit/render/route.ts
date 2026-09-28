import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const BUCKET = 'halyard-assets';
const PREFIX = 'momentcircuit/';
const MAX_SOURCE_BYTES = 650_000_000;
const REMOTE_SEEK_HOSTS = [
  'dropbox.com',
  'dropboxusercontent.com',
  'googleusercontent.com',
  'drive.google.com',
  'docs.google.com',
  'supabase.co',
];
const PROACTIVE_REMOTE_SEEK_HOSTS = [
  'dropbox.com',
  'dropboxusercontent.com',
  'supabase.co',
];
const DEEP_SEEK_SECONDS = 300;

type SourceMode = 'downloaded' | 'remote_seek';

class SourceTooLargeError extends Error {
  readonly finalUrl: string;
  readonly declaredBytes: number | null;
  constructor(finalUrl: string, declaredBytes: number | null) {
    super('SOURCE_TOO_LARGE');
    this.name = 'SourceTooLargeError';
    this.finalUrl = finalUrl;
    this.declaredBytes = declaredBytes;
  }
}

type Family = 'native_people' | 'gameplay_focus' | 'cinematic_focus';
type DisclosureMode = 'none' | 'opening' | 'persistent';

interface Segment {
  family?: Family;
  start?: number;
  duration: number;
  focus_x?: number;
  hook_line1?: string;
  hook_line2?: string;
  hook_duration?: number;
  required_text?: string;
  required_duration?: number;
  disclosure?: string;
  disclosure_mode?: DisclosureMode;
}
interface Variant { id: string; filename?: string; segments: Segment[]; }
interface RenderPayload {
  source_url: string;
  campaign_id?: string;
  campaign_name?: string;
  story_family?: string;
  source_rights?: string;
  variants?: Variant[];
  segments?: Segment[];
  variant_id?: string;
  filename?: string;
}

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
function safe(value: string, fallback = 'item') {
  return String(value || fallback).replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 100) || fallback;
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

function probeDuration(file: string) {
  return new Promise<number>((resolve, reject) => {
    let binary: string;
    try { binary = resolveFfmpegPath(); } catch (error) { reject(error); return; }
    const child = spawn(binary, ['-hide_banner', '-i', file], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 16000) err = err.slice(-16000);
    });
    child.on('error', reject);
    child.on('exit', () => {
      const match = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (!match) {
        reject(new Error('FFMPEG_DURATION_NOT_FOUND'));
        return;
      }
      const hours = Number(match[1] ?? 0);
      const minutes = Number(match[2] ?? 0);
      const seconds = Number(match[3] ?? 0);
      const total = hours * 3600 + minutes * 60 + seconds;
      if (!Number.isFinite(total) || total <= 0) {
        reject(new Error('FFMPEG_DURATION_INVALID'));
        return;
      }
      resolve(total);
    });
  });
}
function validateSourceUrl(raw: string) {
  const parsed = new URL(raw);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('BAD_SOURCE_PROTOCOL');
  if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) throw new Error('LOCAL_SOURCE_FORBIDDEN');
  return parsed;
}
function hostAllowed(raw: string, allowlist: string[]) {
  let parsed: URL;
  try { parsed = validateSourceUrl(raw); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
function remoteSeekAllowed(raw: string) {
  return hostAllowed(raw, REMOTE_SEEK_HOSTS);
}
function proactiveRemoteSeekAllowed(raw: string) {
  return hostAllowed(raw, PROACTIVE_REMOTE_SEEK_HOSTS);
}
function deepestStart(payload: RenderPayload) {
  const variants = payload.variants?.length
    ? payload.variants
    : [{ id: payload.variant_id ?? 'master', segments: payload.segments ?? [] }];
  let max = 0;
  for (const variant of variants) {
    for (const seg of variant.segments ?? []) {
      const start = Number(seg.start ?? 0);
      if (Number.isFinite(start)) max = Math.max(max, start);
    }
  }
  return max;
}
async function download(url: string, dest: string) {
  validateSourceUrl(url);
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'MomentCircuitVercel/1.0' } });
  if (!response.ok || !response.body) throw new Error(`SOURCE_HTTP_${response.status}`);
  validateSourceUrl(response.url || url);
  const declaredHeader = response.headers.get('content-length');
  const declared = declaredHeader ? Number(declaredHeader) : 0;
  if (declared > MAX_SOURCE_BYTES) {
    await response.body.cancel().catch(() => undefined);
    throw new SourceTooLargeError(response.url || url, declared);
  }
  const fh = await fsp.open(dest, 'w');
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SOURCE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new SourceTooLargeError(response.url || url, declared || null);
      }
      await fh.write(Buffer.from(value));
    }
  } finally { await fh.close(); }
  return bytes;
}
async function prepareSource(
  url: string,
  dest: string,
  preferRemoteSeek = false,
): Promise<{ input: string; mode: SourceMode; bytes: number | null }> {
  if (preferRemoteSeek && proactiveRemoteSeekAllowed(url)) {
    return { input: url, mode: 'remote_seek', bytes: null };
  }
  try {
    const bytes = await download(url, dest);
    return { input: dest, mode: 'downloaded', bytes };
  } catch (error) {
    if (!(error instanceof SourceTooLargeError)) throw error;
    const remote = error.finalUrl || url;
    // Remote ffmpeg input is intentionally restricted to known campaign/storage
    // providers. This lets ffmpeg seek to a 20-40s window without downloading a
    // multi-GB source while preventing arbitrary URLs from becoming a network pivot.
    if (!remoteSeekAllowed(url) || !remoteSeekAllowed(remote)) throw error;
    await fsp.rm(dest, { force: true }).catch(() => undefined);
    return { input: remote, mode: 'remote_seek', bytes: error.declaredBytes };
  }
}
function xml(v: string) {
  return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function card(line: string, y: number, size: number) {
  if (!line) return '';
  const width = Math.min(970, Math.max(280, Math.round(line.length * size * 0.6 + 72)));
  const x = Math.round((1080 - width) / 2);
  return `<rect x="${x}" y="${y}" width="${width}" height="${size+48}" rx="18" fill="rgba(255,255,255,.95)"/>
  <text x="540" y="${y+size+4}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${size}" fill="#090909">${xml(line)}</text>`;
}
async function overlay(file: string, seg: Segment, kind: 'hook'|'required'|'persistent') {
  let body = '';
  if (kind === 'hook') {
    body += card(seg.hook_line1 ?? '', 300, 58);
    body += card(seg.hook_line2 ?? '', 400, 50);
    if (seg.disclosure && seg.disclosure_mode === 'opening') {
      body += `<rect x="46" y="250" width="104" height="52" rx="12" fill="rgba(0,0,0,.68)"/>
      <text x="98" y="285" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="27" fill="white">${xml(seg.disclosure)}</text>`;
    }
  } else if (kind === 'required' && seg.required_text) {
    const v = xml(seg.required_text), w = Math.min(800, Math.max(260, v.length*22+70)), x = Math.round((1080-w)/2);
    body = `<rect x="${x}" y="1305" width="${w}" height="70" rx="16" fill="rgba(0,0,0,.72)"/>
    <text x="540" y="1352" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="34" fill="white">${v}</text>`;
  } else if (kind === 'persistent' && seg.disclosure) {
    body = `<rect x="46" y="250" width="104" height="52" rx="12" fill="rgba(0,0,0,.68)"/>
    <text x="98" y="285" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="27" fill="white">${xml(seg.disclosure)}</text>`;
  }
  await sharp(Buffer.from(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">${body}</svg>`)).png().toFile(file);
}
function base(family: Family, focus: number) {
  if (family === 'native_people') {
    return `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)*${focus.toFixed(4)}:(in_h-1920)/2,format=yuv420p[v0]`;
  }
  const brightness = family === 'gameplay_focus' ? '-0.26' : '-0.20';
  const saturation = family === 'gameplay_focus' ? '0.76' : '0.88';
  const y = family === 'gameplay_focus' ? 600 : 575;
  return '[0:v]split=2[bg0][fg0];' +
    `[bg0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30,eq=brightness=${brightness}:saturation=${saturation}[bg];` +
    '[fg0]scale=1020:574:force_original_aspect_ratio=decrease,pad=1020:574:(ow-iw)/2:(oh-ih)/2:color=black[fg];' +
    `[bg]drawbox=x=26:y=${y-4}:w=1028:h=582:color=white@0.20:t=3[fr];[fr][fg]overlay=30:${y}[v0]`;
}
async function segment(source: string, output: string, seg: Segment, work: string, i: number) {
  const duration = Number(seg.duration);
  if (!(duration > 0 && duration <= 180)) throw new Error('BAD_SEGMENT_DURATION');
  const family = seg.family ?? 'native_people';
  const focus = Math.max(0, Math.min(1, seg.focus_x ?? .5));
  const hook = path.join(work,`hook-${i}.png`), req = path.join(work,`req-${i}.png`), disc = path.join(work,`disc-${i}.png`);
  await overlay(hook,seg,'hook'); await overlay(req,seg,'required'); await overlay(disc,seg,'persistent');
  const args = ['-y'];
  if ((seg.start ?? 0) > 0) args.push('-ss',String(seg.start));
  args.push('-t',String(duration));
  if (/^https:\/\//i.test(source)) {
    args.push(
      '-user_agent','MomentCircuitVercel/1.0',
      '-reconnect','1',
      '-reconnect_streamed','1',
      '-reconnect_delay_max','5',
      '-rw_timeout','30000000',
    );
  }
  args.push('-i',source,'-loop','1','-i',hook,'-loop','1','-i',req,'-loop','1','-i',disc);
  let filter = base(family,focus), cur='[v0]';
  if (seg.hook_line1 || seg.hook_line2 || (seg.disclosure && seg.disclosure_mode==='opening')) {
    const hd=Math.max(.6,Math.min(1.6,seg.hook_duration ?? 1.15));
    filter += `;${cur}[1:v]overlay=0:0:enable='between(t,0,${hd})'[v1]`; cur='[v1]';
  }
  if (seg.required_text) {
    const rd=Number(seg.required_duration ?? 0), en=rd>0?`enable='between(t,0,${rd})'`:'enable=1';
    filter += `;${cur}[2:v]overlay=0:0:${en}[v2]`; cur='[v2]';
  }
  if (seg.disclosure && seg.disclosure_mode==='persistent') {
    filter += `;${cur}[3:v]overlay=0:0[v3]`; cur='[v3]';
  }
  args.push('-filter_complex',filter,'-map',cur,'-map','0:a?','-c:v','libx264','-crf','18','-preset','veryfast','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',output);
  await run(args);
}
async function concat(parts: string[], output: string, work: string) {
  if (parts.length===1) return fsp.copyFile(parts[0]!,output);
  const list=path.join(work,'concat.txt');
  await fsp.writeFile(list,parts.map((p)=>`file '${p.replace(/'/g,"'\\''")}'`).join('\n')+'\n');
  try { await run(['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',output]); }
  catch { await run(['-y','-f','concat','-safe','0','-i',list,'-c:v','libx264','-crf','18','-preset','veryfast','-c:a','aac','-b:a','192k','-movflags','+faststart',output]); }
}
async function sheet(media: string, duration: number, work: string, id: string) {
  const tiles: Buffer[]=[];
  for (const [i,p] of [0.03,0.25,0.5,0.75,0.97].entries()) {
    const frame=path.join(work,`${id}-${i}.jpg`);
    await run(['-y','-ss',String(Math.max(.05,duration*p)),'-i',media,'-frames:v','1',frame]);
    tiles.push(await sharp(frame).resize(216,384,{fit:'cover'}).jpeg({quality:88}).toBuffer());
  }
  const out=path.join(work,`${id}-contact.jpg`);
  await sharp({create:{width:1080,height:384,channels:3,background:'#000'}})
    .composite(tiles.map((input,i)=>({input,left:i*216,top:0}))).jpeg({quality:88}).toFile(out);
  return out;
}
async function upload(client: ReturnType<typeof db>, file: string, object: string, type: string) {
  const { error } = await client.storage.from(BUCKET).upload(object,await fsp.readFile(file),{contentType:type,cacheControl:'3600',upsert:false});
  if (error) throw new Error(`UPLOAD_FAILED: ${error.message}`);
  return client.storage.from(BUCKET).getPublicUrl(object).data.publicUrl;
}
function normalize(p: RenderPayload) {
  if (!p?.source_url) throw new Error('SOURCE_URL_REQUIRED');
  const variants=p.variants?.length?p.variants:[{id:p.variant_id??'master',filename:p.filename??'momentcircuit.mp4',segments:p.segments??[]}];
  if (variants.some((v)=>!v.segments.length)) throw new Error('SEGMENTS_REQUIRED');
  return {...p,variants};
}
async function execute(id: string) {
  const client=db();
  const {data:claimed,error:ce}=await client.from('momentcircuit_render_jobs')
    .update({status:'rendering',started_at:new Date().toISOString(),error:null}).eq('id',id).eq('status','queued')
    .select('id,payload,campaign_id,campaign_name,story_family').maybeSingle();
  if (ce) throw new Error(`CLAIM_FAILED: ${ce.message}`);
  if (!claimed) {
    const {data}=await client.from('momentcircuit_render_jobs').select('id,status,result,error').eq('id',id).maybeSingle();
    return {duplicate:true,job:data};
  }
  const payload=normalize(claimed.payload as RenderPayload), work=await fsp.mkdtemp(path.join(os.tmpdir(),'mc-vercel-')), source=path.join(work,'source.mp4');
  try {
    const preferRemoteSeek = deepestStart(payload) >= DEEP_SEEK_SECONDS;
    const preparedSource=await prepareSource(payload.source_url,source,preferRemoteSeek), variants=[];
    const sourceInput=preparedSource.input;
    for (const v of payload.variants) {
      const vid=safe(v.id,'master'), parts:string[]=[]; let duration=0;
      for (let i=0;i<v.segments.length;i++) {
        const seg=v.segments[i]!; duration+=Number(seg.duration);
        const part=path.join(work,`${vid}-${i}.mp4`); await segment(sourceInput,part,seg,work,i); parts.push(part);
      }
      const final=path.join(work,`${vid}.mp4`); await concat(parts,final,work);
      const stat=await fsp.stat(final); if (!stat.size) throw new Error('EMPTY_RENDER');
      const actualDuration=await probeDuration(final).catch(()=>duration);
      const safeDuration=Math.max(.1,Math.min(duration,Math.max(.1,actualDuration-.08)));
      const contact=await sheet(final,safeDuration,work,vid);
      const tech={width:1080,height:1920,codec:'h264',duration_seconds:actualDuration,size_bytes:stat.size,source_bytes:preparedSource.bytes,source_mode:preparedSource.mode,template_system:'template-system-v3-2026-09-27'};
      const techFile=path.join(work,`${vid}-technical.json`); await fsp.writeFile(techFile,JSON.stringify(tech,null,2));
      const basePath=`${PREFIX}${safe(id)}/${crypto.randomUUID()}`;
      variants.push({
        variant:vid,
        media_url:await upload(client,final,`${basePath}-${safe(v.filename??vid+'.mp4')}`,'video/mp4'),
        contact_sheet_url:await upload(client,contact,`${basePath}-contact.jpg`,'image/jpeg'),
        technical_url:await upload(client,techFile,`${basePath}-technical.json`,'application/json'),
        duration_seconds:actualDuration,size_bytes:stat.size,technical_qc:'passed',visual_qc:'pending_manager_review'
      });
    }
    const result={version:1,status:'render_ready',rendered_at:new Date().toISOString(),source_url:payload.source_url,source_mode:preparedSource.mode,source_rights:payload.source_rights??null,story_family:payload.story_family??claimed.story_family??null,variants};
    const {error:ue}=await client.from('momentcircuit_render_jobs').update({status:'ready',result,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
    if (ue) throw new Error(`READY_UPDATE_FAILED: ${ue.message}`);
    return {duplicate:false,job_id:id,result};
  } catch (error) {
    const message=String(error instanceof Error?error.message:error).slice(0,4000);
    await client.from('momentcircuit_render_jobs').update({status:'failed',error:message,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
    throw error;
  } finally { await fsp.rm(work,{recursive:true,force:true}).catch(()=>undefined); }
}
export async function POST(request: NextRequest) {
  try {
    authorize(request);
    const body=(await request.json()) as {id?:string};
    if (!body.id) return NextResponse.json({error:'id_required'},{status:400});
    return NextResponse.json({ok:true,...await execute(body.id)});
  } catch (error) {
    const message=String(error instanceof Error?error.message:error), status=message==='UNAUTHORIZED'?401:500;
    console.error('MomentCircuit Vercel render failed',{error:message});
    return NextResponse.json({error:message},{status});
  }
}
