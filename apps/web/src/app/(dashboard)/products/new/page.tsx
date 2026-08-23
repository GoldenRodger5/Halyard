import Link from 'next/link';
import { Badge, Card, PageHeader, SectionTitle } from '@halyard/ui';
import { one } from '@/lib/db';
import {
  createProduct,
  saveBrandTokens,
  saveBrief,
  saveConnector,
  seedVoices,
  testConnector,
} from './actions';

export const dynamic = 'force-dynamic';

const STEPS = [
  { n: 1, title: 'Identity', hint: 'name, id, timezones' },
  { n: 2, title: 'Brief', hint: 'what it is and who it is for' },
  { n: 3, title: 'Brand', hint: 'colours and type' },
  { n: 4, title: 'Connector', hint: 'where real product output comes from' },
  { n: 5, title: 'Voice', hint: 'how it sounds' },
];

interface DraftProduct {
  id: string;
  name: string;
  brief_markdown: string | null;
  brief_summary: string | null;
  brand_tokens: Record<string, string>;
  connector_type: string;
  connector_config: Record<string, string>;
}

/**
 * Adding a product. Milestone 43, item 1.
 *
 * The definition of done is that a second product can be added through the UI in
 * five minutes, so this is deliberately five short steps rather than one long
 * form — and every step writes, so an interruption costs the remaining steps
 * rather than all of them.
 */
