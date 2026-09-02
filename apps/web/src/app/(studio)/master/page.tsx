/**
 * §497. Room 7 ▸ Connections — one screen, every account, three buttons.
 *
 * What this replaced, and why it had to go. The old rig screen showed a full
 * card for every account that *had* a credential and collapsed the rest into a
 * list with nothing to click — so the five platforms that were not connected,
 * which is the entire reason somebody opens this page, offered no way to
 * connect them. Connecting actually happened at a URL nothing linked to
 * (`/api/oauth/<platform>/start`), reconnecting had no button at all, and
 * disconnecting was a form three screens away. The operator's words: *"its so
 * confusing and hidden right now"*.
 *
 * Now: one row per account, in the same shape whatever state it is in — a
 * lamp, the platform, the handle, one sentence saying what is true, and the
 * buttons that change it. `connectionView` decides the words and which buttons
 * are honest; this file only draws them. Every state is covered by
 * `connection.test.ts` rather than by clicking around.
 *
 * The one thing this screen refuses to do is offer a button that cannot work.
 * Five of seven platforms have no developer app registered, so their OAuth
 * flow answers with a JSON error — the row says which variables are missing
 * and what registering involves instead.
 */
import Link from 'next/link';
import {
  PLATFORM_CLIENT_ENV,
  REVIEW_GATES,
  connectionView,
  getAdapter,
  resolvePlatformClient,
  type PlatformId,
} from '@halyard/core';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Action, Label, Pill, Sheet, Tally, cx } from '@halyard/ui/studio';
import { Deeper } from '@/components/studio/Deeper';
import { getAllAccounts, getProducts, getSettings } from '@/lib/queries';
import { formatRelative } from '@/lib/format';
import { connectBluesky, disconnectAccount, runSelfTest } from '@/app/(studio)/master/actions';
import { registrationFor } from '@/lib/oauthRegistration';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

/** The lamp, per state. One glance answers "is anything wrong". */
const LAMP = {
  connected: 'ready',
  limited: 'working',
  broken: 'onair',
  not_connected: 'dark',
  unavailable: 'dark',
} as const;

const STATE_WORD = {
  connected: 'Live',
  limited: 'Drafts only',
  broken: 'Needs you',
  not_connected: 'Not connected',
  unavailable: 'No app yet',
} as const;

