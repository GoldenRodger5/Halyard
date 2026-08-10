import { Badge, Card, PageHeader, SectionTitle } from '@halyard/ui';
import { getTemplates } from '@/lib/queries';
import { setTemplateEnabled } from './actions';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const templates = await getTemplates();
  const byRenderer = new Map<string, typeof templates>();
  for (const template of templates) {
    if (!byRenderer.has(template.renderer)) byRenderer.set(template.renderer, []);
    byRenderer.get(template.renderer)!.push(template);
  }

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="A template you reject is disabled rather than deleted, so the idea engine stops proposing content it cannot render well while the template itself stays available to fix."
      />

      <div className="space-y-8">
        {[...byRenderer.entries()].map(([renderer, group]) => (
          <section key={renderer}>
            <SectionTitle hint={`${group.length} templates`}>{renderer}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((template) => (
                <Card key={template.id} className={`p-4 ${template.enabled ? '' : 'opacity-60'}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{template.aspect_ratio}</Badge>
                    <Badge tone="neutral">{template.format}</Badge>
                    {template.enabled ? null : <Badge tone="warn">disabled</Badge>}
                  </div>
                  <h3 className="font-mono text-sm text-ink">{template.id}</h3>
                  <p className="mt-1 min-h-[2.5rem] text-sm leading-relaxed text-muted">
                    {template.description ?? 'No description.'}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {template.uses} render{template.uses === 1 ? '' : 's'}
                  </p>
                  {template.disabled_reason ? (
                    <p className="mt-2 rounded bg-sunk px-2 py-1 text-xs text-muted">
                      {template.disabled_reason}
                    </p>
                  ) : null}

                  <form action={setTemplateEnabled} className="mt-3 flex gap-2">
                    <input type="hidden" name="id" value={template.id} />
                    <input type="hidden" name="enabled" value={template.enabled ? '0' : '1'} />
                    {template.enabled ? (
                      <input
                        name="reason"
                        placeholder="why disable?"
                        className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-xs"
                      />
                    ) : null}
                    <button className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:bg-sunk hover:text-ink">
                      {template.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </form>

                  <a
                    href={`/api/templates/${template.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-xs text-primary underline"
                  >
                    Render a live preview
                  </a>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
