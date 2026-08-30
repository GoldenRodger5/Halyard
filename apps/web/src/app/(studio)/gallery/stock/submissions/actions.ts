'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

const STATUSES = [
  'not_started',
  'preparing',
  'submitted',
  'changes_requested',
  'approved',
  'rejected',
  'abandoned',
];

/**
 * Record where a platform review actually stands.
 *
 * "Blocked on review" is only a real answer when the submission date is written
 * down, so submitting sets it and approving records the decision date. Both are
 * how /settings/readiness can tell a wait from a stall.
 */
export async function updateSubmission(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const status = String(formData.get('status'));
  const notes = String(formData.get('decision_notes') ?? '').trim();
  const externalUrl = String(formData.get('external_url') ?? '').trim();

  if (!STATUSES.includes(status)) return;

  await query(
    `update review_submissions
        set status = $2,
            decision_notes = nullif($3, ''),
            external_url = nullif($4, ''),
            submitted_at = case
              when $2 = 'submitted' and submitted_at is null then now()
              else submitted_at end,
            decided_at = case
              when $2 in ('approved','rejected') then now()
              else null end
      where id = $1`,
    [id, status, notes, externalUrl],
  );

  // An approved review is exactly the moment the account can go live, so the
  // capability state is offered rather than left for someone to remember.
  if (status === 'approved') {
    await query(
      `update social_accounts sa
          set capability_state = 'live',
              capability_detail = 'Platform review approved; marked live from /submissions.'
         from review_submissions rs
        where rs.id = $1 and sa.product_id = rs.product_id and sa.platform = rs.platform
          and sa.capability_state = 'draft_only'`,
      [id],
    );
  }

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'review_submission_updated', 'review_submission', $1, $2)`,
    [id, { status }],
  );

  revalidatePath('/gallery/stock/submissions');
  revalidatePath('/master');
}
