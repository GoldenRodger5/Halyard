/**
 * Sync Pinterest boards. Milestone 49.
 *
 *   pnpm pinterest-boards            list and store them
 *   pnpm pinterest-boards --default "Ingredient Substitutions"
 *
 * Every pin needs a board id, and neither Halyard nor the operator had anywhere
 * to keep them. Blotato exposes them at
 * `GET /v2/social/pinterest/boards?accountId=`, which is absent from the
 * endpoint list on the publishing page — finding it took a search, which is
 * exactly why this is a script rather than a note in a document.
 */
import pg from 'pg';
import { deriveBoardKeywords } from '@halyard/core';

const API = 'https://backend.blotato.com/v2';
const RESET = '[0m';
const DIM = '[2m';
const GREEN = '[32m';

async function main(): Promise<void> {
  const key = process.env.BLOTATO_API_KEY;
  const connectionString = process.env.DATABASE_URL;
  if (!key) {
    console.error('BLOTATO_API_KEY is not set. Run ./scripts/doctor.');
    process.exit(1);
  }
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Run ./scripts/halyard first.');
    process.exit(1);
  }

  const makeDefault = process.argv.includes('--default')
    ? (process.argv[process.argv.indexOf('--default') + 1] ?? null)
    : null;

  const pool = new pg.Pool({ connectionString, max: 2 });

  const { rows: accounts } = await pool.query<{
    id: string;
    handle: string;
    provider_account_id: string | null;
  }>(`select id, handle, provider_account_id from social_accounts where platform = 'pinterest'`);

  if (accounts.length === 0) {
    console.error('No Pinterest account exists in Halyard. Connect one on /accounts first.');
    process.exit(1);
  }

  for (const account of accounts) {
    if (!account.provider_account_id) {
      console.error(
        `${account.handle} has no provider account id. Run pnpm verify-provider to list them, then set it on /accounts.`,
      );
      continue;
    }

    const response = await fetch(
      `${API}/social/pinterest/boards?accountId=${encodeURIComponent(account.provider_account_id)}`,
      { headers: { 'blotato-api-key': key } },
    );
    if (!response.ok) {
      console.error(
        `${account.handle}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`,
      );
      continue;
    }

    const body = (await response.json()) as { items?: Array<{ id: string; name: string }> };
    const boards = body.items ?? [];

    console.log(`\n${account.handle} — ${boards.length} board${boards.length === 1 ? '' : 's'}\n`);

    for (const board of boards) {
      await pool.query(
        `insert into pinterest_boards (account_id, board_id, name, synced_at)
         values ($1,$2,$3, now())
         on conflict (account_id, board_id) do update
            set name = excluded.name, synced_at = now()`,
        [account.id, board.id, board.name],
      );
      console.log(`  ${GREEN}ok${RESET} ${board.name.padEnd(28)} ${DIM}${board.id}${RESET}`);
      console.log(`     ${DIM}matches: ${deriveBoardKeywords(board.name).join(', ')}${RESET}`);
    }

    // A board deleted upstream must not stay routable here.
    const removed = await pool.query<{ name: string }>(
      `delete from pinterest_boards
        where account_id = $1 and board_id <> all($2::text[]) returning name`,
      [account.id, boards.map((b) => b.id)],
    );
    for (const row of removed.rows) {
      console.log(`  ${DIM}removed ${row.name}, which no longer exists on Pinterest${RESET}`);
    }

    if (makeDefault) {
      await pool.query(`update pinterest_boards set is_default = (name = $2) where account_id = $1`, [
        account.id,
        makeDefault,
      ]);
      const matched = await pool.query<{ name: string }>(
        `select name from pinterest_boards where account_id = $1 and is_default`,
        [account.id],
      );
      if (matched.rows[0]) {
        console.log(`\n  default: ${matched.rows[0].name}`);
      } else {
        console.error(`\n  No board is named "${makeDefault}". Nothing was made default.`);
      }
    }
  }

  const { rows: state } = await pool.query<{ n: string; defaults: string }>(
    `select count(*) as n, count(*) filter (where is_default) as defaults from pinterest_boards`,
  );
  console.log(
    `\n${state[0]!.n} boards stored, ${state[0]!.defaults} marked default.\n` +
      `${DIM}A pin with no matching board and no default is refused at draft time, not at publish.${RESET}\n`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
