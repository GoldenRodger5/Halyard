import {describe,expect,it} from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {runV4Ffmpeg} from './v4-stage-worker';
import {renderV4EditSegment} from './v4-render-engine';
import {parseFfmpegDuration} from './v4-segment-stage';

describe('v4 exact-segment renderer',()=>{
  it('executes a sealed source-native plan with timed headline and captions',
    async()=>{
      execFileSync('node',['scripts/prepare-ffmpeg.mjs'],{
        cwd:path.resolve('apps/web'),stdio:'ignore'});
      const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'mc-v4-render-test-'));
      try{
        const source=path.join(dir,'source.mp4');
        const output=path.join(dir,'output.mp4');
        await runV4Ffmpeg(['-y','-f','lavfi','-i',
          'color=c=blue:s=270x480:r=24','-f','lavfi','-i',
          'sine=frequency=440:sample_rate=44100','-t','1.6',
          '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',
          '-shortest',source],false,30_000);
        await renderV4EditSegment(source,output,{
          edit_plan_version:1,start:0,duration:1.6,
          presentation_mode:'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES',
          source_layout:'VERTICAL_NATIVE',
          shots:[{start:0,end:1.6,focus_x:0.5,layout:'VERTICAL_NATIVE'}],
          headline:{text:'A surprise appears',start:0,end:1.0},
          caption_cues:[{start:0.2,end:1.3,text:'Hello there'}],
          captions_required:true,disclosure_mode:'none'
        },dir);
        const probe=await runV4Ffmpeg(['-i',output],true,20_000);
        expect(probe).toMatch(/Video:\s*h264[^\n]*1080x1920/);
        expect(probe).toMatch(/Audio:\s*aac/);
        expect(parseFfmpegDuration(probe)).toBeGreaterThan(1.45);
        expect(parseFfmpegDuration(probe)).toBeLessThan(1.75);
        expect((await fsp.stat(output)).size).toBeGreaterThan(10_000);
      }finally{
        await fsp.rm(dir,{recursive:true,force:true});
      }
    },120_000);

  it('renders a full 30-second captioned segment within the worker budget',async()=>{
    execFileSync('node',['scripts/prepare-ffmpeg.mjs'],{
      cwd:path.resolve('apps/web'),stdio:'ignore'});
    const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'mc-v4-render-long-'));
    try{
      const source=path.join(dir,'source.mp4');
      const output=path.join(dir,'output.mp4');
      await runV4Ffmpeg(['-y','-f','lavfi','-i',
        'color=c=blue:s=640x360:r=24','-f','lavfi','-i',
        'sine=frequency=440:sample_rate=44100','-t','29.8',
        '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',
        '-shortest',source],false,30_000);
      const started=Date.now();
      await renderV4EditSegment(source,output,{
        edit_plan_version:1,start:0,duration:29.8,
        presentation_mode:'HEADLINE_CARD_PLUS_DYNAMIC_SUBTITLES',
        source_layout:'CINEMATIC',
        shots:[{start:0,end:29.8,focus_x:0.5,layout:'CINEMATIC'}],
        headline:{text:'An unexpected story unfolds',start:0,end:1.8},
        caption_cues:Array.from({length:20},(_,index)=>({
          start:index*1.45,end:index*1.45+1.2,
          text:`The story continues with moment ${index+1}`})),
        captions_required:true,disclosure_mode:'none'
      },dir);
      const elapsed=Date.now()-started;
      const probe=await runV4Ffmpeg(['-i',output],true,20_000);
      expect(parseFfmpegDuration(probe)).toBeGreaterThan(29.6);
      expect(elapsed).toBeLessThan(120_000);
    }finally{
      await fsp.rm(dir,{recursive:true,force:true});
    }
  },160_000);
});
