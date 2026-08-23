/**
 * The pronunciation lexicon, end to end.
 *
 * `voice_lexicon` was read before every synthesis and written by nothing but a
 * test, while the delivery gate told the operator to add terms to it. These
 * exercise the surface that closes that — and, more importantly, that what the
 * operator types is what `tts` will read.
 */
import { test, expect } from '@playwright/test';
import { db } from './fixtures';

const pool = db();

test.beforeEach(async () => {
  await pool.query(`delete from voice_lexicon where term like 'e2e-%'`);
});

test('an operator can add a pronunciation and see it listed', async ({ page }) => {
  await page.goto('/settings/pronunciation');
  await expect(page.getByRole('heading', { name: 'Pronunciation' })).toBeVisible();

  await page.getByLabel('Term').fill('e2e-tamari');
  await page.getByLabel('Say it as').fill('tuh-MAR-ee');
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText('tuh-MAR-ee')).toBeVisible();

  /*
   * The row `tts` will actually load, not just the row the page renders.
   * Polled, not read once: a rendered page is not a committed transaction, and
   * reading straight after the action races it — gotcha 7.
   */
  await expect
    .poll(async () => {
      const { rows } = await pool.query<{ phonetic: string }>(
        `select phonetic from voice_lexicon where term = 'e2e-tamari'`,
      );
      return rows[0]?.phonetic ?? null;
    })
    .toBe('tuh-MAR-ee');
});

test('adding the same term again corrects it rather than duplicating', async ({ page }) => {
  await pool.query(
    `insert into voice_lexicon (product_id, term, phonetic) values (null, 'e2e-dupe', 'wrong')`,
  );

  await page.goto('/settings/pronunciation');
  await page.getByLabel('Term').fill('e2e-dupe');
  await page.getByLabel('Say it as').fill('right');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('right')).toBeVisible();

  // The unique index is on (product_id, term); a second row would be a silent
  // conflict between two spellings of the same word.
  await expect
    .poll(async () => {
      const { rows } = await pool.query<{ phonetic: string }>(
        `select phonetic from voice_lexicon where term = 'e2e-dupe'`,
      );
      return rows.map((r) => r.phonetic);
    })
    .toEqual(['right']);
});

test('a blank term is refused rather than substituting into every script', async ({ page }) => {
  await page.goto('/settings/pronunciation');
  const before = await pool.query('select count(*) as n from voice_lexicon');

  // Longest-first substitution means an empty term would match everywhere.
  await page.getByLabel('Say it as').fill('nothing');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(300);

  const after = await pool.query('select count(*) as n from voice_lexicon');
  expect(after.rows[0]).toEqual(before.rows[0]);
});

test('an operator can remove a term', async ({ page }) => {
  await pool.query(
    `insert into voice_lexicon (product_id, term, phonetic) values (null, 'e2e-gone', 'gawn')`,
  );

  await page.goto('/settings/pronunciation');
  await page.getByRole('button', { name: 'Remove the pronunciation for e2e-gone' }).click();

  await expect(page.getByText('gawn')).toHaveCount(0);
  await expect
    .poll(async () => (await pool.query(`select 1 from voice_lexicon where term = 'e2e-gone'`)).rows.length)
    .toBe(0);
});
