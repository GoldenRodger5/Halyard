'use server';

import { revalidatePath } from 'next/cache';
import {
  resolveDestination,
  type DestinationType,
  type ProductDestinations,
} from '@halyard/core';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

const TYPES: DestinationType[] = ['share_link', 'app_store', 'web', 'link_in_bio'];

/**
 * Override where a post sends people. Milestone 42.
 *
 * The resolved destination is shown before approval precisely so it can be
 * changed here. An explicit choice always beats the resolver, and the reason
 * records that a human made it.
 */
export async function setDestination(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const type = String(formData.get('destinationType')) as DestinationType;
  const url = String(formData.get('destinationUrl') ?? '').trim();

  if (!TYPES.includes(type)) return;

  const item = await one<{
    id: string;
    category: string;
    product_artifact: unknown;
    destinations: ProductDestinations;
  }>(
    `select ci.id, ci.category, ci.product_artifact, p.destinations
       from content_items ci join products p on p.id = ci.product_id
      where ci.id = $1`,
    [id],
  );
  if (!item) return;

  const resolved = resolveDestination({
    category: item.category,
    destinations: item.destinations ?? {},
    artifact: { raw: item.product_artifact },
    override: type,
    overrideUrl: url || null,
  });

  await query(
    `update content_items
        set destination_type = $2, destination_url = $3, destination_reason = $4
      where id = $1`,
    [id, resolved.type, resolved.url, resolved.reason],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'destination_override', 'content_item', $1, $2)`,
    [id, { type: resolved.type, url: resolved.url }],
  );

  revalidatePath(`/gallery/${id}`);
}

/** Recompute from the artifact, discarding an override. */
export async function resetDestination(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  const item = await one<{
    category: string;
    product_artifact: unknown;
    destinations: ProductDestinations;
  }>(
    `select ci.category, ci.product_artifact, p.destinations
       from content_items ci join products p on p.id = ci.product_id
      where ci.id = $1`,
    [id],
  );
  if (!item) return;

  const resolved = resolveDestination({
    category: item.category,
    destinations: item.destinations ?? {},
    artifact: { raw: item.product_artifact },
  });

  await query(
    `update content_items
        set destination_type = $2, destination_url = $3, destination_reason = $4
      where id = $1`,
    [
      id,
      resolved.type,
      resolved.url,
      resolved.blockedBy ? `${resolved.reason} ${resolved.blockedBy}` : resolved.reason,
    ],
  );

  revalidatePath(`/gallery/${id}`);
}

/*
 * `shareTokenFor` was removed on 2026-08-20.
 *
 * It existed "so the detail screen can say whether a share link is even
 * possible", and the detail screen calls `extractShareToken` directly instead —
 * it is a server component and needs no round trip for a pure function.
 *
 * Every export from a `'use server'` file is a callable POST endpoint. This one
 * was an unused one, so removing it removes a surface rather than a capability.
 */
