import {describe,expect,it} from 'vitest';
import {
  openAiTokenCostUsd,responseWebSearchCallCount,responsesUsage,
  transcriptionCostUsd,webSearchCostUsd
} from './openai-cost';

describe('OpenAI cost metering',()=>{
  it('prices GPT-5.5 usage conservatively at full input rate',()=>{
    expect(openAiTokenCostUsd('gpt-5.5',{prompt_tokens:10_000,completion_tokens:1_000}))
      .toBe(.08);
  });
  it('prices GPT-6 Luna usage',()=>{
    expect(openAiTokenCostUsd('gpt-6-luna',{input_tokens:100_000,output_tokens:10_000}))
      .toBe(.015);
  });
  it('prices transcription by exact duration',()=>{
    expect(transcriptionCostUsd('whisper-1',60)).toBe(.006);
    expect(transcriptionCostUsd('gpt-transcribe',120)).toBe(.009);
  });
  it('counts only actual Responses web-search calls',()=>{
    const body={usage:{input_tokens:10,output_tokens:5},output:[
      {type:'web_search_call'},{type:'message'},{type:'web_search_call'}]};
    expect(responseWebSearchCallCount(body)).toBe(2);
    expect(webSearchCostUsd(2)).toBe(.02);
    expect(responsesUsage(body)).toEqual({input_tokens:10,output_tokens:5});
  });
});
