'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/** build pack §2 step 4 — templates you reject are disabled, not deleted. */
export async function setTemplateEnabled(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const enabled = String(formData.get('enabled')) === '1';
  const reason = String(formData.get('reason') ?? '').trim() || null;

  await query(
    `update templates
        set enabled = $2,
            disabled_reason = case when $2 then null else $3 end
      where id = $1`,
    [id, enabled, reason],
  );

  revalidatePath('/templates');
}
