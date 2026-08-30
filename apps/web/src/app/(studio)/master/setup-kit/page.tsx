import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  PlatformDot,
  PLATFORM_LABELS,
  SectionTitle,
  type Tone,
} from '@halyard/ui';
import {
  CREATION_ORDER,
  CREATION_ORDER_NOTE,
  PROFILE_SPECS,
  SETUP_CHECKLISTS,
  profileUrl,
  summariseChecks,
  type HandleCheck,
  type PlatformId,
} from '@halyard/core';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { linkInBioUrl } from '@/lib/origin';
import { formatInOperatorTz } from '@/lib/format';
import { checkHandles, chooseVariant, generateKit } from './actions';

export const dynamic = 'force-dynamic';

interface KitRow {
  platform: string;
  bios: Array<{ text: string; angle: string; length: number }>;
  display_names: string[];
  pinned_post: string | null;
  chosen_bio: number | null;
  chosen_name: number | null;
  notes: string[];
  generated_at: string;
}

interface HandleRow {
  platform: string;
  handle: string;
  last_status: string | null;
  last_detail: string | null;
  last_method: string | null;
  checked_at: string | null;
}

const STATUS_TONE: Record<string, Tone> = {
  available: 'good',
  taken: 'bad',
  invalid: 'bad',
  unknown: 'warn',
};

const STATUS_LABEL: Record<string, string> = {
  available: 'looks free',
  taken: 'taken',
  invalid: 'not legal here',
  unknown: 'unknown',
};

/**
 * The account setup kit. Milestone 50.
 *
 * Seven profiles get created in one sitting, in another browser window, from
 * this page. Everything here is shaped by that: the platforms are in the order
 * they must be created, each one carries its own limits and its own blocking
 * requirements, and the copy is generated once and held rather than regenerated
 * under the operator between reading it and pasting it.
 */
