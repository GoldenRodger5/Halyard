import {describe,expect,it,vi} from 'vitest';
import {fetchPublicBrief} from './v4-public-brief';

const id='fixtureDocument01234567890';
const text='A verified campaign brief with exact terms and authorized source. '.repeat(3);
const content=()=>new Response(text,{status:200,
  headers:{'content-type':'text/plain; charset=utf-8'}});

describe('v4 public brief fetch boundary',()=>{
  it('follows only Google text export and hashes exact bytes',async()=>{
    const fetcher=vi.fn(async(url:URL)=>url.hostname==='docs.google.com'
      ?new Response(null,{status:307,headers:{location:
        `https://doc-01-x.googleusercontent.com/export/${id}?format=txt`}})
      :content());
    const result=await fetchPublicBrief(id,fetcher as typeof fetch);
    expect(result.sizeBytes).toBe(Buffer.byteLength(text));
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects an off-domain redirect',async()=>{
    const fetcher=vi.fn(async()=>new Response(null,{status:307,
      headers:{location:'https://evil.example/brief'}}));
    await expect(fetchPublicBrief(id,fetcher as typeof fetch))
      .rejects.toThrow('BRIEF_REDIRECT_NOT_ALLOWED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid identity, HTML and oversized payloads',async()=>{
    await expect(fetchPublicBrief('../bad')).rejects.toThrow('BRIEF_DOCUMENT_ID_INVALID');
    await expect(fetchPublicBrief(id,vi.fn(async()=>new Response('<html>',{
      status:200,headers:{'content-type':'text/html'}})) as typeof fetch))
      .rejects.toThrow('BRIEF_CONTENT_TYPE_INVALID');
    await expect(fetchPublicBrief(id,vi.fn(async()=>new Response('x'.repeat(1_000_001),{
      status:200,headers:{'content-type':'text/plain'}})) as typeof fetch))
      .rejects.toThrow('BRIEF_TOO_LARGE');
  });
});