export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; step?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const step = Number(sp.step ?? 1);

  const product = sp.product
    ? await one<DraftProduct>(
        `select id, name, brief_markdown, brief_summary, brand_tokens, connector_type,
                connector_config
           from products where id = $1`,
        [sp.product],
      )
    : null;

  const tokens = product?.brand_tokens ?? {};
  const lastTest = product?.connector_config?.last_test;

  return (
    <>
      <PageHeader
        title="Add a product"
        subtitle="Five steps. Each one saves as you go, so stopping halfway leaves a real product with gaps rather than nothing."
        actions={
          <Link href="/products" className="text-sm text-primary underline">
            All products
          </Link>
        }
      />

      {sp.error ? (
        <Card className="mb-6 border-danger/40 bg-danger/5 p-4">
          <p className="text-sm text-danger">{sp.error}</p>
        </Card>
      ) : null}

      <ol className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <li key={s.n}>
            <span
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                s.n === step
                  ? 'border-primary bg-primary/10 text-ink'
                  : s.n < step
                    ? 'border-line text-muted'
                    : // A step not yet reached. Previously dimmed to
                      // `opacity-60`, which put it at 2.35:1 — unreadable. The
                      // completed steps already carry a `done` badge, so the
                      // opacity was a second cue that cost the first.
                      'border-line text-muted'
              }`}
            >
              <span className="tabular-nums">{s.n}</span>
              {s.title}
              {s.n < step ? <Badge tone="good">done</Badge> : null}
            </span>
          </li>
        ))}
      </ol>

      <Card className="max-w-2xl p-6">
        {/* ── 1. Identity ─────────────────────────────────────────────────── */}
        {step === 1 ? (
          <form action={createProduct} className="space-y-4">
            <SectionTitle hint="the id appears in URLs and in the routing constraint">
              Identity
            </SectionTitle>

            <Field label="Name" hint="How you refer to it. Shown throughout.">
              <input
                name="name"
                required
                placeholder="Kinolog"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
              />
            </Field>

            <Field
              label="Id"
              hint="Lowercase, no spaces. This is permanent — brand accounts are scoped to it."
            >
              <input
                name="id"
                required
                pattern="[a-z0-9][a-z0-9_\-]*"
                placeholder="kinolog"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink"
              />
            </Field>

            <Field label="Tagline" hint="One line. Optional.">
              <input
                name="tagline"
                placeholder="Every film you have ever watched, in one place"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
              />
            </Field>

            <Field label="Website" hint="Becomes the default link destination.">
              <input
                name="website_url"
                type="url"
                placeholder="https://kinolog.app"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
              />
            </Field>

            <Field
              label="App Store listing"
              hint="Optional. Only if the product ships in a store — it becomes an evidence source."
            >
              <input
                name="app_store_url"
                type="url"
                placeholder="https://apps.apple.com/app/id000000000"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Audience timezone" hint="When they are awake. Drives slots.">
                <TimezoneSelect name="audience_timezone" />
              </Field>
              <Field label="Your timezone" hint="How every time is displayed to you.">
                <TimezoneSelect name="operator_timezone" />
              </Field>
            </div>

            <Submit>Create and continue</Submit>
          </form>
        ) : null}

        {/* ── 2. Brief ────────────────────────────────────────────────────── */}
        {step === 2 && product ? (
          <form action={saveBrief} className="space-y-4">
            <input type="hidden" name="product" value={product.id} />
            <SectionTitle hint="the single most load-bearing input in the system">
              Brief
            </SectionTitle>

            <p className="text-sm leading-relaxed text-muted">
              What it is, who it is for, what it refuses to do, and what makes it different from
              the obvious alternative. Everything generated for this product is downstream of
              this, so vagueness here produces generic copy everywhere.
            </p>

            <textarea
              name="brief_markdown"
              rows={14}
              defaultValue={product.brief_markdown ?? ''}
              placeholder={
                'Kinolog is a film diary for people who watch more than they remember.\n\n' +
                'It is for the person who has seen four hundred films and cannot name twenty.\n\n' +
                'It refuses to be a social network. No followers, no likes.\n\n' +
                'The obvious alternative is Letterboxd, which is a social network first.'
              }
              className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink"
            />
            <Submit>Save and continue</Submit>
          </form>
        ) : null}

        {/* ── 3. Brand ────────────────────────────────────────────────────── */}
        {step === 3 && product ? (
          <form action={saveBrandTokens} className="space-y-4">
            <input type="hidden" name="product" value={product.id} />
            <SectionTitle hint="every rendered image uses these">Brand</SectionTitle>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['primary', 'Primary', '#C4714A'],
                ['background', 'Background', 'hsl(50 20% 97%)'],
                ['ink', 'Ink', '#2A2320'],
                ['muted', 'Muted', '#7A6E66'],
                ['accent', 'Accent', '#5C7A5E'],
              ].map(([key, label, fallback]) => (
                <Field key={key} label={label!}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-8 w-8 shrink-0 rounded-lg border border-line"
                      style={{ background: tokens[key!] ?? fallback }}
                    />
                    <input
                      name={key}
                      defaultValue={tokens[key!] ?? fallback}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink"
                    />
                  </div>
                </Field>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Heading font">
                <input
                  name="heading_font"
                  defaultValue={tokens.heading_font ?? 'Instrument Serif'}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                />
              </Field>
              <Field label="Body font">
                <input
                  name="body_font"
                  defaultValue={tokens.body_font ?? 'Inter'}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                />
              </Field>
            </div>

            {/* A real preview, using the tokens as saved. */}
            <div
              className="rounded-xl border border-line p-6"
              style={{ background: tokens.background ?? 'hsl(50 20% 97%)' }}
            >
              <p
                className="text-xs uppercase tracking-[0.18em]"
                style={{ color: tokens.primary ?? '#C4714A' }}
              >
                the mechanism
              </p>
              <p
                className="mt-2 text-2xl leading-tight"
                style={{
                  color: tokens.ink ?? '#2A2320',
                  fontFamily: tokens.heading_font ?? 'Instrument Serif',
                }}
              >
                This is what a rendered card looks like
              </p>
              <p className="mt-2 text-sm" style={{ color: tokens.muted ?? '#7A6E66' }}>
                Saved tokens, not a mock. Change them above and save to see it move.
              </p>
            </div>

            <Submit>Save and continue</Submit>
          </form>
        ) : null}

        {/* ── 4. Connector ────────────────────────────────────────────────── */}
        {step === 4 && product ? (
          <div className="space-y-4">
            <SectionTitle hint="optional — every product works without one">Connector</SectionTitle>

            <form action={saveConnector} className="space-y-4">
              <input type="hidden" name="product" value={product.id} />

              <div className="space-y-2">
                {[
                  ['mcp', 'MCP server', 'Optional, and the richest option. The tool list is read as evidence of what the product actually does; an artifact adapter is needed on top of that before posts can be built around real product output.'],
                  ['rest', 'REST API', 'Any HTTP endpoint that returns product data.'],
                  ['github', 'GitHub repository', 'No product API. Shipped features come from merged pull requests and releases.'],
                  ['none', 'None', 'Fully supported. The website, a store listing and your brief are still read as evidence; nothing tries to pull product output.'],
                ].map(([value, label, why]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name="connector_type"
                      value={value}
                      defaultChecked={product.connector_type === value}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{label}</span>
                      <span className="block text-sm text-muted">{why}</span>
                    </span>
                  </label>
                ))}
              </div>

              <details className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm text-muted">
                  Connection details
                </summary>
                <div className="mt-3 space-y-3">
                  <Field label="MCP url env var" hint="Names the variable, never the secret.">
                    <input
                      name="url_env"
                      defaultValue={product.connector_config?.url_env ?? ''}
                      placeholder={`${product.id.toUpperCase()}_MCP_URL`}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink"
                    />
                  </Field>
                  <Field label="Token env var">
                    <input
                      name="token_env"
                      defaultValue={product.connector_config?.token_env ?? ''}
                      placeholder={`${product.id.toUpperCase()}_MCP_TOKEN`}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink"
                    />
                  </Field>
                  <Field label="REST base URL">
                    <input
                      name="base_url"
                      defaultValue={product.connector_config?.base_url ?? ''}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="GitHub owner">
                      <input
                        name="owner"
                        defaultValue={product.connector_config?.owner ?? ''}
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                      />
                    </Field>
                    <Field label="GitHub repo">
                      <input
                        name="repo"
                        defaultValue={product.connector_config?.repo ?? ''}
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                      />
                    </Field>
                  </div>
                </div>
              </details>

              <Submit>Save and continue</Submit>
            </form>

            <form action={testConnector} className="border-t border-line pt-4">
              <input type="hidden" name="product" value={product.id} />
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                Test connection
              </button>
              {lastTest ? (
                <p
                  className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                    lastTest.startsWith('ok')
                      ? 'bg-good/10 text-ink'
                      : lastTest.startsWith('blocked')
                        ? 'bg-warn/10 text-ink'
                        : 'bg-danger/10 text-danger'
                  }`}
                >
                  {lastTest}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Save the connector first, then test. Every type has a real test, including
                  none.
                </p>
              )}
            </form>
          </div>
        ) : null}

        {/* ── 5. Voice ────────────────────────────────────────────────────── */}
        {step === 5 && product ? (
          <form action={seedVoices} className="space-y-4">
            <input type="hidden" name="product" value={product.id} />
            <SectionTitle hint="a starting point; calibration makes it yours">Voice</SectionTitle>

            <p className="text-sm leading-relaxed text-muted">
              This seeds a brand voice, a default content mix and four posting slots, so the
              product is immediately usable. It is not the finished voice — the calibration step
              in the first-run wizard is what turns it into yours, by having you rate twenty real
              drafts.
            </p>

            <Field label="How should it sound?" hint="One or two sentences.">
              <textarea
                name="voice_description"
                rows={4}
                placeholder={`Plain, specific and useful. Explains the mechanism rather than asserting the result. Never enthusiastic on ${product.name}'s behalf.`}
                className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink"
              />
            </Field>

            <Submit>Finish</Submit>
          </form>
        ) : null}

        {step > 1 && !product ? (
          <p className="text-sm text-muted">
            That product no longer exists.{' '}
            <Link href="/products/new" className="text-primary underline">
              Start again
            </Link>
            .
          </p>
        ) : null}
      </Card>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
      {children}
    </button>
  );
}

/** The zones an operator actually uses, plus whatever the browser reports. */
function TimezoneSelect({ name }: { name: string }) {
  const zones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Australia/Sydney',
    'UTC',
  ];
  return (
    <select
      name={name}
      defaultValue="America/New_York"
      className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
    >
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}
