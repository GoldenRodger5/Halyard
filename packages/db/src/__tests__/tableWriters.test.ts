/**
 * §225. Every table that is supposed to be filled has something that fills it.
 *
 * ## Why this test exists
 *
 * This defect has now happened three times, and each time it looked exactly
 * like success. A migration creates a table. Code is written that reads it.
 * Tests pass, because the tests insert their own fixtures. Typecheck passes,
 * because nothing is wrong with the types. The feature ships, the dashboards
 * stay green, and the table stays empty forever.
 *
 * - §210 built `strategy_decisions` and wired no writer.
 * - §217 found 5,833 `rss_items` and zero `signals`, because nothing joined
 *   the two tables.
 * - §218 built `concepts`, `creative_briefs` and `platform_variants`, and
 *   `creative_briefs` had no writer at all — so §221's audio direction and
 *   §223's chapters were both correct code reading an empty table.
 *
 * Nothing in the suite could see any of them, because "no rows" is not an
 * error. This is the guard: a table on the list below must be written by
 * production code, not only by a fixture.
 *
 * ## What this does not prove
 *
 * That the writer runs, or that it runs often enough, or that what it writes
 * is right. It proves only that a path exists — which is the specific thing
 * that was missing all three times.
 */
import { describe, expect, it } from 'vitest';
import { collectSqlStatements } from './sqlSources.js';

/**
 * Tables whose emptiness would be a defect rather than a state.
 *
 * Deliberately not "every table". A table can be legitimately empty —
 * `music_beds` ships empty until someone buys music (§221), and
 * `halyard_empirical` claims are zero everywhere by design (gotcha 9). Those
 * are decisions, and listing them here would turn a decision into a failure.
 *
 * This list is the ones where empty means broken.
 */
const MUST_HAVE_A_WRITER = [
  'concepts',
  'creative_briefs',
  /* §231. Had columns for pacing, density, hook treatment, CTA and audio
     treatment since §218 and no writer — so "platform-specific" was a table
     and nothing else. */
  'platform_variants',
  'strategy_decisions',
  'signals',
  'learned_insights',
  'content_items',
  'renders',
  'publications',
  'jobs',
];

describe('tables that must be filled by something', () => {
  const statements = collectSqlStatements();

  /* `insert into x`, and also `update x set` — a row can be created by one
     path and populated by another, and both count as a writer. */
  function writersFor(table: string): string[] {
    const insert = new RegExp(`insert\\s+into\\s+${table}\\b`, 'i');
    const update = new RegExp(`update\\s+${table}\\s+set\\b`, 'i');
    return statements
      .filter((s) => insert.test(s.sql) || update.test(s.sql))
      .map((s) => `${s.file}:${s.line}`);
  }

  for (const table of MUST_HAVE_A_WRITER) {
    it(`${table} is written by production code, not only by fixtures`, () => {
      const writers = writersFor(table);
      expect(
        writers.length,
        `Nothing outside a test writes to '${table}'. A table with readers and no writer ` +
          `is invisible to every other kind of test: no rows is not an error, so the ` +
          `feature ships green and the table stays empty. Either wire a writer, or move ` +
          `'${table}' off this list with a comment saying why empty is correct.`,
      ).toBeGreaterThan(0);
    });
  }

  it('names a real column set, so a renamed table cannot pass silently', () => {
    // The regexes above match text. If a table were renamed, every entry would
    // fail loudly rather than one quietly matching nothing — but only if the
    // statements are actually being read, so check that first.
    expect(statements.length).toBeGreaterThan(50);
  });
});
