'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAllGates, type SlopPlatform } from '@halyard/core';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * Turn a stored review into a post. Milestone 45.
 *
 * The draft quotes the review verbatim and attaches the row, so the proof gate
 * can verify it. Nothing here rewrites, tightens or "improves" the quote —
 * that is the whole point of the milestone.
 */
export async function turnIntoPost(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const platform = String(formData.get('platform') ?? 'x') as SlopPlatform;

  const proof = await one<{
    id: string;
    product_id: string;
    source: string;
    author_display: string | null;
    body: string;
    consent_state: string;
    rating: number | null;
  }>('select * from social_proof where id = $1', [id]);
  if (!proof) return;

  const account = await one<{ id: string; persona: string }>(
    `select id, persona from social_accounts
      where product_id = $1 and platform = $2 and persona = 'brand'
        and capability_state in ('live','draft_only') limit 1`,
    [proof.product_id, platform],
  );
  if (!account) {
    redirect(
      `/social-proof?error=${encodeURIComponent(`No connected ${platform} account to post this from.`)}`,
    );
  }

  // Attribution only where the platform already publishes the name.
  const canName =
    proof.consent_state === 'granted' || proof.consent_state === 'public_by_default';
  const attribution = canName && proof.author_display
    ? `— ${proof.author_display}${proof.source === 'app_store' ? ', App Store' : ''}`
    : proof.source === 'app_store'
      ? '— an App Store review'
      : '— a reader';

  const body = `“${proof.body.trim()}”\n\n${attribution}`;

  const qc = runAllGates({
    copy: { body, platform },
    proof: {
      body,
      attached: [
        {
          id: proof.id,
          source: proof.source as 'app_store',
          sourceId: proof.id,
          authorDisplay: proof.author_display,
          body: proof.body,
          consentState: proof.consent_state as 'granted',
        },
      ],
    },
  });

  const rows = await query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category,
                                body, status, qc_results, ai_components, generation_meta)
     values ($1,$2,$3,$4,'text','community',$5,$6,$7,array['copy'],$8)
     returning id`,
    [
      proof.product_id,
      account!.id,
      platform,
      account!.persona,
      body,
      qc.passed ? 'pending_approval' : 'failed',
      JSON.stringify(qc),
      { source: 'social_proof', proofId: proof.id },
    ],
  );

  await query(
    `update social_proof set status = 'used', content_item_id = $2 where id = $1`,
    [id, rows[0]!.id],
  );

  revalidatePath('/social-proof');
  redirect(`/queue/${rows[0]!.id}`);
}

export async function setConsent(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const state = String(formData.get('consent_state'));
  if (!['not_asked', 'granted', 'declined', 'public_by_default'].includes(state)) return;

  await query('update social_proof set consent_state = $2 where id = $1', [id, state]);
  revalidatePath('/social-proof');
}

export async function declineProof(formData: FormData): Promise<void> {
  await requireOperator();
  await query(`update social_proof set status = 'declined' where id = $1`, [
    String(formData.get('id')),
  ]);
  revalidatePath('/social-proof');
}
