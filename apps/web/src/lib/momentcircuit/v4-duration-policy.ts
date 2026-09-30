export const V4_DURATION_POLICY_VERSION='v4-duration-policy-20260930';
export const V4_RENDER_HEADROOM_SECONDS=0.1;
export const V4_PREFERRED_SELECTION_MARGIN_SECONDS=0.5;

export type V4DurationPolicy={
  version:string;
  contractMinSeconds:number;
  contractMaxSeconds:number|null;
  renderHeadroomSeconds:number;
  preferredSelectionMarginSeconds:number;
  renderSafeMinSeconds:number;
  preferredMinSeconds:number;
};

function ceilMillis(value:number){
  return Math.ceil((value-Number.EPSILON)*1000)/1000;
}

export function deriveV4DurationPolicy(args:{
  minVideoSeconds:number;
  maxVideoSeconds:number|null;
  renderHeadroomSeconds?:number;
  preferredSelectionMarginSeconds?:number;
}):V4DurationPolicy{
  const min=Number(args.minVideoSeconds);
  const max=args.maxVideoSeconds===null?null:Number(args.maxVideoSeconds);
  const headroom=args.renderHeadroomSeconds??V4_RENDER_HEADROOM_SECONDS;
  const preferredMargin=args.preferredSelectionMarginSeconds
    ??V4_PREFERRED_SELECTION_MARGIN_SECONDS;
  if(!Number.isFinite(min)||min<=0
    ||max!==null&&(!Number.isFinite(max)||max<min)
    ||!Number.isFinite(headroom)||headroom<0
    ||!Number.isFinite(preferredMargin)||preferredMargin<headroom){
    throw new Error('MINER_DURATION_POLICY_INVALID');
  }
  const renderSafeMin=ceilMillis(min+headroom);
  if(max!==null&&max+0.0005<renderSafeMin){
    throw new Error('MINER_DURATION_CONTRACT_UNRENDERABLE');
  }
  const desiredPreferred=ceilMillis(min+preferredMargin);
  const preferredMin=max===null?desiredPreferred:Math.min(max,desiredPreferred);
  return {
    version:V4_DURATION_POLICY_VERSION,
    contractMinSeconds:min,
    contractMaxSeconds:max,
    renderHeadroomSeconds:headroom,
    preferredSelectionMarginSeconds:preferredMargin,
    renderSafeMinSeconds:renderSafeMin,
    preferredMinSeconds:Math.max(renderSafeMin,preferredMin)
  };
}

export function effectiveV4CandidateMin(policy:V4DurationPolicy,sourceDurationSeconds:number){
  const duration=Number(sourceDurationSeconds);
  if(!Number.isFinite(duration)||duration<=0){
    throw new Error('MINER_SOURCE_DURATION_INVALID');
  }
  const physicalMax=Math.min(duration,policy.contractMaxSeconds??duration);
  if(physicalMax+0.0005<policy.renderSafeMinSeconds) return null;
  return Math.max(policy.renderSafeMinSeconds,
    Math.min(policy.preferredMinSeconds,physicalMax));
}

export function v4DurationPrompt(policy:V4DurationPolicy,sourceDurationSeconds:number){
  const effective=effectiveV4CandidateMin(policy,sourceDurationSeconds);
  const max=policy.contractMaxSeconds??Math.min(180,sourceDurationSeconds);
  if(effective===null){
    return 'Duration policy '+policy.version+'. Campaign legal minimum: '
      +policy.contractMinSeconds+'s. Renderer-safe minimum: '
      +policy.renderSafeMinSeconds+'s. Exact source duration: '
      +sourceDurationSeconds+'s. This source is physically too short to produce a qualifying clip. Return no candidates.';
  }
  return 'Duration policy '+policy.version+'. Campaign legal minimum: '
    +policy.contractMinSeconds+'s. Renderer-safe hard minimum: '
    +policy.renderSafeMinSeconds+'s. Preferred candidate minimum for this source: '
    +effective+'s. Maximum: '+max+'s. Every returned candidate must already satisfy the preferred minimum using meaningful source-native footage. '
    +'If a strong semantic core is shorter, widen its source boundaries with relevant setup, action, reaction or payoff. '
    +'Do not use silence, dead air, freezes, duplicated frames, slowdown or unrelated footage merely to reach duration.';
}
