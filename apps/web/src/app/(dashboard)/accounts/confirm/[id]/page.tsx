import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, PLATFORM_LABELS, PageHeader, PlatformDot } from '@halyard/ui';
import { PREFLIGHT, describePersona, type PlatformId } from '@halyard/core';
import { one } from '@/lib/db';
import { confirmConnection, discardConnection } from './actions';

export const dynamic = 'force-dynamic';

interface Pending {
  id: string;
  product_id: string;
  platform: PlatformId;
  persona: 'founder' | 'brand';
  platform_user_id: string | null;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  scopes: string[];
  token_expires_at: string | null;
  alternatives: Array<{ platformUserId: string; handle: string; displayName?: string; detail?: string }>;
  warnings: Array<{ kind: string; message: string; fix: string; severe: boolean }>;
  expires_at: string;
  product_name: string;
}

/**
 * The confirmation step. Milestone 40.
 *
 * The token for this connection exists, sealed, and is not yet an account. This
 * screen is the only thing standing between an OAuth round trip and a live
 * credential, and it exists because the consent screen authorises whoever the
 * browser was already signed in as, without ever asking.
 */
export default async function ConfirmConnectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const pending = await one<Pending>(
    `select pc.*, p.name as product_name
       from pending_connections pc
       join products p on p.id = pc.product_id
      where pc.id = $1 and pc.expires_at > now()`,
    [id],
  );

  if (!pending) notFound();

  const severe = pending.warnings.filter((w) => w.severe);
  const duplicate = pending.warnings.find((w) => w.kind === 'duplicate_identity');
  const preflight = PREFLIGHT[pending.platform];
  const minutesLeft = Math.max(
    0,
    Math.round((new Date(pending.expires_at).getTime() - Date.now()) / 60_000),
  );

  return (
    <>
      <PageHeader
        title="Is this the right account?"
        subtitle={`${PLATFORM_LABELS[pending.platform]} authorised the connection. Nothing has been saved yet — the token is held for ${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'} and then discarded.`}
      />

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-4">
          {pending.avatar_url ? (
            // Remote avatars come from platform CDNs that change hosts often, so
            // this stays a plain img rather than going through next/image, which
            // would need every one of those hosts allow-listed up front.
            <img
              src={pending.avatar_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full border border-line object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-line bg-sunk text-xl text-muted">
              {pending.handle.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <PlatformDot platform={pending.platform} />
              <span className="text-lg font-medium text-ink">@{pending.handle}</span>
              <Badge tone="neutral">{pending.persona}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {pending.display_name ? `${pending.display_name} · ` : ''}
              {pending.follower_count === null
                ? 'follower count unavailable'
                : `${pending.follower_count.toLocaleString()} followers`}
            </p>
            <p className="mt-2 text-sm text-muted">
              Will be saved as the <strong className="text-ink">{pending.persona}</strong> account
              for <strong className="text-ink">{pending.product_name}</strong>.{' '}
              {describePersona(pending.persona)}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-muted">Scopes granted</dt>
            <dd className="mt-1 break-words font-mono text-xs text-ink">
              {pending.scopes.length > 0 ? pending.scopes.join(' ') : 'none reported'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-muted">Token expires</dt>
            <dd className="mt-1 text-ink">
              {pending.token_expires_at
                ? new Date(pending.token_expires_at).toLocaleString()
                : 'no expiry reported'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.08em] text-muted">Platform user id</dt>
            <dd className="mt-1 break-all font-mono text-xs text-ink">
              {pending.platform_user_id ?? 'not reported'}
            </dd>
          </div>
        </dl>
      </Card>

      {pending.warnings.length > 0 ? (
        <div className="mb-6 space-y-3">
          {pending.warnings.map((w) => (
            <Card
              key={w.kind}
              className={`p-4 ${w.severe ? 'border-danger/40 bg-danger/5' : 'border-warn/40 bg-warn/5'}`}
            >
              <p className={`text-sm font-medium ${w.severe ? 'text-danger' : 'text-ink'}`}>
                {w.message}
              </p>
              <p className="mt-1 text-sm text-muted">{w.fix}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {pending.alternatives.length > 0 ? (
        <Card className="mb-6 p-4">
          <h2 className="text-sm font-medium text-ink">
            This authorisation reaches {pending.alternatives.length + 1} accounts
          </h2>
          <p className="mt-1 text-sm text-muted">Pick the one that should post.</p>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="platformUserId"
                form="confirm-form"
                value={pending.platform_user_id ?? ''}
                defaultChecked
              />
              <span className="text-ink">@{pending.handle}</span>
              {pending.display_name ? (
                <span className="text-muted">{pending.display_name}</span>
              ) : null}
            </label>
            {pending.alternatives.map((alt) => (
              <label
                key={alt.platformUserId}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="platformUserId"
                  form="confirm-form"
                  value={alt.platformUserId}
                />
                <span className="text-ink">@{alt.handle}</span>
                {alt.displayName ? <span className="text-muted">{alt.displayName}</span> : null}
                {alt.detail ? <span className="text-xs text-muted">{alt.detail}</span> : null}
              </label>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <form action={confirmConnection} id="confirm-form" className="flex items-center gap-3">
          <input type="hidden" name="pendingId" value={pending.id} />
          {pending.alternatives.length === 0 ? (
            <input type="hidden" name="platformUserId" value={pending.platform_user_id ?? ''} />
          ) : null}
          {duplicate ? (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="acknowledgeDuplicate" required />
              Yes, the same identity really does serve both
            </label>
          ) : null}
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            {severe.length > 0 ? 'Save anyway' : `Save @${pending.handle}`}
          </button>
        </form>

        <form action={discardConnection}>
          <input type="hidden" name="pendingId" value={pending.id} />
          <button className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-sunk hover:text-ink">
            Discard this token
          </button>
        </form>

        <Link
          href={`/api/oauth/${pending.platform}/start?persona=${pending.persona}&product=${pending.product_id}`}
          className="text-sm text-primary hover:underline"
        >
          Try again as a different account
        </Link>
      </div>

      <p className="mt-4 max-w-2xl text-sm text-muted">{preflight.browserProfile}</p>
    </>
  );
}
