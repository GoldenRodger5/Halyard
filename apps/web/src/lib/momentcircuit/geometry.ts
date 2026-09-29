import type {ShotPlan,SourceLayout} from './edit-plan';

export function validateProtectedFocus(shot: ShotPlan): void {
  const r=shot.protected_region;
  if (!r) return;
  if (shot.layout==='SINGLE_SPEAKER' || shot.layout==='INTERVIEW' || shot.layout==='CINEMATIC' || shot.layout==='FULLSCREEN_GAMEPLAY') {
    const min=Math.max(.05,r.x1-.12);
    const max=Math.min(.95,r.x2+.12);
    if (shot.focus_x<min || shot.focus_x>max) throw new Error('SHOT_FOCUS_MISSES_PROTECTED_SUBJECT');
  }
}

export function layoutNeedsContext(layout:SourceLayout):boolean {
  return layout==='TWO_SHOT' || layout==='SPLIT_SCREEN' || layout==='GAMEPLAY_PLUS_FACE';
}

export function shotDuration(shot:ShotPlan):number {
  const d=shot.end-shot.start;
  if (!Number.isFinite(d) || d<=0) throw new Error('SHOT_TIME_INVALID');
  return Number(d.toFixed(3));
}

export function sourcePreservingFilter(layout:SourceLayout,focus:number):string {
  if (layout==='VERTICAL_NATIVE') return '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,format=yuv420p[v0]';
  if (layout==='INTERVIEW') return '[0:v]crop=iw:ih*0.88:0:ih*0.06,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)*'+focus.toFixed(4)+':(in_h-1920)/2,format=yuv420p[v0]';
  if (layoutNeedsContext(layout)) return '[0:v]split=2[bg0][fg0];[bg0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=34,eq=brightness=-0.28:saturation=0.78[bg];[fg0]scale=1020:1810:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v0]';
  if (layout==='FULLSCREEN_GAMEPLAY') return '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)*'+focus.toFixed(4)+':(in_h-1920)/2,format=yuv420p[v0]';
  if (layout==='CINEMATIC') return '[0:v]split=2[bg0][fg0];[bg0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30,eq=brightness=-0.24:saturation=0.82[bg];[fg0]scale=1020:1810:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v0]';
  return '[0:v]crop=iw:ih*0.88:0:ih*0.06,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)*'+focus.toFixed(4)+':(in_h-1920)/2,format=yuv420p[v0]';
}
