/**
 * The unsubscribe route, end to end.
 *
 * The newsletter footer pointed at `/u/<newsletterId>` — the same string for
 * every recipient, at a path with no route behind it. The opt-out was a 404
 * that could not have identified anybody even if it had resolved.
 *
 * These run against the real route and the real table. The one that matters
 * most is that a GET changes nothing: mail clients and scanners fetch every
 * link in a message, and an unsubscribe that happens on fetch removes people
 * for opening their mail.
 */
import { test, expect } from '@playwright/test';
import { db } from './fixtures';

const pool = db();

async function makeSubscriber(email: string): Promise<string> {
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  await pool.query('delete from subscribers where email = $1', [email]);
  const { rows } = await pool.query<{ unsubscribe_token: string }>(
    `insert into subscribers (product_id, email, confirmed_at)
     values ('recipefix', $1, now()) returning unsubscribe_token`,
    [email],
  );
  return rows[0]!.unsubscribe_token;
}

async function unsubscribedAt(email: string): Promise<string | null> {
  const { rows } = await pool.query<{ unsubscribed_at: string | null }>(
    'select unsubscribed_at from subscribers where email = $1',
    [email],
  );
  return rows[0]?.unsubscribed_at ?? null;
}

test('every subscriber gets a different token', async () => {
  const a = await makeSubscriber('unsub-a@example.com');
  const b = await makeSubscriber('unsub-b@example.com');
  expect(a).not.toBe(b);
  // Unguessable, because knowing it is the entire authorisation.
  expect(a.length).toBeGreaterThanOrEqual(32);
});

test('opening the link does not unsubscribe anyone', async ({ page }) => {
  const email = 'unsub-get@example.com';
  const token = await makeSubscriber(email);

  await page.goto(`/u/${token}`);
  await expect(page.getByRole('heading', { name: 'Unsubscribe?' })).toBeVisible();

  // A scanner or a preview fetching the link must not remove them.
  expect(await unsubscribedAt(email)).toBeNull();
});

test('confirming unsubscribes that subscriber and nobody else', async ({ page }) => {
  const email = 'unsub-post@example.com';
  const other = 'unsub-bystander@example.com';
  const token = await makeSubscriber(email);
  await makeSubscriber(other);

  await page.goto(`/u/${token}`);
  await page.getByRole('button', { name: 'Unsubscribe' }).click();

  await expect(page.getByRole('heading', { name: 'Unsubscribed' })).toBeVisible();
  expect(await unsubscribedAt(email)).not.toBeNull();
  expect(await unsubscribedAt(other)).toBeNull();
});

test('a provider one-click POST works without the confirmation page', async ({ request }) => {
  // RFC 8058: Gmail and Apple Mail post to the List-Unsubscribe URL directly.
  const email = 'unsub-oneclick@example.com';
  const token = await makeSubscriber(email);

  const response = await request.post(`/u/${token}`, {
    form: { 'List-Unsubscribe': 'One-Click' },
  });

  expect(response.status()).toBe(200);
  expect(await unsubscribedAt(email)).not.toBeNull();
});

test('an unknown token neither errors nor removes anything', async ({ page }) => {
  const email = 'unsub-safe@example.com';
  await makeSubscriber(email);

  await page.goto('/u/0000000000000000000000000000000000000000000000000000000000000000');
  await expect(page.getByRole('heading', { name: 'That link is not valid' })).toBeVisible();
  expect(await unsubscribedAt(email)).toBeNull();
});

test('unsubscribing twice keeps the first date', async ({ page, request }) => {
  const email = 'unsub-twice@example.com';
  const token = await makeSubscriber(email);

  await request.post(`/u/${token}`);
  const first = await unsubscribedAt(email);
  await request.post(`/u/${token}`);

  expect(await unsubscribedAt(email)).toEqual(first);
  await page.goto(`/u/${token}`);
  await expect(page.getByRole('heading', { name: 'You are already unsubscribed' })).toBeVisible();
});
