import { describe, expect, it } from 'vitest';
import {
  chaptersFromBeats,
  formatTimestamp,
  MIN_CHAPTERS,
  MIN_CHAPTER_SECONDS,
  parseChapters,
} from './chapters.js';

const long = 600;

describe('formatTimestamp', () => {
  it('drops the hour below an hour and keeps it above', () => {
    // YouTube parses `m:ss` and `h:mm:ss`. A padded hour is not accepted, so
    // the two shapes are genuinely different rather than one padded template.
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(9)).toBe('0:09');
    expect(formatTimestamp(75)).toBe('1:15');
    expect(formatTimestamp(3600)).toBe('1:00:00');
    expect(formatTimestamp(3725)).toBe('1:02:05');
  });
});

describe('chaptersFromBeats', () => {
  const good = [
    { title: 'The problem', startSeconds: 0 },
    { title: 'What actually breaks', startSeconds: 40 },
    { title: 'The swap', startSeconds: 180 },
    { title: 'The result', startSeconds: 400 },
  ];

  it('emits one line per chapter in the format YouTube parses', () => {
    const result = chaptersFromBeats(good, long);
    expect(result.refusedReason).toBeNull();
    expect(result.lines).toEqual([
      '0:00 The problem',
      '0:40 What actually breaks',
      '3:00 The swap',
      '6:40 The result',
    ]);
  });

  it('round-trips through the description', () => {
    const parsed = parseChapters(chaptersFromBeats(good, long).lines.join('\n'));
    expect(parsed.map((c) => c.startSeconds)).toEqual([0, 40, 180, 400]);
  });

  it('merges a chapter that would be under the minimum, rather than emitting it', () => {
    /*
     * The whole point. One nine-second chapter makes YouTube ignore the entire
     * list — not just that entry — so a list containing one is worse than a
     * shorter list without it.
     */
    const result = chaptersFromBeats(
      [...good, { title: 'A blink', startSeconds: 404 }],
      long,
    );
    expect(result.refusedReason).toBeNull();
    expect(result.lines).toHaveLength(4);
    expect(result.lines.join('\n')).not.toContain('A blink');
    expect(result.notes.join(' ')).toContain('merged');
  });

  it('refuses when the first chapter is not 0:00', () => {
    // Shifting it to zero would mislabel whatever plays before it, so the plan
    // is reported wrong rather than quietly corrected.
    const result = chaptersFromBeats(
      good.map((b) => ({ ...b, startSeconds: b.startSeconds + 5 })),
      long,
    );
    expect(result.lines).toEqual([]);
    expect(result.refusedReason).toContain('0:00');
  });

  it(`refuses below ${MIN_CHAPTERS} chapters`, () => {
    const result = chaptersFromBeats(good.slice(0, 2), long);
    expect(result.lines).toEqual([]);
    expect(result.refusedReason).toContain(String(MIN_CHAPTERS));
  });

  it('refuses on a video too short to have chapters at all', () => {
    const result = chaptersFromBeats(good, 45);
    expect(result.lines).toEqual([]);
    expect(result.refusedReason).toContain('45s');
  });

  it('drops a last chapter that runs into the end of the video', () => {
    // It has no following chapter to be measured against, so it must clear the
    // minimum against the runtime — the one case a forward merge cannot fix.
    const result = chaptersFromBeats(
      [...good, { title: 'Trailing', startSeconds: long - 4 }],
      long,
    );
    expect(result.lines.join('\n')).not.toContain('Trailing');
    expect(result.notes.join(' ')).toContain(`within ${MIN_CHAPTER_SECONDS}s of the end`);
  });

  it('ignores a beat with no title instead of emitting a bare timestamp', () => {
    const result = chaptersFromBeats([...good, { title: '   ', startSeconds: 500 }], long);
    expect(result.refusedReason).toBeNull();
    expect(result.lines).toHaveLength(4);
  });
});

describe('chapters surviving the description', () => {
  /*
   * §223. The truncation seam. The chapter block is appended after the body
   * and the whole description is then cut at 5,000 characters, so a long body
   * silently eats the chapters — and the upload succeeds either way. Parsing
   * the finished string back is the only way that is ever visible.
   */
  it('reads back every chapter from a description that fits', () => {
    const lines = chaptersFromBeats(
      [
        { title: 'The problem', startSeconds: 0 },
        { title: 'What breaks', startSeconds: 60 },
        { title: 'The swap', startSeconds: 200 },
      ],
      600,
    ).lines;
    const description = ['A short body.', lines.join('\n'), 'https://example.com'].join('\n\n');
    expect(parseChapters(description)).toHaveLength(3);
  });

  it('reads back fewer when the limit cuts them off', () => {
    const lines = chaptersFromBeats(
      [
        { title: 'The problem', startSeconds: 0 },
        { title: 'What breaks', startSeconds: 60 },
        { title: 'The swap', startSeconds: 200 },
      ],
      600,
    ).lines;
    const body = 'x'.repeat(4990);
    const description = [body, lines.join('\n')].join('\n\n').slice(0, 5000);
    expect(parseChapters(description).length).toBeLessThan(lines.length);
  });

  it('does not mistake a plain number for a timestamp', () => {
    // "Bake 40 minutes" and "1:15 The swap" must not both parse as chapters.
    expect(parseChapters('Bake 40 minutes at 200C\nUse 2 cups of flour')).toEqual([]);
  });
});
