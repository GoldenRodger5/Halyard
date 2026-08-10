'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * Manual capability override. v1 §8: "Manual override to flip draft_only → live
 * once approval lands." Halyard cannot see a platform's review decision, so the
 * operator records it.
 */
export async function setCapabilityState(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const id = String(formData.get('id'));
  const state = String(formData.get('state'));

  if (!['live', 'draft_only', 'disabled', 'pending_auth'].includes(state)) return;

  await query(
    `update social_accounts
        set capability_state = $2,
            capability_detail = case when $2 = 'live' then 'Marked live by the operator after platform review.' else capability_detail end,
            last_error = case when $2 <> 'error' then null else last_error end
      where id = $1`,
    [id, state],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'capability_state_change', 'social_account', $1, $2)`,
    [id, { state, operator: operator.email }],
  );

  revalidatePath('/accounts');
  revalidatePath('/');
}
