'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createLlmClient,
  type LlmClient,
  CREATION_ORDER,
  checkHandle,
  generateProfileCopy,
  type PlatformId,
} from '@halyard/core';
import { one, query } from '@/lib/db';
import { linkInBioUrl } from '@/lib/origin';
import { requireOperator } from '@/lib/auth';
import { recordingClient } from '@/lib/agentRuns';

interface ProductRow {
  id: string;
  name: string;
  tagline: string | null;
  brief_markdown: string | null;
  brief_summary: string | null;
  content_rules: { forbidden_claims?: string[]; banned_phrases?: string[] } | null;
}

interface VoiceRow {
  display_name: string;
  description: string | null;
  do_rules: string[] | null;
  dont_rules: string[] | null;
}

const fail = (message: string): never =>
  redirect(`/setup-kit?error=${encodeURIComponent(message)}`);

/**
 * Generate the profile copy for one platform, or for all of them.
 *
 * All-at-once is the common case — the operator is about to create seven
 * profiles in one sitting — but it is seven model calls, so failures are
 * collected rather than allowed to abort the batch. Six good bios and one named
 * failure beats nothing.
 */
export async function generateKit(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('product') ?? '');
  const persona = String(formData.get('persona') ?? 'brand') as 'brand' | 'founder';
  const only = String(formData.get('platform') ?? '');

  const product = await one<ProductRow>(
    `select id, name, tagline, brief_markdown, brief_summary, content_rules
       from products where id = $1`,
    [productId],
  );
  if (!product) fail('That product does not exist.');

  const brief = product!.brief_markdown ?? product!.brief_summary;
  if (!brief || brief.trim().length < 40) {
    // Without a brief the generator has nothing but the product name, and would
    // invent the rest. That is the one failure mode this system exists to avoid.
    fail(
      'This product has no brief, so a bio would be invented rather than written. Add one at /products, or run `pnpm load-brief`.',
    );
  }

  const voice = await one<VoiceRow>(
    `select display_name, description, do_rules, dont_rules
       from brand_voices where product_id = $1 and persona = $2`,
    [productId, persona],
  );
  if (!voice) {
    fail(
      `No ${persona} voice is defined for this product. Complete /onboarding first — a bio written without a voice is a bio in nobody's voice.`,
    );
  }

  const bioLink = await linkInBioUrl(productId);
  const platforms = only ? [only as PlatformId] : CREATION_ORDER;

  /**
   * The handle each platform actually uses.
   *
   * Prefer the connected account's real handle over the one typed into the
   * availability checker, because the connected one is the truth. They differ
   * per platform by necessity — different legal characters, different names
   * already taken — so a bio must never cite a sibling platform's handle.
   */
  const handleRows = await query<{ platform: string; handle: string }>(
    `select platform, handle from (
       select platform, handle, 1 as rank from social_accounts
        where persona = $2 and (product_id = $1 or persona = 'founder')
       union all
       select platform, handle, 2 as rank from desired_handles where product_id = $1
     ) h order by rank`,
    [productId, persona],
  );
  const handleFor = new Map<string, string>();
  for (const row of handleRows) {
    if (!handleFor.has(row.platform)) handleFor.set(row.platform, row.handle.replace(/^@/, ''));
  }

  // Constructed before the loop so a bad key is one clear sentence rather than
  // the same sentence seven times.
  let llm: LlmClient;
  try {
    llm = recordingClient(createLlmClient(), { trigger: 'ui_action' });
  } catch (err) {
    fail(`${(err as Error).message} Nothing was generated.`);
    return;
  }

  const failures: string[] = [];

  for (const platform of platforms) {
    try {
      const result = await generateProfileCopy(
        {
          platform,
          persona,
          productName: product!.name,
          productTagline: product!.tagline,
          productBrief: brief!,
          voice: {
            displayName: voice!.display_name,
            description: voice!.description ?? '',
            doRules: voice!.do_rules ?? [],
            dontRules: voice!.dont_rules ?? [],
          },
          linkInBioUrl: bioLink,
          handle: handleFor.get(platform) ?? null,
          otherHandles: [...handleFor.entries()]
            .filter(([p, h]) => p !== platform && h !== handleFor.get(platform))
            .map(([p, h]) => ({ platform: p, handle: h })),
          forbiddenClaims: product!.content_rules?.forbidden_claims ?? [],
        },
        llm,
      );

      await query(
        `insert into setup_kit_entries
           (product_id, platform, persona, bios, display_names, pinned_post, notes, prompt_version, generated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8, now())
         on conflict (product_id, platform, persona) do update
            set bios = excluded.bios,
                display_names = excluded.display_names,
                pinned_post = excluded.pinned_post,
                notes = excluded.notes,
                prompt_version = excluded.prompt_version,
                generated_at = now(),
                chosen_bio = null,
                chosen_name = null`,
        [
          productId,
          platform,
          persona,
          JSON.stringify(result.bios),
          JSON.stringify(result.displayNames),
          result.pinnedPost,
          JSON.stringify(result.notes),
          result.promptVersion,
        ],
      );
    } catch (err) {
      failures.push(`${platform}: ${(err as Error).message}`);
    }
  }

  revalidatePath('/setup-kit');
  if (failures.length > 0) {
    fail(
      `${platforms.length - failures.length} of ${platforms.length} generated. Failed: ${failures.join('; ')}`,
    );
  }
}

/** Record which variant went on the real profile. */
export async function chooseVariant(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('product') ?? '');
  const platform = String(formData.get('platform') ?? '');
  const persona = String(formData.get('persona') ?? 'brand');
  const field = String(formData.get('field') ?? '');
  const index = Number(formData.get('index') ?? -1);

  if (!['chosen_bio', 'chosen_name'].includes(field)) return;
  if (!Number.isInteger(index) || index < 0) return;

  await query(
    `update setup_kit_entries set ${field === 'chosen_bio' ? 'chosen_bio' : 'chosen_name'} = $4
      where product_id = $1 and platform = $2 and persona = $3`,
    [productId, platform, persona, index],
  );

  revalidatePath('/setup-kit');
}

/**
 * Check a handle on every platform.
 *
 * Live rather than cached, because the answer changes and a stale "available" is
 * the expensive kind of wrong. The result is stored only so the page can say
 * when it was checked.
 */
export async function checkHandles(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('product') ?? '');
  const handle = String(formData.get('handle') ?? '').trim().replace(/^@/, '');

  if (!handle) fail('Type a handle to check.');

  const checks = await Promise.all(
    CREATION_ORDER.map((platform) => checkHandle(platform, handle)),
  );

  for (const check of checks) {
    await query(
      `insert into desired_handles (product_id, platform, handle, last_status, last_detail, last_method, checked_at)
       values ($1,$2,$3,$4,$5,$6, now())
       on conflict (product_id, platform) do update
          set handle = excluded.handle,
              last_status = excluded.last_status,
              last_detail = excluded.last_detail,
              last_method = excluded.last_method,
              checked_at = now()`,
      [productId, check.platform, check.handle, check.status, check.detail, check.method],
    );
  }

  revalidatePath('/setup-kit');
}

