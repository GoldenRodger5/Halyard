'use server';

/**
 * The TikTok publishing panel's two writes.
 *
 * §179. TikTok requires the Direct Post UI to be built from a *current*
 * creator_info/query response, and requires a person — not the integration — to
 * choose visibility, the interaction settings, any commercial disclosure, and to
 * give the Music Usage Confirmation. Halyard's adapter used to supply all of
 * that itself, which is the specific thing app review rejects.
 *
 * So: one action fetches what TikTok currently allows, the other records what
 * the human chose against it. Both are stored on the item, because the publisher
 * needs to know not just the answers but the question they were answering — a
 * creator can turn their account private between approving and posting.
 */
import { revalidatePath } from 'next/cache';
import {
  getAdapter,
  openToken,
  parseCreatorInfo,
  validateTikTokPost,
  type TikTokPostOptions,
} from '@halyard/core';
import { query, one } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/** Ask TikTok what this creator may currently post, and store the answer. */
export async function refreshTikTokCreatorInfo(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const id = String(formData.get('id'));

  const row = await one<{
    platform: string;
    account_id: string;
    handle: string;
    platform_user_id: string | null;
    capability_state: string;
    access_token_enc: Buffer | null;
    scopes: string[] | null;
  }>(
    `select ci.platform, sa.id as account_id, sa.handle, sa.platform_user_id,
            sa.capability_state, sa.access_token_enc, sa.scopes
       from content_items ci
       join social_accounts sa on sa.id = ci.account_id
      where ci.id = $1`,
    [id],
  );

  if (!row || row.platform !== 'tiktok') return;

  if (!row.access_token_enc) {
    await storeCreatorInfoError(id, 'This TikTok account is not connected yet.');
    revalidatePath(`/gallery/${id}`);
    return;
  }

  try {
    const adapter = getAdapter('tiktok');
    const raw = await adapter.creatorInfo!({
      id: row.account_id,
      platform: 'tiktok',
      handle: row.handle,
      platformUserId: row.platform_user_id,
      capabilityState: row.capability_state as never,
      tokens: {
        accessToken: openToken(row.access_token_enc),
        refreshToken: null,
        expiresAt: null,
        scopes: row.scopes ?? [],
      },
    });

    const parsed = parseCreatorInfo(raw);
    if (!parsed) {
      await storeCreatorInfoError(id, 'TikTok answered without creator details. Try again shortly.');
    } else {
      await query(
        `update content_items
            set tiktok_creator_info = $2, tiktok_creator_info_at = now(), tiktok_last_error = null
          where id = $1`,
        [id, parsed],
      );
      await query(
        `insert into audit_log (actor, action, entity_type, entity_id, detail)
         values ('human','tiktok_creator_info','content_item',$1,$2)`,
        [id, { operator: operator.email, nickname: parsed.creatorNickname }],
      );
    }
  } catch (err) {
    /*
     * Handled, not thrown. A creator query can fail for reasons the operator can
     * act on — an expired token, a rate limit — and a stack trace on a blank page
     * tells them none of them.
     */
    await storeCreatorInfoError(id, `TikTok could not be reached: ${(err as Error).message}`);
  }

  revalidatePath(`/gallery/${id}`);
}

async function storeCreatorInfoError(id: string, message: string): Promise<void> {
  await query('update content_items set tiktok_last_error = $2 where id = $1', [id, message.slice(0, 500)]);
}

/**
 * Record the creator's choices.
 *
 * Every field is read from the form with no fallback to a permissive value: an
 * unchecked box is `false` and an unselected radio is `null`, which is what makes
 * "the creator chose this" true rather than decorative.
 */
export async function saveTikTokOptions(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const id = String(formData.get('id'));

  const row = await one<{ platform: string; tiktok_creator_info: unknown }>(
    'select platform, tiktok_creator_info from content_items where id = $1',
    [id],
  );
  if (!row || row.platform !== 'tiktok') return;

  const privacyLevel = String(formData.get('privacyLevel') ?? '').trim() || null;
  const on = (name: string) => formData.get(name) === 'on';
  const commercialContent = on('commercialContent');

  const options: TikTokPostOptions = {
    privacyLevel,
    allowComment: on('allowComment'),
    allowDuet: on('allowDuet'),
    allowStitch: on('allowStitch'),
    commercialContent,
    /* Only meaningful under the master switch; withdrawing it withdraws both. */
    brandOrganic: commercialContent && on('brandOrganic'),
    brandedContent: commercialContent && on('brandedContent'),
    musicConfirmedAt: on('musicConfirmed') ? new Date().toISOString() : null,
    creatorInfoFetchedAt: new Date().toISOString(),
  };

  /*
   * Validated here as well as in the adapter. This is the layer that can explain
   * the problem next to the control that caused it; the adapter's job is to
   * refuse, not to teach.
   */
  const problems = validateTikTokPost({
    options,
    creatorInfo: (row.tiktok_creator_info as never) ?? null,
  });

  await query(
    'update content_items set tiktok_options = $2, tiktok_last_error = $3 where id = $1',
    [
      id,
      options,
      problems.length > 0 ? problems.map((p) => p.message).join(' ') .slice(0, 500) : null,
    ],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human','tiktok_options','content_item',$1,$2)`,
    [
      id,
      {
        operator: operator.email,
        privacyLevel: options.privacyLevel,
        commercialContent: options.commercialContent,
        musicConfirmed: Boolean(options.musicConfirmedAt),
        problems: problems.length,
      },
    ],
  );

  revalidatePath(`/gallery/${id}`);
}
