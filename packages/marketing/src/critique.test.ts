import { describe, expect, it } from 'vitest';
import { aggregate, type Critique } from './critique.js';

const review = (s: [number, number, number, number], pro: boolean, cringe: string[] = []): Omit<Critique, 'samples'> => ({
  verdict: 'revise',
  scores: { stop: s[0], stay: s[1], engage: s[2], human: s[3] },
  cringe,
  pro_team_would_post: pro,
  would_leave_at: 'never',
  first_impression: `total ${s.reduce((a, b) => a + b, 0)}`,
  problems: [],
  fixes: [],
  model: 'm',
  cost_usd: 0,
  at: '',
});

describe('aggregate (median of several reviews)', () => {
  it('posts on median scores at the bar, majority pro-team, majority cringe-free', () => {
    const c = aggregate([review([7, 7, 6, 7], true), review([8, 7, 7, 7], true), review([6, 6, 5, 6], false, ['x'])]);
    expect(c.scores).toEqual({ stop: 7, stay: 7, engage: 6, human: 7 });
    expect(c.verdict).toBe('post');
    expect(c.cringe).toEqual([]);
    expect(c.samples).toHaveLength(3);
  });
  it('does not post when one score median is under the bar', () => {
    expect(aggregate([review([7, 7, 5, 7], true), review([7, 7, 5, 7], true), review([7, 7, 7, 7], true)]).verdict).toBe('revise');
  });
  it('does not post when most reviewers say a pro team would not post it', () => {
    expect(aggregate([review([8, 8, 8, 8], false), review([8, 8, 8, 8], false), review([8, 8, 8, 8], true)]).verdict).toBe('revise');
  });
  it('does not post when most reviewers found something cringe, and reports it', () => {
    const c = aggregate([review([8, 8, 8, 8], true, ['a']), review([8, 8, 8, 8], true, ['b']), review([8, 8, 8, 8], true)]);
    expect(c.verdict).toBe('revise');
    expect(c.cringe.length).toBeGreaterThan(0);
  });
});
