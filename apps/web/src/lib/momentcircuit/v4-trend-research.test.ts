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
    expect(validateTrendResearch(raw,[cited])).toMatchObject({
      should_record:true,topic_key:'example_topic',heat:.8
    });
  });

  it('rejects a source URL the web response did not cite',()=>{
    expect(()=>validateTrendResearch(raw,['https://other.example/news']))
      .toThrow('TREND_SOURCE_NOT_CITATION_BACKED');
  });

  it('allows bounded no-record results without fabricated sources',()=>{
    expect(validateTrendResearch({
      ...raw,
      should_record:false,
      sources:[],
      rationale:'Bounded research did not produce enough current evidence to justify a durable signal.'
    },[]).should_record).toBe(false);
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
    expect(result.citations).toEqual([normalizeCitationUrl(cited)]);
  });
});
