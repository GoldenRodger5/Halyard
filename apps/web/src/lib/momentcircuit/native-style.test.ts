import sharp from 'sharp';
import {describe,expect,it} from 'vitest';
import {balancedNativeLines,renderMomentCircuitOverlay} from './overlay';

async function alphaBounds(png:Buffer){
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let minX=info.width,minY=info.height,maxX=-1,maxY=-1,count=0;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++){
    if(data[(y*info.width+x)*4+3]!>10){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}
  }
  return {minX,minY,maxX,maxY,count,width:info.width,height:info.height,data};
}

describe('MomentCircuit native reference style',()=>{
  it('wraps contextual headlines into at most three balanced lines',()=>{
    expect(balancedNativeLines('Agent explains to Pudgie how it feels to lose weight')).toEqual([
      'Agent explains to Pudgie how',
      'it feels to lose weight',
    ]);
    expect(balancedNativeLines('Wardrobe explains how his masseuse was racist to him')).toHaveLength(2);
  });

  it('renders the headline as a large top white card within safe margins',async()=>{
    const png=await renderMomentCircuitOverlay({hook_line1:'Agent explains to Pudgie how it feels to lose weight'},'hook');
    const b=await alphaBounds(png);
    expect(b.minX).toBeGreaterThanOrEqual(55);
    expect(b.maxX).toBeLessThanOrEqual(1025);
    expect(b.minY).toBeGreaterThanOrEqual(205);
    expect(b.maxY).toBeLessThan(600);
    let white=0,black=0;
    for(let i=0;i<b.data.length;i+=4){
      const r=b.data[i]!,g=b.data[i+1]!,bl=b.data[i+2]!,a=b.data[i+3]!;
      if(a>220 && r>240&&g>240&&bl>240) white++;
      if(a>220 && r<30&&g<30&&bl<30) black++;
    }
    expect(white).toBeGreaterThan(100_000);
    expect(black).toBeGreaterThan(2_000);
  });

  it('renders captions as outlined text without a full black caption card',async()=>{
    const png=await renderMomentCircuitOverlay({caption_text:"And I'm like this is wild"},'caption');
    const b=await alphaBounds(png);
    expect(b.minX).toBeGreaterThanOrEqual(90);
    expect(b.maxX).toBeLessThanOrEqual(890);
    expect(b.minY).toBeGreaterThanOrEqual(1260);
    expect(b.maxY).toBeLessThan(1480);
    const pixel=(x:number,y:number)=>b.data[(y*b.width+x)*4+3]!;
    expect(pixel(100,1350)).toBeLessThan(10);
    expect(b.count/(b.width*b.height)).toBeLessThan(0.12);
  });

  it('rejects over-dense headline cards rather than shrinking them into unreadable text',async()=>{
    await expect(renderMomentCircuitOverlay({hook_line1:'word '.repeat(35)},'hook')).rejects.toThrow();
  });
});
