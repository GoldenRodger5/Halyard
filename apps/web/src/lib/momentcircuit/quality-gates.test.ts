import {describe,expect,it} from 'vitest';
import {audiovisualLayer,coldViewerLayer,exactFinalPass,technicalLayer} from './quality-gates';

describe('MomentCircuit layered exact-final gates',()=>{
  it('requires every layer',()=>expect(exactFinalPass({technical:{pass:true},audiovisual:{pass:true},visual:{pass:false},cold_viewer:{pass:true}})).toBe(false));
  it('passes valid technical output only with audio',()=>{
    expect(technicalLayer({technical_qc:'passed',duration:12,size:40000,audio_present:true}).pass).toBe(true);
    expect(technicalLayer({technical_qc:'passed',duration:12,size:40000,audio_present:false}).reason).toBe('FINAL_AUDIO_MISSING');
  });
  it('fails required captions against empty or mismatched final audio',()=>{
    expect(audiovisualLayer({captions_required:true,transcript_nonempty:false,alignment_pass:false}).pass).toBe(false);
    expect(audiovisualLayer({captions_required:true,transcript_nonempty:true,alignment_pass:false}).reason).toBe('FINAL_CAPTION_AUDIO_MISMATCH');
  });
  it('lets a no-caption treatment pass without speech transcript',()=>expect(audiovisualLayer({captions_required:false,transcript_nonempty:false,alignment_pass:true}).pass).toBe(true));
  it('requires cold context, first second, payoff and ending independently',()=>{
    const good={cold_viewer_clarity:true,first_second_hook:true,payoff_complete:true,ending_complete:true};
    expect(coldViewerLayer(good).pass).toBe(true);
    for(const key of Object.keys(good) as Array<keyof typeof good>){
      expect(coldViewerLayer({...good,[key]:false}).pass).toBe(false);
    }
  });
});
