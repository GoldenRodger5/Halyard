export interface BlotatoAccount {
  id:string;
  platform?:string;
  username?:string;
  fullname?:string;
}

export function parseBlotatoAccounts(input:unknown):BlotatoAccount[]{
  const row=(input&&typeof input==='object')?input as Record<string,unknown>:{};
  const raw=Array.isArray(input)
    ?input
    :Array.isArray(row.items)
      ?row.items
      :Array.isArray(row.accounts)
        ?row.accounts
        :Array.isArray(row.data)
          ?row.data
          :[];
  return raw.flatMap((value)=>{
    if(!value||typeof value!=='object') return [];
    const a=value as Record<string,unknown>;
    const id=String(a.id??a.accountId??'').trim();
    if(!id) return [];
    return [{
      id,
      platform:String(a.platform??a.type??a.network??'').toLowerCase()||undefined,
      username:String(a.username??a.handle??'').trim()||undefined,
      fullname:String(a.fullname??a.displayName??a.name??'').trim()||undefined
    }];
  });
}

export function chooseTikTokAccount(
  accounts:BlotatoAccount[],
  configuredId?:string|null
):BlotatoAccount{
  const tiktok=accounts.filter((a)=>a.platform==='tiktok');
  if(configuredId){
    const exact=tiktok.find((a)=>a.id===configuredId);
    if(!exact) throw new Error('BLOTATO_CONFIGURED_TIKTOK_ACCOUNT_NOT_FOUND');
    return exact;
  }
  if(tiktok.length===0) throw new Error('BLOTATO_TIKTOK_ACCOUNT_MISSING');
  if(tiktok.length>1) throw new Error('BLOTATO_TIKTOK_ACCOUNT_AMBIGUOUS');
  return tiktok[0]!;
}

export function buildSponsoredTikTokPost(args:{
  accountId:string;
  caption:string;
  mediaUrl:string;
  scheduledAt:string;
  isAiGenerated?:boolean;
}){
  if(!args.accountId) throw new Error('BLOTATO_ACCOUNT_ID_REQUIRED');
  if(!args.caption.trim()) throw new Error('BLOTATO_CAPTION_REQUIRED');
  if(!/^https:\/\//i.test(args.mediaUrl)) throw new Error('BLOTATO_MEDIA_URL_INVALID');
  const scheduledMs=Date.parse(args.scheduledAt);
  if(!Number.isFinite(scheduledMs)||scheduledMs<=Date.now()){
    throw new Error('BLOTATO_SCHEDULE_INVALID');
  }
  return {
    scheduledTime:new Date(scheduledMs).toISOString(),
    post:{
      accountId:args.accountId,
      content:{
        text:args.caption,
        mediaUrls:[args.mediaUrl],
        platform:'tiktok'
      },
      target:{
        targetType:'tiktok',
        privacyLevel:'PUBLIC_TO_EVERYONE',
        disabledComments:false,
        disabledDuet:false,
        disabledStitch:false,
        isBrandedContent:true,
        isYourBrand:false,
        isAiGenerated:args.isAiGenerated===true
      }
    }
  };
}

export function normalizeBlotatoStatus(input:unknown){
  const row=(input&&typeof input==='object')?input as Record<string,unknown>:{};
  const status=String(row.status??'').trim().toLowerCase();
  const publicUrl=typeof row.publicUrl==='string'
    ?row.publicUrl
    :typeof row.url==='string'?row.url:null;
  const platformPostId=typeof row.platformPostId==='string'
    ?row.platformPostId
    :typeof row.postId==='string'?row.postId:null;
  const scheduledAt=typeof row.scheduledTime==='string'
    ?row.scheduledTime
    :typeof row.scheduledAt==='string'?row.scheduledAt:null;
  const scheduleId=typeof row.scheduleId==='string'
    ?row.scheduleId
    :typeof row.schedule_id==='string'?row.schedule_id:null;
  return {
    status,
    publicUrl,
    platformPostId,
    scheduledAt,
    scheduleId,
    errorMessage:typeof row.errorMessage==='string'?row.errorMessage:null,
    raw:row
  };
}
