import {describe,expect,it} from 'vitest';
import {
  extractResponseTextAndCitations,
  normalizeCitationUrl,
  validateTrendResearch
} from './v4-trend-research';

describe('v4 trend research',()=>{
  const cited='https://example.com/story?utm_source=chatgpt.com';
  const raw={
    should_record:true,
    topic_key:'example_topic',
    heat:.8,velocity:.7,saturation:.3,novelty:.9,audience_adjacent_fit:.85,
    rationale:'Fresh launch evidence and current independent coverage support a rising topic.',
    sources:[{
      url:'https://example.com/story',
      title:'Example Story',
      date:'2026-10-02',
      finding:'A fresh launch generated current coverage and audience activity.'
    }]
  };

  it('accepts only citation-backed trend evidence',()=>{
    expect(validateTrendResearch(raw,[{url:cited,title:'Example Story'}])).toMatchObject({
      should_record:true,topic_key:'example_topic',heat:.8,
      sources:[{url:cited}]
    });
  });

  it('fails closed when no model source can be matched to a web citation',()=>{
    expect(()=>validateTrendResearch(raw,[{
      url:'https://other.example/news',
      title:'Different Article'
    }])).toThrow('TREND_CITATION_REQUIRED');
  });

  it('discards an uncited source instead of persisting it',()=>{
    const mixed={...raw,sources:[
      ...raw.sources,
      {url:'https://fake.example/invented',title:'Invented',date:'2026-10-02',
        finding:'This unsupported source must never be persisted as evidence.'}
    ]};
    const result=validateTrendResearch(mixed,[{url:cited,title:'Example Story'}]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.url).toBe(cited);
  });

  it('allows bounded no-record results without fabricated sources',()=>{
    expect(validateTrendResearch({
      ...raw,
      should_record:false,
      sources:[],
      rationale:'Bounded research did not produce enough current evidence to justify a durable signal.'
    },[]).should_record).toBe(false);
  });

  it('extracts authoritative web-search action sources without inline annotations',()=>{
    const result=extractResponseTextAndCitations({
      output:[
        {
          type:'web_search_call',
          action:{
            type:'search',
            sources:[{url:cited,title:'Example Story'}]
          }
        },
        {
          type:'message',
          content:[{
            type:'output_text',
            text:'{"ok":true}',
            annotations:[]
          }]
        }
      ]
    });
    expect(result.text).toBe('{"ok":true}');
    expect(result.citations).toEqual([{url:cited,title:'Example Story'}]);
  });

  it('extracts response output text and url citations',()=>{
    const result=extractResponseTextAndCitations({
      output:[{
        type:'message',
        content:[{
          type:'output_text',
          text:'{"ok":true}',
          annotations:[{type:'url_citation',url:cited,title:'Example'}]
        }]
      }]
    });
    expect(result.text).toBe('{"ok":true}');
    expect(result.citations).toEqual([{url:cited,title:'Example'}]);
    expect(normalizeCitationUrl('https://www.example.com/story?x=1'))
      .toBe('example.com/story');
  });
});
