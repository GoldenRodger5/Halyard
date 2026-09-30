import type {CaptionCue} from './edit-plan';

const TITLE_KEYS = ['title','refreshed_title','filename','original_filename','asset_title'] as const;
const BAKED_CAPTION_TITLE = /(?:^|[_\-\s])(subbed|captioned|hardcoded[-_\s]?subtitles?|burned[-_\s]?in[-_\s]?(?:captions?|subtitles?))(?:[_\-\s.]|$)/i;

export type SourceCaptionPolicy = {
  sourceHasBakedCaptions:boolean;
  renderDynamicCaptions:boolean;
  evidence:string[];
};

export function sourceCaptionPolicy(metadata:unknown):SourceCaptionPolicy{
  if(!metadata || typeof metadata!=='object' || Array.isArray(metadata)){
    return {sourceHasBakedCaptions:false,renderDynamicCaptions:true,evidence:[]};
  }
  const m=metadata as Record<string,unknown>;
  const evidence:string[]=[];
  for(const key of ['source_baked_captions','burned_in_subtitles','hardcoded_subtitles'] as const){
    if(m[key]===true) evidence.push(`metadata.${key}=true`);
  }
  for(const key of TITLE_KEYS){
    const value=typeof m[key]==='string'?m[key].trim():'';
    if(value && BAKED_CAPTION_TITLE.test(value)) evidence.push(`metadata.${key}=${value.slice(0,160)}`);
  }
  const sourceHasBakedCaptions=evidence.length>0;
  return {sourceHasBakedCaptions,renderDynamicCaptions:!sourceHasBakedCaptions,evidence};
}

export function captionCuesForRender(segment:{captions_required:boolean;caption_cues:CaptionCue[]}):CaptionCue[]{
  return segment.captions_required ? segment.caption_cues : [];
}
