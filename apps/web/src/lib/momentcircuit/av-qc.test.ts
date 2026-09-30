import {describe,expect,it} from 'vitest';
import {assessCaptionAlignment,normalizeSpeech} from './av-qc';

describe('MomentCircuit final audio/caption alignment',()=>{
  it('normalizes punctuation and smart apostrophes',()=>{
    expect(normalizeSpeech("Georgia looked at me. She goes, ‘That was genius.’")).toEqual(['georgia','looked','at','me','she','goes','that','was','genius']);
  });
  it('passes an accurate final transcript with natural filler',()=>{
    const r=assessCaptionAlignment(
      ['Have you ever had purple Doritos?',"He said, yeah. I go, that's Thai food.",'Georgia looked at me.',"She goes, that was genius."],
      "Have you ever had purple Doritos? He said yeah and I go that's Thai food. Georgia looked at me. She goes that was genius."
    );
    expect(r.pass).toBe(true); expect(r.overall_coverage).toBeGreaterThan(.9); expect(r.payoff_coverage).toBe(1);
  });
  it('stays aligned when ASR omits two consecutive low-information words',()=>{
    const r=assessCaptionAlignment(
      [
        "Let's do couples therapy with me, you, and my couples therapist.",
        'I love it. I love the idea.',
        'I think it would be great.',
        'I have so much to tell her.',
        'Oh, never mind. This is a horrible idea.',
      ],
      "Let's do couples therapy with me, you, and my couples therapist. I love it. I love the idea. I think be great. I have so much to tell her. Oh, never mind. This is a horrible idea."
    );
    expect(r.pass).toBe(true);
    expect(r.overall_coverage).toBeGreaterThan(.9);
    expect(r.ordered_coverage).toBeGreaterThan(.9);
    expect(r.payoff_coverage).toBe(1);
  });
  it('fails when the payoff audio is missing even if setup matches',()=>{
    const r=assessCaptionAlignment(
      ['Have you ever had purple Doritos?',"He said, yeah. I go, that's Thai food.",'Georgia looked at me.',"She goes, that was genius."],
      "Have you ever had purple Doritos? He said yeah. I go that's Thai food. Georgia looked at me."
    );
    expect(r.pass).toBe(false); expect(r.payoff_coverage).toBeLessThan(.72);
  });
  it('handles normal ASR contractions without hiding real omissions',()=>{
    const r=assessCaptionAlignment(["Let's do couples therapy with me, you, and my couples therapist.",'I love it. I love the idea.','I think it would be great.','I have so much to tell her.','Oh, never mind. This is a horrible idea.'],"Let's do a couple's therapy with me, you and my couple's therapist. I love it. I love it. I love the idea. I think it'd be great. I have so much to tell her. Oh, never mind. This is a horrible idea.");
    expect(r.pass).toBe(true);expect(r.overall_coverage).toBeGreaterThan(.9);expect(r.ordered_coverage).toBeGreaterThan(.85);expect(r.payoff_coverage).toBe(1);
  });
  it('fails a materially wrong subtitle transcript',()=>{
    const r=assessCaptionAlignment(['I got fired from McDonalds for stealing chicken nuggets'],'I worked there for a long time and then I went home.');
    expect(r.pass).toBe(false); expect(r.overall_coverage).toBeLessThan(.5);
  });
  it('does not invent a speech requirement for clips without caption phrases',()=>{
    expect(assessCaptionAlignment([],'hello there').pass).toBe(true);
    expect(assessCaptionAlignment([],'').pass).toBe(true);
  });
  it('passes a bounded short-payoff ASR substitution only with near-exact global alignment',()=>{
    const setup=Array.from({length:66},(_,i)=>`word${i+1}`).join(' ');
    const r=assessCaptionAlignment([setup,'finish this game'],`${setup} complete this match`);
    expect(r.overall_coverage).toBeGreaterThanOrEqual(.95);
    expect(r.ordered_coverage).toBeGreaterThanOrEqual(.95);
    expect(r.payoff_coverage).toBeCloseTo(.333,3);
    expect(r.pass).toBe(true);
  });
  it('still fails a short payoff when the final audio is materially missing',()=>{
    const setup=Array.from({length:30},(_,i)=>`word${i+1}`).join(' ');
    const r=assessCaptionAlignment([setup,'finish this game'],setup);
    expect(r.pass).toBe(false);
  });

});
