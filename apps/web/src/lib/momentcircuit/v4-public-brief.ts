import crypto from 'node:crypto';

const DOCUMENT_ID=/^[A-Za-z0-9_-]{20,120}$/;
const MAX_BYTES=1_000_000;

function allowedUrl(url:URL,redirect:boolean){
  if(url.protocol!=='https:'||url.port||url.username||url.password) return false;
  if(!redirect){
    return url.hostname==='docs.google.com'
      && /^\/document\/d\/[A-Za-z0-9_-]{20,120}\/export$/.test(url.pathname)
      && url.searchParams.get('format')==='txt';
  }
  return url.hostname.endsWith('.googleusercontent.com')
    ||url.hostname==='googleusercontent.com';
}

export async function fetchPublicBrief(documentId:string,
  fetcher:typeof fetch=fetch){
  if(!DOCUMENT_ID.test(documentId)) throw new Error('BRIEF_DOCUMENT_ID_INVALID');
  let url=new URL(`https://docs.google.com/document/d/${documentId}/export?format=txt`);
  for(let hop=0;hop<=4;hop++){
    if(!allowedUrl(url,hop>0)) throw new Error('BRIEF_REDIRECT_NOT_ALLOWED');
    const response=await fetcher(url,{redirect:'manual',cache:'no-store',
      signal:AbortSignal.timeout(20_000)});
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('location');
      if(!location||hop===4) throw new Error('BRIEF_REDIRECT_INVALID');
      url=new URL(location,url);
      continue;
    }
    if(response.status!==200) throw new Error(`BRIEF_HTTP_${response.status}`);
    if(!response.headers.get('content-type')?.toLowerCase().includes('text/plain')){
      throw new Error('BRIEF_CONTENT_TYPE_INVALID');
    }
    const length=Number(response.headers.get('content-length'));
    if(Number.isFinite(length)&&length>MAX_BYTES){
      throw new Error('BRIEF_TOO_LARGE');
    }
    if(!response.body) throw new Error('BRIEF_BODY_MISSING');
    const reader=response.body.getReader();
    const chunks:Uint8Array[]=[];
    let bytes=0;
    while(true){
      const {done,value}=await reader.read();
      if(done) break;
      bytes+=value.byteLength;
      if(bytes>MAX_BYTES){await reader.cancel();throw new Error('BRIEF_TOO_LARGE');}
      chunks.push(value);
    }
    if(bytes<100) throw new Error('BRIEF_TOO_SMALL');
    const body=Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),bytes);
    return {sha256:crypto.createHash('sha256').update(body).digest('hex'),
      sizeBytes:bytes};
  }
  throw new Error('BRIEF_REDIRECT_INVALID');
}
