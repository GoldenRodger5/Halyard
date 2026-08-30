/**
 * §387. Room 2 ▸ Brief — stand at the front of the room and brief the crew.
 *
 * The same carriage model the `/make` wizard reads, in the room it applies to.
 * Server-rendered: the adapters are server-only, and what a platform can carry
 * is a property of the platform rather than of the session, so it is resolved
 * once here and handed down. §355.
 */
import { redirect } from 'next/navigation';
import {
  POST_FORMATS,
  POST_FORMAT_CATALOG,
  POST_TYPES,
  POST_TYPE_CATALOG,
  canCarry,
  getAdapter,
  supportFromConstraints,
  type PlatformSupport,
} from '@halyard/core';
import { Label, Sheet } from '@halyard/ui/studio';
import { BriefRoom } from '@/components/studio/BriefRoom';
import { makePiece } from '@/app/(dashboard)/make/actions';
import { requireOperator } from '@/lib/auth';
import { readRundown } from '@/lib/studio/live';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function FloorBrief() {
  await requireOperator();

  /*
   * Only platforms with an account. A chip for a platform you cannot post to is
   * a dead end — the wizard offered all seven and the brief offers what exists.
   */
  const accounts = await query<{ platform: string }>(
    `select distinct platform from social_accounts order by platform`,
  );
  const platforms = accounts.map((a) => a.platform);

  if (platforms.length === 0) {
    return (
      <Sheet tone="lit">
        <Label>No account to publish to</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          The floor makes things for a destination, so it needs one. Connect an account in{' '}
          <a href="/master" className="text-lit underline">Master Control</a> and this room opens.
        </p>
      </Sheet>
    );
  }

  const supports: PlatformSupport[] = platforms.map((platform) =>
    supportFromConstraints(platform as never, getAdapter(platform as never).constraints),
  );

  /*
   * The carriage matrix, and the reason for every no. A disabled chip with no
   * explanation makes an operator wonder whether it is broken; one that says
   * "TikTok carries no caption-only post" tells them what to change.
   */
  const carriage = POST_TYPES.map((id) => {
    const postType = POST_TYPE_CATALOG[id];
    return {
      id: postType.id,
      name: postType.name,
      media: postType.media,
      channel: postType.channel,
      byPlatform: Object.fromEntries(
        supports.map((support) => {
          const verdict = canCarry(postType, support);
          return [support.platform, { ok: verdict.ok, because: verdict.because }];
        }),
      ),
    };
  });

  const shapes = POST_FORMATS.map((id) => ({ id, name: POST_FORMAT_CATALOG[id].name }));
  const rundown = await readRundown();

  /**
   * Sending the brief.
   *
   * `makePiece` is the same action the wizard uses — one path to a production,
   * not two. It returns a result rather than redirecting, so the redirect to
   * the live floor happens here.
   */
  async function send(formData: FormData): Promise<void> {
    'use server';
    const result = await makePiece(formData);
    /*
     * Straight to the floor on success: the operator has just briefed a room
     * and the next thing they want is to watch it work.
     */
    if (result.ok) redirect('/floor/live');
  }

  return (
    <div className="flex flex-col gap-3.5">
      <BriefRoom
        platforms={platforms}
        carriage={carriage}
        shapes={shapes}
        rundown={rundown}
        action={send}
      />
      <p className="text-xs leading-relaxed text-quiet">
        Choosing wakes the desks. A desk that stays dark says why on hover — “not needed” and
        “nobody asked” are different things, and the plan knows which.
      </p>
    </div>
  );
}
