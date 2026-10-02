import {describe,expect,it} from 'vitest';
import {validateCampaignDeepRead} from './v4-campaign-deep-read';

const campaignPage='https://contentrewards.com/discover/campaign-1';
const sourceUrl='https://www.youtube.com/@creator';
const citations=[
  {url:campaignPage,title:'Campaign Brief'},
  {url:sourceUrl,title:'Creator Channel'}
];

const executable={
  outcome:'EXECUTABLE',
  decision:'PROBE_CHALLENGER_CURRENT',
  brief_url:campaignPage,
  category_fit:'CORE',
  language:'English',
  platforms:['tiktok','youtube'],
  account_fit:true,
  account_fit_reason:'Main English entertainment account fits the campaign.',
  dedicated_page_required:false,
  rights_clear:true,
  rights_summary:'Campaign brief explicitly supplies creator source material for clipping.',
  source_provider:'authorized_youtube_twitch',
  source_references:[sourceUrl],
  source_authorization:'Campaign brief explicitly permits clips from the supplied creator channel.',
  source_work_allowed:true,
  publish_allowed:true,
  disclosure_required:true,
  min_video_seconds:10,
  blockers:[],
  rationale:'Current brief, source reference, account fit and rights all support a bounded probe.',
  sources:[
    {url:campaignPage,title:'Campaign Brief',date:'2026-10-02',
      finding:'The current campaign is accepting eligible English entertainment clips.'},
    {url:sourceUrl,title:'Creator Channel',date:'2026-10-02',
      finding:'The official creator channel is current and is the supplied source reference.'}
  ]
};

describe('v4 campaign deep read',()=>{
  it('accepts an executable campaign only with autonomous grounded source',()=>{
    expect(validateCampaignDeepRead({
      raw:executable,
      citations,
      providerStates:{authorized_youtube_twitch:'READY_AUTONOMOUS'}
    })).toMatchObject({
      outcome:'EXECUTABLE',
      source_provider:'authorized_youtube_twitch',
      source_references:[sourceUrl]
    });
  });

  it('rejects executable use of a non-autonomous source adapter',()=>{
    expect(()=>validateCampaignDeepRead({
      raw:{...executable,source_provider:'campaign_supplied_wetransfer'},
      citations,
      providerStates:{campaign_supplied_wetransfer:'OWNER_AUTH_REQUIRED'}
    })).toThrow('CAMPAIGN_EXECUTABLE_SOURCE_PROVIDER_NOT_AUTONOMOUS');
  });

  it('rejects executable source references not grounded by web search',()=>{
    expect(()=>validateCampaignDeepRead({
      raw:{...executable,source_references:['https://www.youtube.com/@invented']},
      citations,
      providerStates:{authorized_youtube_twitch:'READY_AUTONOMOUS'}
    })).toThrow('CAMPAIGN_EXECUTABLE_SOURCE_REFERENCE_UNGROUNDED');
  });

  it('allows a fail-closed blocked contract with no source access',()=>{
    const blocked={
      ...executable,
      outcome:'BLOCKED',
      decision:'SKIP_SOURCE_UNAVAILABLE_NOW',
      source_provider:'campaign_supplied_wetransfer',
      source_references:[],
      source_authorization:'',
      source_work_allowed:false,
      publish_allowed:false,
      rights_clear:false,
      rights_summary:'The campaign source cannot be used autonomously yet.',
      blockers:['OWNER_AUTH_REQUIRED'],
      rationale:'The topic fits, but source authorization is not available to the cloud pipeline.'
    };
    expect(validateCampaignDeepRead({
      raw:blocked,
      citations:[{url:campaignPage,title:'Campaign Brief'}],
      providerStates:{campaign_supplied_wetransfer:'OWNER_AUTH_REQUIRED'}
    }).outcome).toBe('BLOCKED');
  });

  it('rejects a non-executable decision that tries to leave publish enabled',()=>{
    expect(()=>validateCampaignDeepRead({
      raw:{...executable,outcome:'SKIP',source_work_allowed:false,publish_allowed:true},
      citations,
      providerStates:{authorized_youtube_twitch:'READY_AUTONOMOUS'}
    })).toThrow('CAMPAIGN_BLOCKED_FLAGS_INVALID');
  });

  it('rejects regulated categories from executable status',()=>{
    expect(()=>validateCampaignDeepRead({
      raw:{...executable,category_fit:'REGULATED'},
      citations,
      providerStates:{authorized_youtube_twitch:'READY_AUTONOMOUS'}
    })).toThrow('CAMPAIGN_EXECUTABLE_CATEGORY_INVALID');
  });

  it('rejects dedicated-page campaigns from the main account',()=>{
    expect(()=>validateCampaignDeepRead({
      raw:{...executable,dedicated_page_required:true},
      citations,
      providerStates:{authorized_youtube_twitch:'READY_AUTONOMOUS'}
    })).toThrow('CAMPAIGN_EXECUTABLE_ACCOUNT_FIT_INVALID');
  });
});
