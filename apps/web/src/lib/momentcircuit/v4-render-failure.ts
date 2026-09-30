export type V4RenderFailureClass='COMPLIANCE'|'SYSTEMIC'|'TRANSIENT';

export function classifyV4RenderFailure(message:string):V4RenderFailureClass{
  if(/CONTRACT|RIGHTS|BUDGET|CAMPAIGN|SPEC|DISCLOSURE/.test(message)){
    return 'COMPLIANCE';
  }
  if(/FFMPEG|SEGMENT_SHA|OUTPUT_METADATA|RENDER_DURATION|RENDER_SIZE|V4_RENDER_CAPTION/.test(message)){
    return 'SYSTEMIC';
  }
  return 'TRANSIENT';
}
