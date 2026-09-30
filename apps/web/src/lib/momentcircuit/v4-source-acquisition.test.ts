import {afterEach,describe,expect,it,vi} from 'vitest';
import {
  assertSourceLease,fetchAuthorizedSourceBytes,isClaimOneSourceRequest,
  parseSourceProbe,parseV4SourceRequest,
  sourceMediaType,sourceUrlAllowed,
  v4SourceObjectPath
} from './v4-source-acquisition';

const id='00000000-0000-4000-8000-000000000111';
const manifest='00000000-0000-4000-8000-000000000112';
afterEach(()=>vi.unstubAllGlobals());

describe('v4 source acquisition boundary',()=>{
  it('accepts only a leased source job with the current fingerprint and rights',()=>{
    const input={job:{id,work_id:id,kind:'source_worker',status:'LEASED',
      lease_owner:'source-worker',lease_epoch:2,
      lease_until:new Date(Date.now()+900_000).toISOString()},
    work:{id,work_kind:'source',state:'CAMPAIGN_SELECTED',campaign_contract_id:id},
    request:{source_work_id:id,campaign_contract_id:id,
      expected_provider_fingerprint:'provider-fingerprint'},
    current:{campaign_contract_id:id,provider_fingerprint:'provider-fingerprint',
      source_url:'https://media.cloudfront.net/asset.mp4',
      rights_valid_until:new Date(Date.now()+3_600_000).toISOString(),
      source_manifest_id:manifest},worker:'source-worker',leaseEpoch:2,now:Date.now()};
    expect(assertSourceLease(input).bucket).toBe('momentcircuit-private');
    expect(()=>assertSourceLease({...input,leaseEpoch:1})).toThrow('SOURCE_LEASE_INVALID');
    expect(()=>assertSourceLease({...input,current:{...input.current,
      provider_fingerprint:'revised-fingerprint'}})).toThrow('SOURCE_CURRENT_IDENTITY_OR_RIGHTS_INVALID');
    expect(()=>assertSourceLease({...input,current:{...input.current,
      rights_valid_until:new Date(Date.now()+60_000).toISOString()}})).toThrow('SOURCE_CURRENT_IDENTITY_OR_RIGHTS_INVALID');
  });

  it('rejects unsafe origins and keeps the exact hash in the private path',()=>{
    expect(sourceUrlAllowed('https://a.cloudfront.net/video.mp4')).toBe(true);
    expect(sourceUrlAllowed('https://x.amazonaws.com/video.mp4')).toBe(true);
    for(const url of ['http://a.cloudfront.net/video.mp4',
      'https://cloudfront.net.evil.example/asset.mp4',
      'https://user:password@a.cloudfront.net/asset.mp4',
      'https://127.0.0.1/asset.mp4']){
      expect(sourceUrlAllowed(url)).toBe(false);
    }
    expect(v4SourceObjectPath(id,'a'.repeat(64),'video/mp4'))
      .toBe(`momentcircuit/sources/${id}/${'a'.repeat(64)}.mp4`);
    expect(()=>parseV4SourceRequest({job_id:id,worker:'source-worker',lease_epoch:0}))
      .toThrow('SOURCE_REQUEST_INVALID');
    expect(isClaimOneSourceRequest({claim_one:true})).toBe(true);
    expect(isClaimOneSourceRequest({claim_one:true,job_id:id})).toBe(false);
  });

  it('requires an MP4 or QuickTime file signature',()=>{
    const mp4=Buffer.from('0000ftypisommore bytes');
    const mov=Buffer.from('0000ftypqt  more bytes');
    expect(sourceMediaType(mp4)).toBe('video/mp4');
    expect(sourceMediaType(mov)).toBe('video/quicktime');
    expect(()=>sourceMediaType(Buffer.from('<html>not a video</html>')))
      .toThrow('SOURCE_MEDIA_NOT_MP4_OR_QUICKTIME');
    expect(parseSourceProbe('Duration: 00:12:05.25, start: 0.0\nStream #0:0: Video: h264'))
      .toBe(725.25);
    expect(()=>parseSourceProbe('Duration: 00:00:07.82\nStream #0:0: Video: h264'))
      .toThrow('SOURCE_VIDEO_DURATION_INVALID');
    expect(()=>parseSourceProbe('Duration: 00:12:05.25\nStream #0:0: Audio: aac'))
      .toThrow('SOURCE_VIDEO_PROBE_FAILED');
  });

  it('rejects a redirect to an unapproved host before fetching it',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:302,
      headers:{location:'https://127.0.0.1/private'}}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(fetchAuthorizedSourceBytes('https://media.cloudfront.net/a.mp4'))
      .rejects.toThrow('SOURCE_ORIGIN_NOT_ALLOWED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized source before reading its body',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response('body',{
      headers:{'content-length':'150000001'}}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(fetchAuthorizedSourceBytes('https://media.cloudfront.net/a.mp4'))
      .rejects.toThrow('SOURCE_EXCEEDS_BOUNDED_ADAPTER');
  });

  it('hashes exact fetched media bytes',async()=>{
    const bytes=Buffer.alloc(1200,0);
    bytes.write('ftypisom',4,'ascii');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes))));
    const result=await fetchAuthorizedSourceBytes('https://media.cloudfront.net/a.mp4');
    expect(result.bytes.equals(bytes)).toBe(true);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.contentType).toBe('video/mp4');
  });
});
