import {describe,expect,it} from 'vitest';
import {privateTusEndpoint,uploadPrivateContentAddressed} from './v4-private-upload';

describe('MomentCircuit private resumable upload boundary',()=>{
  it('uses the direct Supabase Storage host',()=>{
    expect(privateTusEndpoint('https://aleiahgcxhglnsvaajzn.supabase.co'))
      .toBe('https://aleiahgcxhglnsvaajzn.storage.supabase.co/storage/v1/upload/resumable');
    expect(()=>privateTusEndpoint('http://aleiahgcxhglnsvaajzn.supabase.co'))
      .toThrow('SUPABASE_STORAGE_ORIGIN_INVALID');
    expect(()=>privateTusEndpoint('https://evil.example'))
      .toThrow('SUPABASE_STORAGE_ORIGIN_INVALID');
  });
  it('rejects a public or unscoped upload before opening a network request',async()=>{
    await expect(uploadPrivateContentAddressed(Buffer.from('bytes'),
      'momentcircuit/sources/not-a-segment.mp4','key','https://project.supabase.co'))
      .rejects.toThrow('PRIVATE_UPLOAD_INPUT_INVALID');
    await expect(uploadPrivateContentAddressed(Buffer.from('bytes'),
      `momentcircuit/segments/work/${'a'.repeat(64)}.mp4`,
      'key','https://project.supabase.co'))
      .rejects.toThrow('PRIVATE_UPLOAD_INPUT_INVALID');
  });
});
