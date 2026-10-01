import {describe,expect,it} from 'vitest';
import {parseBlotatoSchedules,resolveBlotatoSchedule} from './logic';

describe('Blotato schedule identity',()=>{
  it('prefers exact submission identity',()=>{
    const schedules=parseBlotatoSchedules({items:[
      {id:'sched-a',accountId:'61612',scheduledTime:'2026-10-01T23:00:00Z',
        postSubmissionId:'submission-a'},
      {id:'sched-b',accountId:'61612',scheduledTime:'2026-10-02T00:00:00Z',
        postSubmissionId:'submission-b'}
    ]});
    expect(resolveBlotatoSchedule({schedules,submissionId:'submission-b',
      accountId:'61612',scheduledAt:'2026-10-02T00:00:00Z'})?.id)
      .toBe('sched-b');
  });

  it('falls back to unique account and scheduled time',()=>{
    const schedules=parseBlotatoSchedules({items:[
      {id:'sched-a',post:{accountId:'61612'},scheduledAt:'2026-10-01T23:00:30Z'},
      {id:'sched-b',post:{accountId:'99999'},scheduledAt:'2026-10-01T23:00:00Z'}
    ]});
    expect(resolveBlotatoSchedule({schedules,submissionId:'unknown',
      accountId:'61612',scheduledAt:'2026-10-01T23:00:00Z'})?.id)
      .toBe('sched-a');
  });

  it('fails closed on ambiguous account/time matches',()=>{
    const schedules=parseBlotatoSchedules({items:[
      {id:'sched-a',accountId:'61612',scheduledTime:'2026-10-01T23:00:00Z'},
      {id:'sched-b',accountId:'61612',scheduledTime:'2026-10-01T23:00:20Z'}
    ]});
    expect(()=>resolveBlotatoSchedule({schedules,accountId:'61612',
      scheduledAt:'2026-10-01T23:00:00Z'}))
      .toThrow('BLOTATO_SCHEDULE_MATCH_AMBIGUOUS');
  });
});
