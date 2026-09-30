import {validateEditSegment,type EditSegment} from './edit-plan';

export type V4RepairSuggestion={
  action?:'NONE'|'REFRAME'|'REPLACE_HOOK'|'REFRAME_AND_HOOK';
  new_focus_x?:number;new_hook_text?:string;rationale?:string;
};

/** One bounded presentation repair; no source, timing or caption mutation. */
export function applyV4RepairPlan(original:unknown,suggestion:unknown):
  {plan:EditSegment;reason:string}|null{
  const first=validateEditSegment(original);
  if(!suggestion||typeof suggestion!=='object'||Array.isArray(suggestion)){
    return null;
  }
  const proposed=suggestion as V4RepairSuggestion;
  const action=proposed.action;
  if(!action||action==='NONE'||!['REFRAME','REPLACE_HOOK','REFRAME_AND_HOOK']
    .includes(action)) return null;
  const reason=String(proposed.rationale??'').trim();
  if(reason.length<12) return null;
  const next=structuredClone(first);
  if(action==='REFRAME'||action==='REFRAME_AND_HOOK'){
    const focus=Number(proposed.new_focus_x);
    if(!Number.isFinite(focus)||focus<0.08||focus>0.92
      ||next.shots.every((shot)=>Math.abs(shot.focus_x-focus)<0.04)){
      return null;
    }
    next.shots=next.shots.map((shot)=>({...shot,focus_x:focus}));
  }
  if(action==='REPLACE_HOOK'||action==='REFRAME_AND_HOOK'){
    if(!next.headline) return null;
    const headline=String(proposed.new_hook_text??'').trim();
    if(headline.length<8||headline===next.headline.text) return null;
    next.headline={...next.headline,text:headline};
  }
  const validated=validateEditSegment(next);
  if(JSON.stringify(validated)===JSON.stringify(first)) return null;
  return {plan:validated,reason};
}
