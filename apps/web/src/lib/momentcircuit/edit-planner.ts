import {validateEditSegment,type CaptionCue,type EditSegment,type PresentationMode,type ShotPlan,type SourceLayout} from './edit-plan';


const VALID_LAYOUTS = new Set<SourceLayout>([
  'VERTICAL_NATIVE','SINGLE_SPEAKER','TWO_SHOT','SPLIT_SCREEN','GAMEPLAY_PLUS_FACE','FULLSCREEN_GAMEPLAY','INTERVIEW','CINEMATIC',
]);

export function verifiedSourceLayout(shotMap: unknown): SourceLayout | undefined {
  if (!shotMap || typeof shotMap !== 'object' || Array.isArray(shotMap)) return undefined;
  const x=shotMap as Record<string,unknown>;
  const verified = x.representative_frames_verified===true || x.verified===true || x.visual_verified===true;
  if (!verified) return undefined;
  const direct=String(x.source_layout ?? x.layout ?? '').toUpperCase() as SourceLayout;
  if (VALID_LAYOUTS.has(direct)) return direct;
  const camera=String(x.camera ?? '').toLowerCase();
  if (camera.includes('split')) return 'SPLIT_SCREEN';
  if (camera.includes('two_shot') || camera.includes('two-shot')) return 'TWO_SHOT';
  if (camera.includes('interview')) return 'INTERVIEW';
  if (camera.includes('single') || camera.includes('medium_shot')) return 'SINGLE_SPEAKER';
  return undefined;
}

export type AiEditDecision = {
  presentation_mode?:PresentationMode;
  source_layout?:SourceLayout;
  focus_x?:number;
  shots?:Array<Partial<ShotPlan>>;
  headline?:string|null;
  headline_duration?:number;
};

export function buildVerifiedEditPlan(args:{
  decision:AiEditDecision;
  start:number;
  duration:number;
  caption_cues:CaptionCue[];
  captions_required:boolean;
  disclosure?:string;
  disclosure_mode?:'none'|'opening'|'persistent';
}):EditSegment{
  const mode=args.decision.presentation_mode??'NATIVE_SOURCE_ONLY';
  const layout=args.decision.source_layout??'SINGLE_SPEAKER';
  const focus=Number(args.decision.focus_x??.5);
  const rawShots=args.decision.shots?.length
    ? args.decision.shots.map((s)=>({
        start:Number(s.start),end:Number(s.end),focus_x:Number(s.focus_x??focus),
        layout:(s.layout??layout) as SourceLayout,
        ...(s.protected_region?{protected_region:s.protected_region}:{}),
      }))
    : [{start:0,end:args.duration,focus_x:focus,layout}];

  const headline=String(args.decision.headline??'').replace(/\s+/g,' ').trim();
  const headlineDuration=Math.min(4,Math.max(.8,Number(args.decision.headline_duration??2.4)));
  return validateEditSegment({
    edit_plan_version:1,
    start:args.start,
    duration:args.duration,
    presentation_mode:mode,
    source_layout:layout,
    shots:rawShots,
    ...(mode!=='NATIVE_SOURCE_ONLY'?{headline:{text:headline,start:0,end:Math.min(args.duration,headlineDuration)}}:{}),
    caption_cues:args.caption_cues,
    captions_required:args.captions_required,
    disclosure:args.disclosure,
    disclosure_mode:args.disclosure_mode??'none',
  });
}
