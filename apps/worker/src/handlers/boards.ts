/**
 * Route a pin to a board, at draft time.
 *
 * Lives in the worker rather than in core because it needs the database: the
 * boards are synced per account and the choice is stored on the item, so the
 * queue shows where a pin will land before anybody approves it.
 */
import { chooseBoard, type BoardChoice, type PinterestBoard } from '@halyard/core';
import type { HandlerContext } from '../poller.js';

export async function routeToBoard(
  ctx: HandlerContext,
  accountId: string,
  signals: { hashtags?: string[]; body?: string; title?: string; artifact?: unknown },
): Promise<BoardChoice> {
  const { rows } = await ctx.pool.query<{
    board_id: string;
    name: string;
    match_tags: string[] | null;
    is_default: boolean;
  }>(
    `select board_id, name, match_tags, is_default
       from pinterest_boards where account_id = $1 order by name`,
    [accountId],
  );

  const boards: PinterestBoard[] = rows.map((row) => ({
    boardId: row.board_id,
    name: row.name,
    matchTags: row.match_tags,
    isDefault: row.is_default,
  }));

  return chooseBoard(boards, signals);
}