const PILL_TONE = {
  connected: 'ready',
  limited: 'working',
  broken: 'onair',
  not_connected: 'quiet',
  unavailable: 'quiet',
} as const;

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; ok?: string }>;
}) {
  const params = (await searchParams) ?? {};
  /*
   * §499. The callback URL an operator has to paste is derived from where this
   * app actually answers, so the value on screen is the one that will work
   * rather than one written down once and gone stale.
   */
  const requestHeaders = await headers();
  const origin =
    process.env.HALYARD_PUBLIC_URL?.trim() ||
    `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${requestHeaders.get('host') ?? 'localhost:3200'}`;
  const [accounts, settings, products] = await Promise.all([
    getAllAccounts(),
    getSettings(),
    getProducts(),
  ]);
  const timeZone = products[0]?.operator_timezone ?? 'UTC';

  const rows = accounts.map((account) => {
    const platform = account.platform as PlatformId;
    const adapter = getAdapter(platform);
    const client = resolvePlatformClient(platform);
    const usesAppPassword = platform === 'bluesky';
    return {
      account,
      gate: REVIEW_GATES[platform as keyof typeof REVIEW_GATES],
      /*
       * §499. What the platform's own dashboard needs, which existed in
       * `oauthRegistration.ts` for seven platforms and was rendered nowhere —
       * so the callback URL an operator has to paste, and the settings that
       * make a grant work, lived only in a file. Shown on the row that needs
       * it: declared, tested, and now actually reachable.
       */
      registration: registrationFor(platform, process.env.HALYARD_PUBLIC_URL, origin),
      envNames: [PLATFORM_CLIENT_ENV[platform].id, PLATFORM_CLIENT_ENV[platform].secret],
      view: connectionView({
        platform: PLATFORM_LABELS[platform] ?? platform,
        handle: account.handle,
        capabilityState: account.capability_state,
        hasToken: account.has_token,
        identityConfirmedAt: account.identity_confirmed_at,
        tokenExpiresAt: account.token_expires_at,
        lastError: account.last_error,
        credentialsConfigured: Boolean(client.clientId && client.clientSecret),
        /*
         * Both names, always. `tried` stops at the first miss, so a platform
         * with neither variable set named only its id and the sentence read
         * "until PINTEREST_APP_ID are set".
         */
        credentialEnvNames: [PLATFORM_CLIENT_ENV[platform].id, PLATFORM_CLIENT_ENV[platform].secret],
        requiresPlatformReview: adapter.constraints.requiresReviewForPublicPosting,
        usesAppPassword,
        publishingEnabled: settings.publishing_enabled,
      }),
    };
  });

  const live = rows.filter((r) => r.view.state === 'connected' || r.view.state === 'limited').length;
  const attention = rows.filter((r) => r.view.state === 'broken').length;

  return (
    <div className="flex flex-col gap-3">
      {/* The answer to "how am I doing", before any row. */}
      <p className="text-[13px] leading-relaxed text-quiet">
        <span className="font-data tabular-nums text-ink">
          {live} of {rows.length}
        </span>{' '}
        connected
        {attention > 0 ? (
          <>
            {' · '}
            <span className="font-data tabular-nums text-onair">{attention}</span> needs you
          </>
        ) : null}
        . Every platform except X and Bluesky gates public posting behind a manual review, so
        connected and <em>able to post publicly</em> are two different things.
      </p>

      {params.error ? (
        <Sheet tone="onair">
          <Label>Nothing changed</Label>
          <p className="m-0 text-[12.5px] leading-relaxed">{params.error}</p>
        </Sheet>
      ) : null}
      {params.ok ? (
        <Sheet tone="lit">
          <Label>Done</Label>
          <p className="m-0 text-[12.5px] leading-relaxed">{params.ok}</p>
        </Sheet>
      ) : null}

      {!settings.publishing_enabled ? (
        <Sheet tone="onair">
          <Label>Publishing is off</Label>
          <p className="m-0 max-w-prose text-[12.5px] leading-relaxed text-quiet">
            The kill switch is engaged, so nothing publishes whatever any row below says.{' '}
            {settings.publishing_disabled_reason ?? 'No reason was recorded.'}{' '}
            <Link href="/master/system" className="text-lit underline">
              System
            </Link>{' '}
            turns it back on.
          </p>
        </Sheet>
      ) : null}

      {rows.length === 0 ? (
        <Sheet tone="lit">
          <Label>Nothing to connect yet</Label>
          <p className="m-0 max-w-prose text-sm leading-relaxed text-quiet">
            No account rows exist. Add a product and its personas first.
          </p>
        </Sheet>
      ) : null}

      {rows.map(({ account, view, gate, registration, envNames }) => {
        const oauthStart = `/api/oauth/${account.platform}/start?persona=${account.persona}&product=${account.product_id}`;
        return (
          <Sheet key={account.id} tone={view.state === 'broken' ? 'onair' : 'plain'}>
            {/* Row one: who, and the one word. */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Tally state={LAMP[view.state]} on="light" size={8} />
              <span className="font-display text-[15px] font-extrabold tracking-[-0.02em]">
                {PLATFORM_LABELS[account.platform] ?? account.platform}
              </span>
              <span className="text-[13px] text-quiet">{account.handle}</span>
              <span className="font-data text-[9.5px] uppercase tracking-[0.08em] text-quiet">
                {account.persona}
              </span>
              <span className="ml-auto">
                <Pill tone={PILL_TONE[view.state]}>{STATE_WORD[view.state]}</Pill>
              </span>
            </div>

            {/* Row two: what is true, then what follows from it. */}
            <p className="m-0 mt-1.5 max-w-[74ch] text-[13px] leading-relaxed">{view.headline}</p>
            {view.detail ? (
              <p className="m-0 mt-1 max-w-[74ch] text-[12.5px] leading-relaxed text-quiet">
                {view.detail}
              </p>
            ) : null}

            {/*
              The review wait, only where a review is the thing standing in the
              way. On a connected-and-public account it is noise.
            */}
            {view.state === 'limited' && gate && gate.review !== 'None' ? (
              <p className="m-0 mt-1 max-w-[74ch] text-[12px] leading-relaxed text-quiet">
                Unreviewed this gives you: {gate.unreviewedGives}. The review is {gate.review}
                {gate.typicalWeeks && gate.typicalWeeks !== '0'
                  ? `, typically ${gate.typicalWeeks}`
                  : ''}
                .
              </p>
            ) : null}

            {account.last_self_test_at ? (
              <p
                className={cx(
                  'm-0 mt-1.5 font-data text-[10px] uppercase tracking-[0.07em]',
                  account.last_self_test_ok ? 'text-passed' : 'text-onair',
                )}
              >
                Test {account.last_self_test_ok ? 'passed' : 'failed'}{' '}
                {formatRelative(account.last_self_test_at, timeZone)}
                {account.last_self_test_detail ? (
                  <span className="ml-1.5 font-body text-[11.5px] normal-case tracking-normal text-quiet">
                    {account.last_self_test_detail}
                  </span>
                ) : null}
              </p>
            ) : null}

            {/* Row three: the buttons. Never one that cannot work. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {view.action === 'connect' || view.action === 'reconnect' ? (
                <Link
                  href={oauthStart}
                  className={cx(
                    'rounded-md px-2.5 py-1 font-data text-[10px] uppercase tracking-[0.08em]',
                    view.action === 'connect' || view.state === 'broken'
                      ? 'bg-sink text-white hover:bg-ink'
                      : 'border border-rule2 text-quiet hover:border-sink hover:text-ink',
                  )}
                >
                  {view.actionLabel}
                </Link>
              ) : null}



              {view.canTest ? (
                <form action={runSelfTest}>
                  <input type="hidden" name="id" value={account.id} />
                  <Action tone="ghost" small>
                    {account.last_self_test_at ? 'Test again' : 'Test it'}
                  </Action>
                </form>
              ) : null}

              {view.canDisconnect ? (
                /*
                 * Visible, and still deliberate. `disconnectAccount` wants the
                 * handle typed for the same reason `git branch -D` does: the
                 * rows sit next to each other and this is the only irreversible
                 * button on the screen. Folded away so it is never the thing a
                 * thumb lands on, and one click from open.
                 */
                <details className="ml-auto">
                  <summary className="cursor-pointer list-none font-data text-[10px] uppercase tracking-[0.08em] text-quiet hover:text-onair">
                    Disconnect
                  </summary>
                  <form action={disconnectAccount} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={account.id} />
                    <input
                      name="confirmHandle"
                      placeholder={account.handle}
                      aria-label={`Type ${account.handle} to disconnect it`}
                      className="w-44 rounded-md border border-rule2 bg-transparent px-2 py-1 text-[12px]"
                    />
                    <Action tone="ghost" small>
                      Erase this credential
                    </Action>
                    <span className="text-[11.5px] leading-snug text-quiet">
                      Type the handle to confirm. This erases Halyard&apos;s copy of the credential;
                      the grant on {PLATFORM_LABELS[account.platform] ?? account.platform} is
                      revoked there.
                    </span>
                  </form>
                </details>
              ) : null}
            </div>

            {/*
              §499. What to put where, on the row that cannot be connected yet.
              Open by default when nothing else on this row can be done, folded
              away when it is only reference for a reconnect.
            */}
            {registration ? (
              <details className="mt-2.5" open={view.action === 'register_app'}>
                <summary className="cursor-pointer list-none font-data text-[10px] uppercase tracking-[0.08em] text-quiet hover:text-ink">
                  What this platform needs
                </summary>
                <div className="mt-2 border-l-2 border-rule2 pl-3">
                  <p className="m-0 text-[12px] leading-relaxed text-quiet">{registration.dashboard}</p>
                  <dl className="m-0 mt-2 flex flex-col gap-1.5">
                    {registration.fields.map((field) => (
                      <div key={field.label} className="flex flex-col gap-0.5">
                        <dt className="font-data text-[9.5px] uppercase tracking-[0.07em] text-quiet">
                          {field.label}
                        </dt>
                        <dd className="m-0 break-all font-data text-[11.5px] text-ink">
                          {field.value}
                          {field.note ? (
                            <span className="ml-2 font-body text-[11px] text-quiet">{field.note}</span>
                          ) : null}
                        </dd>
                      </div>
                    ))}
                    <div className="flex flex-col gap-0.5">
                      <dt className="font-data text-[9.5px] uppercase tracking-[0.07em] text-quiet">
                        Then set on the web app and the worker
                      </dt>
                      <dd className="m-0 font-data text-[11.5px] text-ink">{envNames.join('  ')}</dd>
                    </div>
                  </dl>
                  {registration.requirements.length > 0 ? (
                    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                      {registration.requirements.map((requirement) => (
                        <li key={requirement} className="text-[12px] leading-relaxed text-quiet">
                          {requirement}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            ) : null}

            {view.action === 'app_password' ? (
              <form action={connectBluesky} className="mt-2.5 flex flex-wrap items-end gap-2">
                <input type="hidden" name="product" value={account.product_id} />
                <input type="hidden" name="persona" value={account.persona} />
                <label className="flex flex-col gap-1 text-[11px] text-quiet">
                  Handle
                  <input
                    name="handle"
                    defaultValue={account.handle}
                    className="w-44 rounded-md border border-rule2 bg-transparent px-2 py-1 text-[12px] text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-quiet">
                  App password
                  <input
                    name="appPassword"
                    type="password"
                    className="w-44 rounded-md border border-rule2 bg-transparent px-2 py-1 text-[12px] text-ink"
                  />
                </label>
                <Action tone="brass" small>
                  Connect
                </Action>
              </form>
            ) : null}
          </Sheet>
        );
      })}

      <Deeper
        links={[
          { href: '/master/setup-kit', label: 'Setup kit — what each platform needs before you can connect it' },
          { href: '/master/platforms', label: 'Platform capabilities — what a review actually unlocks' },
        ]}
      />
    </div>
  );
}



