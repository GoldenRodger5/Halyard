export type PresentationMode =
  | 'NATIVE_SOURCE_ONLY'
  | 'HEADLINE_CARD_OPENING'
  | 'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES';

export type SourceLayout =
  | 'VERTICAL_NATIVE'
  | 'SINGLE_SPEAKER'
  | 'TWO_SHOT'
  | 'SPLIT_SCREEN'
  | 'GAMEPLAY_PLUS_FACE'
  | 'FULLSCREEN_GAMEPLAY'
  | 'INTERVIEW'
  | 'CINEMATIC';

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

export interface ProtectedRegion {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ShotPlan {
  start: number;
  end: number;
  focus_x: number;
  layout: SourceLayout;
  protected_region?: ProtectedRegion;
}

export interface HeadlinePlan {
  text: string;
  start: number;
  end: number;
}

export interface EditSegment {
  edit_plan_version: 1;
  start: number;
  duration: number;
  presentation_mode: PresentationMode;
  source_layout: SourceLayout;
  shots: ShotPlan[];
  headline?: HeadlinePlan;
  caption_cues: CaptionCue[];
  captions_required: boolean;
  disclosure?: string;
  disclosure_mode?: 'none' | 'opening' | 'persistent';
}

type LegacySegment = {
  start?: number;
  duration: number;
  focus_x?: number;
  crop_mode?: 'speaker' | 'two_shot' | 'action' | 'center';
  hook_line1?: string;
  hook_line2?: string;
  hook_text?: string;
  hook_duration?: number;
  disclosure?: string;
  disclosure_mode?: 'none' | 'opening' | 'persistent';
  caption_cues?: CaptionCue[];
  caption_words?: Array<{start:number;end:number;text:string}>;
  caption_mode?: 'PHRASE_CUES_ONLY';
  require_word_captions?: boolean;
  edit_plan_version?: number;
  presentation_mode?: PresentationMode;
  source_layout?: SourceLayout;
  shots?: ShotPlan[];
  headline?: HeadlinePlan;
};

const ARTIFACT = /(Dialogue:|Style:|Script Info|Format:|-->|,Cap,,|(?:^|\s)\d{1,2}:\d{2}:\d{2}[.,]\d+|["']?(?:start|end)["']?\s*:|\{\s*["']|\[\s*\{)/i;

function finite(value: unknown, error: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(error);
  return n;
}

function cleanText(value: unknown, error: string, max: number): string {
  const text = String(value ?? '').normalize('NFC').replace(/\s+/g,' ').trim();
  if (!text) throw new Error(error);
  if (text.length > max) throw new Error(error+'_TOO_LONG');
  if (ARTIFACT.test(text)) throw new Error('RAW_SUBTITLE_ARTIFACT_TOKEN');
  return text;
}

function validateRegion(r: ProtectedRegion): ProtectedRegion {
  const x1=finite(r.x1,'PROTECTED_REGION_INVALID');
  const y1=finite(r.y1,'PROTECTED_REGION_INVALID');
  const x2=finite(r.x2,'PROTECTED_REGION_INVALID');
  const y2=finite(r.y2,'PROTECTED_REGION_INVALID');
  if (x1<0 || y1<0 || x2>1 || y2>1 || x2<=x1 || y2<=y1) throw new Error('PROTECTED_REGION_INVALID');
  return {x1,y1,x2,y2};
}

export function validateCaptionCues(raw: unknown, duration: number, required: boolean): CaptionCue[] {
  if (!Array.isArray(raw)) {
    if (required) throw new Error('CAPTIONS_REQUIRED');
    return [];
  }
  const cues = raw.map((item)=>{
    if (!item || typeof item !== 'object') throw new Error('CAPTION_CUE_INVALID');
    const x=item as Record<string,unknown>;
    const start=finite(x.start,'CAPTION_TIME_INVALID');
    const end=finite(x.end,'CAPTION_TIME_INVALID');
    const text=cleanText(x.text,'CAPTION_TEXT_EMPTY',90);
    if (start<0 || end<=start || end>duration+0.05) throw new Error('CAPTION_TIME_INVALID');
    if (text.split(/\s+/).length>12) throw new Error('CAPTION_TOO_MANY_WORDS');
    return {start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),text};
  }).sort((a,b)=>a.start-b.start);
  for (let i=1;i<cues.length;i++) {
    if (cues[i]!.start < cues[i-1]!.end-0.001) throw new Error('CAPTION_OVERLAP');
  }
  if (required && cues.length===0) throw new Error('CAPTIONS_REQUIRED');
  return cues;
}

export function validateShots(raw: unknown, duration: number, layout: SourceLayout): ShotPlan[] {
  if (!Array.isArray(raw) || raw.length===0) throw new Error('SHOT_PLAN_REQUIRED');
  const shots=raw.map((item)=>{
    if (!item || typeof item!=='object') throw new Error('SHOT_PLAN_INVALID');
    const x=item as Record<string,unknown>;
    const start=finite(x.start,'SHOT_TIME_INVALID');
    const end=finite(x.end,'SHOT_TIME_INVALID');
    const focus=finite(x.focus_x,'SHOT_FOCUS_INVALID');
    const shotLayout=String(x.layout ?? layout) as SourceLayout;
    if (!VALID_LAYOUTS.has(shotLayout)) throw new Error('SOURCE_LAYOUT_INVALID');
    if (start<0 || end<=start || end>duration+0.05) throw new Error('SHOT_TIME_INVALID');
    if (focus<0.05 || focus>0.95) throw new Error('SHOT_FOCUS_INVALID');
    return {
      start:Number(start.toFixed(3)),
      end:Number(end.toFixed(3)),
      focus_x:Number(focus.toFixed(4)),
      layout:shotLayout,
      ...(x.protected_region ? {protected_region:validateRegion(x.protected_region as ProtectedRegion)} : {}),
    };
  }).sort((a,b)=>a.start-b.start);
  if (shots[0]!.start>0.01 || Math.abs(shots.at(-1)!.end-duration)>0.06) throw new Error('SHOT_PLAN_MUST_COVER_SEGMENT');
  for (let i=1;i<shots.length;i++) {
    if (Math.abs(shots[i]!.start-shots[i-1]!.end)>0.06) throw new Error('SHOT_PLAN_GAP_OR_OVERLAP');
  }
  return shots;
}

const VALID_MODES = new Set<PresentationMode>([
  'NATIVE_SOURCE_ONLY','HEADLINE_CARD_OPENING','HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES',
]);
const VALID_LAYOUTS = new Set<SourceLayout>([
  'VERTICAL_NATIVE','SINGLE_SPEAKER','TWO_SHOT','SPLIT_SCREEN','GAMEPLAY_PLUS_FACE',
  'FULLSCREEN_GAMEPLAY','INTERVIEW','CINEMATIC',
]);

export function validateEditSegment(raw: unknown): EditSegment {
  if (!raw || typeof raw!=='object') throw new Error('EDIT_PLAN_REQUIRED');
  const x=raw as Record<string,unknown>;
  if (x.edit_plan_version!==1) throw new Error('EDIT_PLAN_VERSION_REQUIRED');
  const start=finite(x.start ?? 0,'BAD_SEGMENT_START');
  const duration=finite(x.duration,'BAD_SEGMENT_DURATION');
  if (start<0) throw new Error('BAD_SEGMENT_START');
  if (duration<=0 || duration>180) throw new Error('BAD_SEGMENT_DURATION');
  const mode=String(x.presentation_mode ?? '') as PresentationMode;
  const layout=String(x.source_layout ?? '') as SourceLayout;
  if (!VALID_MODES.has(mode)) throw new Error('PRESENTATION_MODE_INVALID');
  if (!VALID_LAYOUTS.has(layout)) throw new Error('SOURCE_LAYOUT_INVALID');

  const captionsRequired=Boolean(x.captions_required);
  const cues=validateCaptionCues(x.caption_cues,duration,captionsRequired);
  const shots=validateShots(x.shots,duration,layout);

  let headline: HeadlinePlan|undefined;
  if (mode!=='NATIVE_SOURCE_ONLY') {
    if (!x.headline || typeof x.headline!=='object') throw new Error('HEADLINE_REQUIRED');
    const h=x.headline as Record<string,unknown>;
    const text=cleanText(h.text,'HEADLINE_TEXT_EMPTY',90);
    const hs=finite(h.start ?? 0,'HEADLINE_TIME_INVALID');
    const he=finite(h.end,'HEADLINE_TIME_INVALID');
    if (hs<0 || he<=hs || he>Math.min(duration,4.0)+0.05) throw new Error('HEADLINE_TIME_INVALID');
    headline={text,start:Number(hs.toFixed(3)),end:Number(he.toFixed(3))};
  } else if (x.headline) {
    throw new Error('NATIVE_SOURCE_ONLY_FORBIDS_HEADLINE');
  }
  if (mode==='HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES' && cues.length===0) throw new Error('CAPTIONS_REQUIRED');

  const disclosureMode=(x.disclosure_mode ?? 'none') as EditSegment['disclosure_mode'];
  if (!['none','opening','persistent'].includes(disclosureMode!)) throw new Error('DISCLOSURE_MODE_INVALID');
  const disclosure=x.disclosure ? cleanText(x.disclosure,'DISCLOSURE_TEXT_EMPTY',40) : undefined;
  if (disclosureMode!=='none' && !disclosure) throw new Error('DISCLOSURE_MODE_WITHOUT_TEXT');

  return {
    edit_plan_version:1,start,duration,presentation_mode:mode,source_layout:layout,shots,
    ...(headline?{headline}:{}),
    caption_cues:cues,captions_required:captionsRequired,
    ...(disclosure?{disclosure}:{}),disclosure_mode:disclosureMode,
  };
}

/** Explicit compatibility bridge for queued pre-vNext work. New work must write edit_plan_version=1. */
export function adaptLegacySegment(raw: LegacySegment): EditSegment {
  if (raw.edit_plan_version===1) return validateEditSegment(raw);
  if (raw.caption_words?.length) throw new Error('LEGACY_CAPTION_WORDS_FORBIDDEN');
  const duration=finite(raw.duration,'BAD_SEGMENT_DURATION');
  const headlineText=[raw.hook_line1,raw.hook_line2].filter(Boolean).join(' ').trim() || String(raw.hook_text ?? '').trim();
  const hasCaptions=Boolean(raw.require_word_captions || raw.caption_mode==='PHRASE_CUES_ONLY' || raw.caption_cues?.length);
  const layout: SourceLayout = raw.crop_mode==='two_shot' ? 'TWO_SHOT'
    : raw.crop_mode==='action' ? 'CINEMATIC'
    : 'SINGLE_SPEAKER';
  const mode: PresentationMode = headlineText
    ? (hasCaptions?'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES':'HEADLINE_CARD_OPENING')
    : 'NATIVE_SOURCE_ONLY';
  return validateEditSegment({
    edit_plan_version:1,
    start:raw.start ?? 0,
    duration,
    presentation_mode:mode,
    source_layout:layout,
    shots:[{start:0,end:duration,focus_x:raw.focus_x ?? 0.5,layout}],
    ...(headlineText?{headline:{text:headlineText,start:0,end:Math.min(duration,Math.max(.8,Math.min(3.0,raw.hook_duration ?? 1.8)))}}:{}),
    caption_cues:raw.caption_cues ?? [],
    captions_required:hasCaptions,
    disclosure:raw.disclosure,
    disclosure_mode:raw.disclosure_mode ?? 'none',
  });
}
