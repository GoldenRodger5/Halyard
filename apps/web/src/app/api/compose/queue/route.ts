import { NextResponse, type NextRequest } from 'next/server';
import { runAllGates, type SlopPlatform } from '@halyard/core';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * v2 H.5 — "any turn can become a queued item".
 *
 * The draft still goes through the gates on the way in. Co-pilot output is not
 * exempt from QC just because a human was in the conversation; the queue's whole
 * value is that everything in it passed the same checks.
 */
export async function POST(request: NextRequest) {
  await requireOperator();
  const form = await request.formData();
  const productId = String(form.get('productId') ?? 'recipefix');

  let draft: {
    platform: SlopPlatform;
    body: string;
    hashtags?: string[];
    /** §283. The shape the operator picked, carried from the stream. */
    postFormat?: string | null;
  };
  try {
    draft = JSON.parse(String(form.get('draft')));
  } catch {
    return NextResponse.json({ error: 'malformed draft' }, { status: 400 });
  }

  const account = await one<{ id: string; persona: string }>(
    `select id, persona from social_accounts
      where product_id = $1 and platform = $2 and capability_state in ('live','draft_only')
      order by (persona = 'brand') desc limit 1`,
    [productId, draft.platform],
  );
  if (!account) {
    return NextResponse.json(
      { error: `No connected ${draft.platform} account to queue this against.` },
      { status: 428 },
    );
  }

  const rules = await one<{ content_rules: { forbidden_claims?: string[]; banned_phrases?: string[] } }>(
    'select content_rules from products where id = $1',
    [productId],
  );

  const qc = runAllGates({
    copy: {
      body: draft.body,
      platform: draft.platform,
      hashtags: draft.hashtags ?? [],
      extraBannedPhrases: rules?.content_rules?.banned_phrases,
      forbiddenClaims: rules?.content_rules?.forbidden_claims,
    },
  });

  if (!qc.passed) {
    const target = new URL('/compose', request.nextUrl.origin);
    target.searchParams.set(
      'error',
      `Not queued: ${qc.gates.find((g) => g.status === 'failed')?.summary ?? 'QC failed'}`,
    );
    return NextResponse.redirect(target, { status: 303 });
  }

  const rows = await query<{ id: string }>(
    /*
     * §283. `post_format` recorded here too, not only on the worker's path.
     * A composed piece that does not record its shape is invisible to the
     * recency rule, so the next automatic run could repeat it — the same
     * failure §281's migration exists to prevent, one entry point over.
     */
    `insert into content_items (product_id, account_id, platform, persona, format, category,
                                body, hashtags, status, qc_results, ai_components,
                                generation_meta, post_format)
     values ($1,$2,$3,$4,'text','founder_insight',$5,$6,'pending_approval',$7,array['copy'],$8,$9)
     returning id`,
    [
      productId,
      account.id,
      draft.platform,
      account.persona,
      draft.body,
      draft.hashtags ?? [],
      JSON.stringify(qc),
      { source: 'compose', prompt_version: 'copilot.v1' },
      typeof draft.postFormat === 'string' ? draft.postFormat : null,
    ],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'compose_queued', 'content_item', $1, '{}'::jsonb)`,
    [rows[0]!.id],
  );

  return NextResponse.redirect(new URL(`/queue/${rows[0]!.id}`, request.nextUrl.origin), {
    status: 303,
  });
}
