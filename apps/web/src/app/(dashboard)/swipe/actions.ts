'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';
import { classifyHookType, extractHookPattern } from '@halyard/core';

/**
 * Saving a swipe entry does two things. The entry becomes a few-shot example,
 * and its hook becomes a *pattern* in the hook library — the shape, not the
 * words, so taste enters the system as structure rather than as a vague
 * instruction (I.7).
 */
export async function addSwipeEntry(formData: FormData): Promise<void> {
  await requireOperator();

  const whyItWorks = String(formData.get('whyItWorks') ?? '').trim();
  if (!whyItWorks) return; // The reason is the entry. Without it there is nothing to learn.

  const hookText = String(formData.get('hookText') ?? '').trim() || null;
  const platform = String(formData.get('platform') ?? '') || null;
  const format = String(formData.get('format') ?? '') || null;
  const category = String(formData.get('category') ?? '') || null;

  const hookType = hookText ? classifyHookType(hookText) : null;

  await query(
    `insert into references_swipe (product_id, url, platform, format, category,
                                   why_it_works, hook_text, hook_type)
     values ('recipefix', $1, $2, $3, $4, $5, $6, $7)`,
    [
      String(formData.get('url') ?? '').trim() || null,
      platform,
      format,
      category,
      whyItWorks,
      hookText,
      hookType,
    ],
  );

  if (hookText && hookType) {
    const { template } = extractHookPattern(hookText);
    await query(
      `insert into hooks (product_id, pattern, pattern_template, hook_type, layer,
                          platform, category, format, source)
       values ('recipefix', $1, $2, $3, 'text', $4, $5, $6, 'swipe')
       on conflict do nothing`,
      [hookText, template, hookType, platform, category, format],
    );
  }

  revalidatePath('/swipe');
}

export async function removeSwipeEntry(formData: FormData): Promise<void> {
  await requireOperator();
  await query('delete from references_swipe where id = $1', [String(formData.get('id'))]);
  revalidatePath('/swipe');
}
