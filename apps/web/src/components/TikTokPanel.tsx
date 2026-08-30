import { Badge, Card, SectionTitle } from '@halyard/ui';
import {
  emptyTikTokOptions,
  parseCreatorInfo,
  validateTikTokPost,
  type TikTokCreatorInfo,
  type TikTokPostOptions,
} from '@halyard/core';
import { refreshTikTokCreatorInfo, saveTikTokOptions } from '@/app/(studio)/gallery/tiktokActions';

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends who follow each other',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me',
};

/**
 * The TikTok Direct Post panel.
 *
 * §179. TikTok requires these choices to be made by a person, against a current
 * `creator_info/query`, before anything is posted. Halyard used to make them
 * itself — `PUBLIC_TO_EVERYONE`, every interaction enabled — which is both a
 * review failure and the wrong default for someone else's account.
 *
 * Rendered from what TikTok currently allows, never from what Halyard remembers:
 * privacy options come from the response, and an interaction TikTok reports as
 * disabled is rendered disabled rather than hidden, so the operator can see the
 * account setting rather than wonder where the control went.
 */
export function TikTokPanel({
  itemId,
  panel,
}: {
  itemId: string;
  panel: {
    status: string;
    tiktokOptions: unknown;
    creatorInfo: unknown;
    creatorInfoAt: string | null;
    lastError: string | null;
    videoDurationSec: number | null;
  };
}) {
  const creator: TikTokCreatorInfo | null =
    (panel.creatorInfo as TikTokCreatorInfo | null) ?? parseCreatorInfo(panel.creatorInfo);
  const options: TikTokPostOptions =
    (panel.tiktokOptions as TikTokPostOptions | null) ?? emptyTikTokOptions();
  const problems = validateTikTokPost({
    options,
    creatorInfo: creator,
    videoDurationSec: panel.videoDurationSec,
  });
  const ready = problems.length === 0;

  return (
    <Card className="p-4">
      <SectionTitle hint="TikTok requires you to choose these, not Halyard">
        TikTok posting settings
      </SectionTitle>

      {!creator ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Halyard needs to ask TikTok what this account may post — which visibility options are
            available, and whether comments, Duet or Stitch are turned off — before it can show you
            the settings. Nothing is assumed.
          </p>
          {panel.lastError ? (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{panel.lastError}</p>
          ) : null}
          <form action={refreshTikTokCreatorInfo}>
            <input type="hidden" name="id" value={itemId} />
            <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
              Get TikTok settings
            </button>
          </form>
        </div>
      ) : (
        <form action={saveTikTokOptions} className="space-y-5">
          <input type="hidden" name="id" value={itemId} />

          {/* Who this will post as — the first thing to check before anything else. */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-sunk px-3 py-2">
            <span className="text-sm font-medium text-ink">{creator.creatorNickname}</span>
            {creator.creatorUsername ? (
              <span className="text-sm text-muted">@{creator.creatorUsername}</span>
            ) : null}
            <span className="ml-auto text-[11px] text-muted">
              up to {creator.maxVideoPostDurationSec}s
              {panel.videoDurationSec ? ` · this video ${Math.round(panel.videoDurationSec)}s` : ''}
            </span>
          </div>

          {/* ── Visibility. No option is pre-selected, deliberately. ────────── */}
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Who can see this <span className="text-danger">*</span>
            </legend>
            <div className="mt-2 space-y-1.5">
              {creator.privacyLevelOptions.map((level) => (
                <label key={level} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="privacyLevel"
                    value={level}
                    defaultChecked={options.privacyLevel === level}
                    required
                  />
                  {PRIVACY_LABELS[level] ?? level}
                </label>
              ))}
            </div>
            {creator.privacyLevelOptions.length === 0 ? (
              <p className="mt-1 text-xs text-danger">
                TikTok is not offering this account any visibility options right now, so it cannot
                post.
              </p>
            ) : null}
          </fieldset>

          {/* ── Interactions. Off unless chosen; disabled where TikTok says so. ── */}
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Allow on this post
            </legend>
            <div className="mt-2 space-y-1.5">
              {(
                [
                  ['allowComment', 'Comments', creator.commentDisabled, options.allowComment],
                  ['allowDuet', 'Duet', creator.duetDisabled, options.allowDuet],
                  ['allowStitch', 'Stitch', creator.stitchDisabled, options.allowStitch],
                ] as const
              ).map(([name, label, disabled, checked]) => (
                <label
                  key={name}
                  className={`flex items-center gap-2 text-sm ${disabled ? 'text-muted' : 'text-ink'}`}
                >
                  <input type="checkbox" name={name} disabled={disabled} defaultChecked={!disabled && checked} />
                  {label}
                  {disabled ? (
                    <span className="text-[11px] text-muted">— turned off for this account on TikTok</span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>

          {/* ── Commercial disclosure. Off by default, per TikTok's guidance. ── */}
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Content disclosure
            </legend>
            <label className="mt-2 flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" name="commercialContent" defaultChecked={options.commercialContent} />
              <span>
                This post promotes a brand, product or service
                <span className="block text-[11px] text-muted">
                  Turn this on and say which kind. TikTok shows a disclosure label on the post.
                </span>
              </span>
            </label>
            <div className="mt-2 space-y-1.5 border-l border-line pl-4">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="brandOrganic" defaultChecked={options.brandOrganic} />
                Your own brand
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="brandedContent" defaultChecked={options.brandedContent} />
                Branded content — a paid partnership
                <span className="text-[11px] text-muted">(cannot be posted privately)</span>
              </label>
            </div>
          </fieldset>

          {/* ── The consent TikTok requires before a post may be sent. ──────── */}
          <label className="flex items-start gap-2 rounded-lg bg-sunk px-3 py-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name="musicConfirmed"
              defaultChecked={Boolean(options.musicConfirmedAt)}
              required
            />
            <span>
              By posting, you agree to TikTok&apos;s{' '}
              <a
                href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Music Usage Confirmation
              </a>
              .
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
              Save TikTok settings
            </button>
            {ready ? (
              <Badge tone="good">Ready to post</Badge>
            ) : (
              <Badge tone="warn">{problems.length} to resolve</Badge>
            )}
            <span className="text-[11px] text-muted">
              TikTok processes the video after it is sent; it can take a few minutes to appear.
            </span>
          </div>

          {problems.length > 0 ? (
            <ul className="space-y-1 rounded-lg bg-warn/10 px-3 py-2">
              {problems.map((p) => (
                <li key={`${p.field}-${p.message}`} className="text-xs leading-relaxed text-ink">
                  {p.message}
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      )}

      {/* Refreshing is always available: a creator can change these on TikTok. */}
      {creator ? (
        <form action={refreshTikTokCreatorInfo} className="mt-3 border-t border-line pt-3">
          <input type="hidden" name="id" value={itemId} />
          <button className="text-xs text-muted underline hover:text-ink">
            Re-check what TikTok allows
            {panel.creatorInfoAt ? ` (last checked ${new Date(panel.creatorInfoAt).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''}
          </button>
        </form>
      ) : null}
    </Card>
  );
}
