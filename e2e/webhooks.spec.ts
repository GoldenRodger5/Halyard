/**
 * The Meta webhook callback.
 *
 * Every property here is checkable offline: the handshake is a string
 * comparison and the signature is an HMAC. What cannot be checked without Meta
 * is that Meta actually calls it — the subscription is a portal action, and no
 * test here pretends otherwise.
 *
 * The assertions that matter are the refusals. This is an unauthenticated,
 * publicly reachable route that enqueues work.
 */
import { createHmac } from 'node:crypto';
import { db, expect, test } from './fixtures';

const PATH = '/api/webhooks/meta';

function sign(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

test.describe('meta webhook', () => {
  test.afterEach(async () => {
    await db().query(`delete from audit_log where entity_type = 'webhook'`);
    await db().query(`delete from jobs where dedupe_key like 'webhook_comments:%'`);
  });

  test('refuses the handshake when no verify token is configured', async ({ request }) => {
    /**
     * The dev environment has no `META_WEBHOOK_VERIFY_TOKEN`, which is exactly
     * the state this must refuse: answering the handshake without one would let
     * a subscription attach to an endpoint that can verify nothing afterwards.
     */
    const response = await request.get(
      `${PATH}?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=12345`,
    );
    expect([403, 503]).toContain(response.status());
    expect(await response.text()).not.toContain('12345');
  });

  test('never echoes the challenge for a wrong token', async ({ request }) => {
    const response = await request.get(
      `${PATH}?hub.mode=subscribe&hub.verify_token=definitely-wrong&hub.challenge=54321`,
    );
    expect(response.status()).not.toBe(200);
    expect(await response.text()).not.toContain('54321');
  });

  test('rejects a POST with no signature', async ({ request }) => {
    const response = await request.post(PATH, {
      data: { object: 'instagram', entry: [] },
    });
    // 401 when a secret is configured, 503 when it is not. Never 200.
    expect(response.status()).not.toBe(200);
    expect([401, 503]).toContain(response.status());
  });

  test('rejects a POST whose signature does not match the body', async ({ request }) => {
    const body = JSON.stringify({ object: 'instagram', entry: [] });
    const response = await request.post(PATH, {
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sign(body, 'not-the-app-secret'),
      },
      data: body,
    });
    expect(response.status()).not.toBe(200);
  });

  test('enqueues nothing on a rejected request', async ({ request }) => {
    // The decisive one: an unauthenticated caller must not be able to put work
    // into the queue, which is the whole risk of a public POST endpoint.
    await request.post(PATH, {
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      data: JSON.stringify({ object: 'instagram', entry: [] }),
    });

    const { rows } = await db().query(
      `select id from jobs where dedupe_key like 'webhook_comments:%'`,
    );
    expect(rows).toHaveLength(0);
  });
});
