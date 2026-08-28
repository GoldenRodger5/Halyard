import { Badge, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { OPENING_COMPOSITIONS, TYPOGRAPHY_SYSTEMS, VISUAL_LANGUAGES } from '@halyard/core';
import { query } from '@/lib/db';
import { getProducts } from '@/lib/queries';
import { StudioClient } from './StudioClient';

export const dynamic = 'force-dynamic';

/**
 * The Creative Studio. §235.
 *
 * ## What this is for
 *
 * The daily queue handles volume: it generates, gates and presents work for
 * approval. This is the other direction — an operator with an intent, or with
 * no intent and a wish to be shown some. It is the only screen where a person
 * chooses *what* gets made rather than judging what already was.
 *
 * ## Why the concepts come from a job
 *
 * Generating several materially different concepts is a strategy-grade model
 * call over signals, account history and content gaps. Running it inline would
 * hold the request open for the length of a model call and give the operator a
 * spinner; queuing it means the page is honest about what is happening and a
 * failure is a job to look at rather than a broken screen.
 */
export default async function StudioPage() {
  const products = await getProducts();
  const productId = products[0]?.id ?? 'recipefix';

  const [batches, accounts, running, recent] = await Promise.all([
    /*
     * Concepts grouped by the batch they were generated in. A batch is the
     * unit an operator chooses from — "here are five ways to do this" — so
     * showing loose concepts would lose the comparison that is the point.
     */
    query<{
      batch_id: string;
      created_at: string;
      concepts: Array<{
        id: string;
        title: string;
        premise: string;
        hook: string | null;
        objective: string;
        emotional_angle: string | null;
        differentiation: string | null;
        retention_strategy: string | null;
        score: string | null;
        score_breakdown: Record<string, unknown>;
        status: string;
        platform_intent: string[];
        evidence_requirements: Record<string, unknown>;
      }>;
    }>(
      `select batch_id,
              min(created_at) as created_at,
              json_agg(json_build_object(
                'id', id, 'title', title, 'premise', premise, 'hook', hook,
                'objective', objective, 'emotional_angle', emotional_angle,
                'differentiation', differentiation, 'retention_strategy', retention_strategy,
                'score', score, 'score_breakdown', score_breakdown, 'status', status,
                'platform_intent', platform_intent, 'evidence_requirements', evidence_requirements
              ) order by score desc nulls last) as concepts
         from concepts
        where product_id = $1 and batch_id is not null
        group by batch_id
        having bool_or(status = 'proposed')
        order by min(created_at) desc
        limit 3`,
      [productId],
    ),
    query<{ platform: string; handle: string; capability_state: string }>(
      `select platform, handle, capability_state from social_accounts
        where product_id = $1 order by platform`,
      [productId],
    ),
    /* Work already in flight, so the page shows progress rather than nothing. */
    query<{ kind: string; status: string; created_at: string; payload: Record<string, unknown> }>(
      `select kind, status, created_at, payload from jobs
        where kind in ('generate_concepts','generate','render','tts')
          and status in ('pending','running')
        order by created_at desc limit 8`,
    ),
    /*
     * What the last few pieces looked like, so an operator can see the
     * variety the directors are actually producing rather than trusting it.
     */
    query<{
      id: string;
      title: string | null;
      platform: string;
      status: string;
      language: string | null;
      typography: string | null;
      opening: string | null;
      treatment: string | null;
    }>(
      `select ci.id, ci.title, ci.platform, ci.status,
              b.visual_direction ->> 'language' as language,
              b.visual_direction ->> 'typography' as typography,
              b.visual_direction ->> 'opening' as opening,
              b.treatment
         from content_items ci
         left join creative_briefs b on b.id = ci.brief_id
        where ci.product_id = $1
        order by ci.created_at desc
        limit 6`,
      [productId],
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Studio"
        subtitle="Ask for concepts or describe what you want. Halyard reads current signals, what this account has already done, and what performed — then offers several materially different ways in. You pick one, adjust the direction, and it gets built."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <StudioClient
          productId={productId}
          batches={batches}
          platforms={accounts.map((a) => ({
            platform: a.platform,
            handle: a.handle,
            connected: a.capability_state !== 'unknown',
          }))}
          /* Gotcha 10. The client cannot import the core barrel — it reaches
             `node:crypto` and the production build refuses it — so the
             vocabulary comes down as data from here, where it is safe. */
          vocabulary={{
            visualLanguages: VISUAL_LANGUAGES,
            typographySystems: TYPOGRAPHY_SYSTEMS.map((s) => s.id),
            openings: OPENING_COMPOSITIONS,
          }}
        />

        <aside className="space-y-6">
          <Card className="p-4">
            <SectionTitle>In flight</SectionTitle>
            {running.length === 0 ? (
              <p className="text-xs text-muted">Nothing is being generated right now.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {running.map((job, i) => (
                  <li key={`${job.kind}-${i}`} className="flex items-center justify-between gap-2">
                    <code className="text-primary">{job.kind}</code>
                    <Badge tone={job.status === 'running' ? 'info' : 'neutral'}>{job.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            {/*
              §226–§229 made language, type and opening decisions rather than
              constants. This is where an operator can see whether they are
              actually varying, which is the only way to know the rotation is
              real rather than declared.
            */}
            <SectionTitle>Recent creative direction</SectionTitle>
            {recent.length === 0 ? (
              <p className="text-xs text-muted">Nothing generated yet.</p>
            ) : (
              <ul className="space-y-3 text-xs">
                {recent.map((item) => (
                  <li key={item.id} className="border-b border-line pb-2 last:border-0">
                    <div className="truncate font-medium">{item.title ?? 'Untitled'}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                      <span>{item.platform}</span>
                      {item.treatment ? <span>· {item.treatment}</span> : null}
                      {item.language ? <span>· {item.language}</span> : null}
                      {item.typography ? <span>· {item.typography}</span> : null}
                      {item.opening ? <span>· {item.opening}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {recent.length > 0 && recent.every((r) => !r.language) ? (
              <p className="mt-3 text-[11px] text-muted">
                No creative direction recorded on these. They predate the director, or were
                generated without a brief.
              </p>
            ) : null}
          </Card>
        </aside>
      </div>

      {batches.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No concepts waiting"
            body="Ask for some above. With no brief, Halyard reads recent signals, what this account has posted, and where the gaps are."
          />
        </div>
      ) : null}
    </>
  );
}
