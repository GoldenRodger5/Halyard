import {Upload} from 'tus-js-client';
import crypto from 'node:crypto';
import {V4_PRIVATE_BUCKET} from './v4-segment-stage';

export function privateTusEndpoint(supabaseUrl:string){
  const url=new URL(supabaseUrl);
  const match=url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
  if(url.protocol!=='https:'||!match) throw new Error('SUPABASE_STORAGE_ORIGIN_INVALID');
  return `https://${match[1]}.storage.supabase.co/storage/v1/upload/resumable`;
}

export async function uploadPrivateContentAddressed(
  bytes:Buffer,objectPath:string,serviceRoleKey:string,supabaseUrl:string,
  contentType:'video/mp4'|'video/quicktime'='video/mp4'
){
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  const extension=contentType==='video/mp4'?'mp4':'mov';
  if(!bytes.length||!serviceRoleKey
    ||!/^momentcircuit\/(sources|segments)\/[A-Za-z0-9_./-]+$/.test(objectPath)
    ||objectPath.split('/').includes('..')
    ||!objectPath.endsWith(`/${sha}.${extension}`)){
    throw new Error('PRIVATE_UPLOAD_INPUT_INVALID');
  }
  return new Promise<void>((resolve,reject)=>{
    const upload=new Upload(bytes,{
      endpoint:privateTusEndpoint(supabaseUrl),
      headers:{authorization:`Bearer ${serviceRoleKey}`},
      metadata:{bucketName:V4_PRIVATE_BUCKET,objectName:objectPath,
        contentType,cacheControl:'3600'},
      chunkSize:6*1024*1024,
      retryDelays:[0,3000,5000,10000],
      uploadDataDuringCreation:true,
      removeFingerprintOnSuccess:true,
      onSuccess:()=>resolve(),
      onError:()=>reject(new Error('PRIVATE_UPLOAD_UNKNOWN'))
    });
    upload.start();
  });
}
