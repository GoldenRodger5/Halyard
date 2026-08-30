import { notFound } from 'next/navigation';
import { Badge, Card, KeyValue, PageHeader, SectionTitle } from '@halyard/ui';
import { one, query } from '@/lib/db';
import { getMix, getProduct } from '@/lib/queries';
import { saveBrief, saveVoice, testConnector } from './actions';

export const dynamic = 'force-dynamic';

interface VoiceRow {
  id: string;
  persona: string;
  display_name: string;
  description: string;
  do_rules: string[];
  dont_rules: string[];
  examples: Array<{ text: string; why_good?: string }>;
  anti_examples: Array<{ text: string; why_bad?: string }>;
  mix_targets: Record<string, number>;
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const voices = await query<VoiceRow>(
    'select * from brand_voices where product_id = $1 order by persona',
    [id],
  );
  const mix = await getMix(id);
  const connectorHealth = await one<{ detail: string; created_at: string }>(
    `select body as detail, created_at from notifications
      where kind = 'connector_down' order by created_at desc limit 1`,
  );

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={product.tagline ?? undefined}
        actions={<Badge tone="neutral">{product.id}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle hint="injected into every generation prompt">Brief</SectionTitle>
            <form action={saveBrief} className="space-y-3">
              <input type="hidden" name="id" value={product.id} />
              <textarea
                name="brief"
                defaultValue={product.brief_markdown ?? ''}
                rows={12}
                placeholder="Paste the product overview document. Halyard compresses it into a summary that stays in context, and extracts brand tokens as editable defaults."
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs leading-relaxed focus:border-primary focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">
                  {product.brief_summary
                    ? `Summary on file: ${product.brief_summary.slice(0, 90)}`
                    : 'No compressed summary yet.'}
                </p>
                <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
                  Save and re-summarise
                </button>
              </div>
            </form>
          </Card>

          {voices.map((voice) => (
            <Card key={voice.id} className="p-5">
              <SectionTitle hint={voice.persona}>{voice.display_name}</SectionTitle>
              <form action={saveVoice} className="space-y-3">
                <input type="hidden" name="id" value={voice.id} />
                <textarea
                  name="description"
                  defaultValue={voice.description}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.1em] text-muted">
                    Do
                    <textarea
                      name="do_rules"
                      defaultValue={voice.do_rules.join('\n')}
                      rows={5}
                      className="mt-1 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs uppercase tracking-[0.1em] text-muted">
                    Never
                    <textarea
                      name="dont_rules"
                      defaultValue={voice.dont_rules.join('\n')}
                      rows={5}
                      className="mt-1 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.1em] text-muted">
                    Mix targets vs actual, trailing 21 days
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(voice.mix_targets ?? {}).map(([category, target]) => {
                      const actual = Number(
                        mix.find((m) => m.category === category)?.share ?? 0,
                      );
                      return (
                        <div key={category} className="flex items-center gap-3 text-sm">
                          <span className="w-32 capitalize text-ink">{category}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(100, (actual / Math.max(target, 0.01)) * 100)}%` }}
                            />
                          </div>
                          <span className="w-24 text-right text-xs text-muted">
                            {(actual * 100).toFixed(0)}% of {(target * 100).toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {voice.anti_examples?.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-[0.1em] text-muted">
                      Rejected drafts, fed back as do-not-do
                    </p>
                    <ul className="space-y-1">
                      {voice.anti_examples.slice(0, 5).map((example, i) => (
                        <li key={i} className="rounded bg-sunk/60 px-2 py-1.5 text-xs text-muted">
                          <span className="text-ink">{example.text.slice(0, 90)}</span>
                          {example.why_bad ? ` — ${example.why_bad}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-sunk">
                    Save voice
                  </button>
                </div>
              </form>
            </Card>
          ))}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <SectionTitle>Brand tokens</SectionTitle>
            <dl>
              {Object.entries(product.brand_tokens ?? {}).map(([key, value]) => (
                <KeyValue key={key} label={key.replace(/_/g, ' ')}>
                  <span className="inline-flex items-center gap-2">
                    {String(value).startsWith('#') ? (
                      <span
                        className="h-4 w-4 rounded border border-line"
                        style={{ backgroundColor: String(value) }}
                      />
                    ) : null}
                    <code className="text-xs">{String(value)}</code>
                  </span>
                </KeyValue>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <SectionTitle>Content rules</SectionTitle>
            <p className="mb-2 text-xs uppercase tracking-[0.1em] text-muted">Forbidden claims</p>
            <ul className="mb-4 space-y-1">
              {(product.content_rules?.forbidden_claims ?? []).map((claim) => (
                <li key={claim} className="text-sm text-ink">
                  {claim}
                </li>
              ))}
            </ul>
            <p className="mb-2 text-xs uppercase tracking-[0.1em] text-muted">Banned phrases</p>
            <p className="text-sm text-muted">
              {(product.content_rules?.banned_phrases ?? []).join(', ') || 'none beyond the built-in list'}
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle>Connector</SectionTitle>
            <p className="mb-3 text-sm leading-relaxed text-muted">
              Content is built from real product output. If this is unreachable, generation pauses
              rather than inventing.
            </p>
            <form action={testConnector}>
              <input type="hidden" name="id" value={product.id} />
              <button className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink hover:bg-sunk">
                Generate a test sample
              </button>
            </form>
            {connectorHealth ? (
              <p className="mt-3 rounded bg-sunk px-2 py-1.5 text-xs leading-relaxed text-muted">
                {connectorHealth.detail}
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
    </>
  );
}