export default async function SetupKitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; persona?: string }>;
}) {
  const sp = await searchParams;
  const product = await getCurrentProduct();
  const persona = sp.persona === 'founder' ? 'founder' : 'brand';
  const timeZone = product?.operator_timezone ?? 'UTC';

  if (!product) {
    return (
      <>
        <PageHeader title="Setup kit" subtitle="Everything needed to create the accounts." />
        <EmptyState
          title="No product yet"
          body="The kit is generated from a product's brief and brand tokens. Create one first."
          action={
            <a
              href="/master/product/new"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Add a product
            </a>
          }
        />
      </>
    );
  }

  const [entries, handles, bioLink] = await Promise.all([
    query<KitRow>(
      `select platform, bios, display_names, pinned_post, chosen_bio, chosen_name, notes, generated_at
         from setup_kit_entries where product_id = $1 and persona = $2`,
      [product.id, persona],
    ),
    query<HandleRow>(
      `select platform, handle, last_status, last_detail, last_method, checked_at
         from desired_handles where product_id = $1`,
      [product.id],
    ),
    linkInBioUrl(product.id),
  ]);

  const byPlatform = new Map(entries.map((row) => [row.platform, row]));
  const handleByPlatform = new Map(handles.map((row) => [row.platform, row]));
  const anyGenerated = entries.length > 0;
  const desiredHandle = handles[0]?.handle ?? '';

  return (
    <>
      <PageHeader
        title="Setup kit"
        subtitle="Bios, names, images and checklists for creating the accounts. Generated from the brief and the brand tokens, so it says what the product actually does."
      />

      {sp.error ? (
        <Card className="mb-6 border-danger/40 bg-danger/5 p-4">
          <p className="text-sm text-danger">{sp.error}</p>
        </Card>
      ) : null}

      {/* ── the link that has to exist first ──────────────────────────────── */}
      <Card className={`mb-6 p-4 ${bioLink ? '' : 'border-warn/40 bg-warn/5'}`}>
        <h2 className="text-sm font-medium text-ink">Link for every profile</h2>
        {bioLink ? (
          <>
            <p className="mt-2 break-all font-mono text-sm text-primary">{bioLink}</p>
            <p className="mt-2 text-sm text-muted">
              Live now. Paste it into each profile&rsquo;s website field. Every click through it is
              counted and attributed, which is the only reason clicks from a bio are measurable at
              all.
            </p>
          </>
        ) : (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
            This deployment is not reachable from outside, so there is no URL to paste yet. Deploy
            first. Creating profiles now means going back to edit all seven, and a profile edited
            within minutes of creation is the pattern that gets new accounts limited.
          </p>
        )}
      </Card>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form action={generateKit} className="flex items-end gap-2">
          <input type="hidden" name="product" value={product.id} />
          <input type="hidden" name="persona" value={persona} />
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            {anyGenerated ? 'Regenerate all' : `Generate the ${persona} kit`}
          </button>
        </form>

        {anyGenerated ? (
          <a
            href={`/api/setup-kit/download?product=${encodeURIComponent(product.id)}&persona=${persona}`}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-sunk hover:text-ink"
          >
            Download everything
          </a>
        ) : null}

        <div className="flex gap-1 rounded-lg border border-line p-1">
          {(['brand', 'founder'] as const).map((option) => (
            <a
              key={option}
              href={`/setup-kit?persona=${option}`}
              className={`rounded-md px-3 py-1 text-sm ${
                persona === option ? 'bg-sunk font-medium text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {option}
            </a>
          ))}
        </div>
      </div>

      {/* ── handles ───────────────────────────────────────────────────────── */}
      <SectionTitle hint="read-only checks against public endpoints — nothing is reserved">
        Handle availability
      </SectionTitle>
      <Card className="mb-8 p-4">
        <form action={checkHandles} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="product" value={product.id} />
          <span className="text-muted">@</span>
          <input
            name="handle"
            defaultValue={desiredHandle}
            placeholder="therecipefix"
            required
            className="w-56 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
          />
          <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
            Check everywhere
          </button>
        </form>

        {handles.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <p className="mb-3 text-sm text-ink">
              {summariseChecks(
                handles.map(
                  (row) =>
                    ({
                      platform: row.platform as PlatformId,
                      handle: row.handle,
                      status: (row.last_status ?? 'unknown') as HandleCheck['status'],
                      method: (row.last_method ?? 'manual') as HandleCheck['method'],
                      detail: row.last_detail ?? '',
                      checkUrl: profileUrl(row.platform as PlatformId, row.handle),
                    }) satisfies HandleCheck,
                ),
              )}
              {handles[0]?.checked_at ? (
                <span className="text-muted">
                  {' '}
                  Checked {formatInOperatorTz(handles[0].checked_at, timeZone)}. Nothing is reserved
                  by looking.
                </span>
              ) : null}
            </p>
            <table className="w-full min-w-[42rem] text-sm">
              <tbody className="divide-y divide-line">
                {CREATION_ORDER.map((platform) => {
                  const row = handleByPlatform.get(platform);
                  if (!row) return null;
                  return (
                    <tr key={platform}>
                      <td className="whitespace-nowrap py-2 pr-4">
                        <span className="inline-flex items-center gap-2 font-medium text-ink">
                          <PlatformDot platform={platform} />
                          {PLATFORM_LABELS[platform]}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={STATUS_TONE[row.last_status ?? 'unknown']!}>
                          {STATUS_LABEL[row.last_status ?? 'unknown']}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted">{row.last_detail}</td>
                      <td className="whitespace-nowrap py-2 text-right">
                        <a
                          href={profileUrl(platform, row.handle)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary hover:underline"
                        >
                          look
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted">
              Only Bluesky has a real availability API, and its answer is reliable. The rest are a
              public profile page returning 404 or not, which reserved and suspended handles also
              do. X and TikTok cannot be checked at all without logging in, so they say unknown
              rather than guessing. Unknown is not free.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Nothing checked yet. One handle across seven platforms, so you find out before you
            commit to a name.
          </p>
        )}
      </Card>

      {/* ── per platform ──────────────────────────────────────────────────── */}
      <SectionTitle hint={CREATION_ORDER_NOTE}>Profiles, in the order to create them</SectionTitle>

      {!anyGenerated ? (
        <EmptyState
          title="Nothing generated yet"
          body={`Generate the ${persona} kit and this fills with three bio variants at each platform's real character limit, display names, a pinned post, and the images at the sizes each platform demands.`}
        />
      ) : (
        <div className="space-y-4">
          {CREATION_ORDER.map((platform, index) => (
            <PlatformCard
              key={platform}
              index={index + 1}
              platform={platform}
              productId={product.id}
              persona={persona}
              entry={byPlatform.get(platform)}
              handle={handleByPlatform.get(platform)}
              timeZone={timeZone}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PlatformCard({
  index,
  platform,
  productId,
  persona,
  entry,
  handle,
  timeZone,
}: {
  index: number;
  platform: PlatformId;
  productId: string;
  persona: 'brand' | 'founder';
  entry?: KitRow;
  handle?: HandleRow;
  timeZone: string;
}) {
  const spec = PROFILE_SPECS[platform];
  const checklist = SETUP_CHECKLISTS[platform];
  const imageBase = `/api/setup-kit/image?product=${encodeURIComponent(productId)}&platform=${platform}`;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted">{index}</span>
          <PlatformDot platform={platform} />
          <span className="font-medium text-ink">{PLATFORM_LABELS[platform]}</span>
          {handle ? <span className="text-sm text-muted">@{handle.handle}</span> : null}
          {spec.handle.derived ? <Badge tone="neutral">handle not chosen here</Badge> : null}
        </div>
        {entry ? (
          <span className="text-xs text-muted">
            generated {formatInOperatorTz(entry.generated_at, timeZone)}
          </span>
        ) : null}
      </div>

      {/* images */}
      <div className="mt-4 flex flex-wrap items-end gap-6">
        <figure className="flex flex-col gap-2">
          <img
            src={`${imageBase}&kind=avatar`}
            alt={`Profile image for ${PLATFORM_LABELS[platform]}, ${spec.avatar.width} by ${spec.avatar.height} pixels`}
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-full border border-line"
          />
          <figcaption className="text-xs text-muted">
            {spec.avatar.label} · {spec.avatar.width}&times;{spec.avatar.height}
          </figcaption>
        </figure>

        {spec.banner ? (
          <figure className="flex min-w-0 flex-col gap-2">
              <img
              src={`${imageBase}&kind=banner`}
              alt={`Header image for ${PLATFORM_LABELS[platform]}, ${spec.banner.width} by ${spec.banner.height} pixels`}
              className="h-[72px] w-auto max-w-full rounded border border-line"
            />
            <figcaption className="text-xs text-muted">
              {spec.banner.label} · {spec.banner.width}&times;{spec.banner.height}
              {spec.banner.note ? ` — ${spec.banner.note}` : ''}
            </figcaption>
          </figure>
        ) : null}
      </div>

      {/* copy */}
      {entry ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-[11px] uppercase tracking-[0.08em] text-muted">
              Bio · {spec.bioMaxChars} characters
            </h3>
            <ul className="mt-2 space-y-2">
              {entry.bios.map((bio, i) => (
                <li key={i} className="rounded-lg border border-line p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{bio.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-muted">
                      {bio.length}/{spec.bioMaxChars}
                    </span>
                    <span className="text-xs text-muted">{bio.angle}</span>
                    <form action={chooseVariant} className="ml-auto">
                      <input type="hidden" name="product" value={productId} />
                      <input type="hidden" name="platform" value={platform} />
                      <input type="hidden" name="persona" value={persona} />
                      <input type="hidden" name="field" value="chosen_bio" />
                      <input type="hidden" name="index" value={i} />
                      <button
                        className={`rounded-md px-2 py-1 text-xs ${
                          entry.chosen_bio === i
                            ? 'bg-primary text-white'
                            : 'border border-line text-muted hover:bg-sunk hover:text-ink'
                        }`}
                      >
                        {entry.chosen_bio === i ? 'used this' : 'use this'}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
              {entry.bios.length === 0 ? (
                <li className="text-sm text-muted">
                  None fitted the limit. Regenerate this platform.
                </li>
              ) : null}
            </ul>

            <h3 className="mt-4 text-[11px] uppercase tracking-[0.08em] text-muted">
              Display name · {spec.displayNameMaxChars} characters
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {entry.display_names.map((name, i) => (
                <li key={i}>
                  <form action={chooseVariant}>
                    <input type="hidden" name="product" value={productId} />
                    <input type="hidden" name="platform" value={platform} />
                    <input type="hidden" name="persona" value={persona} />
                    <input type="hidden" name="field" value="chosen_name" />
                    <input type="hidden" name="index" value={i} />
                    <button
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        entry.chosen_name === i
                          ? 'bg-primary text-white'
                          : 'border border-line text-ink hover:bg-sunk'
                      }`}
                    >
                      {name}{' '}
                      <span className="tabular-nums opacity-60">
                        {name.length}/{spec.displayNameMaxChars}
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            <h3 className="text-[11px] uppercase tracking-[0.08em] text-muted">Pinned post</h3>
            {entry.pinned_post ? (
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-line p-3 text-sm leading-relaxed text-ink">
                {entry.pinned_post}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">None generated.</p>
            )}

            <h3 className="mt-4 text-[11px] uppercase tracking-[0.08em] text-muted">
              Before Halyard can publish here
            </h3>
            <ul className="mt-2 space-y-2">
              {checklist.map((step) => (
                <li key={step.label} className="flex gap-2 text-sm">
                  <span
                    className={step.blocking ? 'text-danger' : 'text-muted'}
                    title={step.blocking ? 'Blocking' : 'Recommended'}
                  >
                    {step.blocking ? '!' : '·'}
                  </span>
                  <span className="min-w-0">
                    <span className="text-ink">{step.label}</span>
                    <span className="block text-muted">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{spec.linkNote}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <p className="text-sm text-muted">Nothing generated for this platform.</p>
          <form action={generateKit}>
            <input type="hidden" name="product" value={productId} />
            <input type="hidden" name="persona" value={persona} />
            <input type="hidden" name="platform" value={platform} />
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
              Generate just this one
            </button>
          </form>
        </div>
      )}

      {entry && entry.notes.length > 0 ? (
        <p className="mt-3 rounded-lg bg-sunk px-3 py-2 text-xs text-muted">
          {entry.notes.join(' ')}
        </p>
      ) : null}
    </Card>
  );
}
