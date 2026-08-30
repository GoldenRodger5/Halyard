/**
 * §389. Room 7 ▸ The rig — what is connected, and what is stopping the rest.
 *
 * The most important planning fact in this build is stated here rather than
 * remembered: **every platform except X and Bluesky gates public posting behind
 * a manual review.** It is the reason a freshly-connected account can look
 * healthy and still publish nothing public, and the reason `capability_state =
 * 'live'` does not mean connected (gotcha 5).
 *
 * So each account shows three separate things, because they are three separate
 * facts and conflating them is how the old screen misled:
 *
 * - whether Halyard **has a credential** for it,
 * - whether the platform has **reviewed** the app,
 * - and what it can actually **do right now** as a result.
 */
import Link from 'next/link';
import { APPROVAL_LABEL, REVIEW_GATES, accountStatus, getAdapter } from '@halyard/core';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Action, Label, Pill, Sheet, Tally, cx } from '@halyard/ui/studio';
import { Deeper } from '@/components/studio/Deeper';
import { accountBadge } from '@/lib/accountBadge';
import { getAllAccounts, getSettings } from '@/lib/queries';
import { runSelfTest } from '@/app/(studio)/master/actions';

export const dynamic = 'force-dynamic';

const TONE_TO_LAMP = {
  good: 'ready',
  info: 'holding',
  warn: 'working',
  bad: 'onair',
  neutral: 'dark',
} as const;

export default async function TheRig() {
  const [accounts, settings] = await Promise.all([getAllAccounts(), getSettings()]);

  return (
    <div className="flex flex-col gap-3.5">
      <p className="max-w-[74ch] text-sm leading-relaxed text-quiet">
        Every platform except X and Bluesky gates public posting behind a manual review. That is
        the single most important planning fact in this build, so it is stated here rather than
        remembered.
      </p>

      {!settings.publishing_enabled ? (
        <Sheet tone="onair">
          <Label>Publishing is off</Label>
          <p className="max-w-prose text-[12.5px] leading-relaxed text-quiet">
            The kill switch is engaged, so nothing publishes whatever any account below says.
            {settings.publishing_disabled_reason
              ? ` Reason recorded: ${settings.publishing_disabled_reason}`
              : ' No reason was recorded.'}{' '}
            <Link href="/master/system" className="text-lit underline">System</Link> is where it
            is turned back on.
          </p>
        </Sheet>
      ) : null}

      {accounts.length === 0 ? (
        <Sheet tone="lit">
          <Label>Nothing connected</Label>
          <p className="max-w-prose text-sm leading-relaxed text-quiet">
            Halyard has no account to publish to, so the whole system stops one step before its
            last one. Connecting the first account is the highest-value thing on this screen.
          </p>
        </Sheet>
      ) : (
        accounts.map((account) => {
          const badge = accountBadge(account);
          const adapter = getAdapter(account.platform as never);
          const gate = REVIEW_GATES[account.platform as keyof typeof REVIEW_GATES];
          const status = accountStatus({
            account: {
              capabilityState: account.capability_state,
              hasToken: account.has_token,
              identityConfirmedAt: account.identity_confirmed_at,
              handle: account.handle,
            },
            requiresPlatformReview: adapter.constraints.requiresReviewForPublicPosting,
            publishingEnabled: settings.publishing_enabled,
            tokenExpired: account.token_expires_at
              ? new Date(account.token_expires_at).getTime() < Date.now()
              : false,
          });

          /*
             * "Publicly" is not a field — it is `canPublish` *and* the platform
             * either not requiring a review or having granted one. Keeping the
             * two apart is the whole point of gotcha 5: an account can be
             * connected, healthy, and still only able to write drafts.
             */
          const publicly =
            status.canPublish && (status.approval === 'not_required' || status.approval === 'approved');

          return (
            <Sheet key={account.id} tone={badge.tone === 'bad' ? 'onair' : 'plain'}>
              <div className="flex flex-wrap items-center gap-2.5">
                <Tally state={TONE_TO_LAMP[badge.tone]} on="light" size={8} />
                <span className="text-[15px] font-semibold">
                  {PLATFORM_LABELS[account.platform] ?? account.platform}
                </span>
                <span className="text-sm text-quiet">{account.handle}</span>
                <span className="ml-auto">
                  <Pill
                    tone={
                      badge.tone === 'good'
                        ? 'ready'
                        : badge.tone === 'bad'
                          ? 'onair'
                          : badge.tone === 'warn'
                            ? 'working'
                            : 'quiet'
                    }
                  >
                    {badge.label}
                  </Pill>
                </span>
              </div>

              <p className="mt-2 max-w-[74ch] text-[12.5px] leading-relaxed text-quiet">
                {badge.explanation}
              </p>

              {/*
                The three facts, kept apart. §-gotcha-5: `capability_state =
                'live'` means "an operator marked this past platform review" and
                can be true with no credential at all.
              */}
              <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 font-data text-[10px] uppercase tracking-[0.06em] text-quiet">
                <span>
                  credential{' '}
                  <b className={cx('font-medium', account.has_token ? 'text-passed' : 'text-onair')}>
                    {account.has_token ? 'held' : 'none'}
                  </b>
                </span>
                <span>
                  review <b className="font-medium text-sink">{APPROVAL_LABEL[status.approval]}</b>
                </span>
                <span>
                  can post now{' '}
                  <b
                    className={cx('font-medium', publicly ? 'text-passed' : 'text-parked')}
                  >
                    {publicly ? 'publicly' : status.canPublish ? 'as a draft' : 'no'}
                  </b>
                </span>
              </dl>

              {gate && gate.review !== 'None' ? (
                <p className="mt-2 max-w-[74ch] text-[12px] leading-relaxed text-quiet">
                  Unreviewed this gives you: {gate.unreviewedGives}. Review is {gate.review},
                  typically {howLong(gate.typicalWeeks)}.
                </p>
              ) : null}

              {account.last_error ? (
                <p className="mt-2 max-w-[74ch] text-[12px] leading-relaxed text-onair">
                  {account.last_error}
                </p>
              ) : null}

              <form action={runSelfTest} className="mt-2.5">
                <input type="hidden" name="id" value={account.id} />
                <Action tone="ghost" small>Run connection test</Action>
              </form>
            </Sheet>
          );
        })
      )}
      <Deeper
        links={[
          { href: '/master/platforms', label: 'Platform capabilities' },
          { href: '/master/setup-kit', label: 'Setup kit — what you need to create an account' },
        ]}
      />
    </div>
  );
}

/**
 * How long a platform review takes, in a sentence.
 *
 * `typicalWeeks` holds three different shapes — `'0'`, `'2–4 per submission'`,
 * and `'Assume rejection for an internal tool'` — so neither appending "weeks"
 * nor omitting it is right for all of them. The unit goes after the *number*,
 * where it belongs: "2–4 weeks per submission", not "2–4 per submission weeks".
 */
function howLong(typicalWeeks: string | undefined): string {
  if (!typicalWeeks) return 'an unknown time';
  if (typicalWeeks === '0') return 'no wait';
  const numeric = /^([\d]+(?:\s*[–-]\s*\d+)?)(.*)$/.exec(typicalWeeks);
  return numeric ? `${numeric[1]} weeks${numeric[2]}` : typicalWeeks;
}
