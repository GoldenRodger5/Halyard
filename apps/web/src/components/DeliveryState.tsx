/**
 * What the platform is holding, in words an operator can act on.
 *
 * §156. Three outcomes get called "draft" in conversation and they need three
 * different sentences, because they ask the operator for three different
 * things:
 *
 * - a **native draft** is waiting for them inside the platform's own app, and
 *   Halyard cannot finish it;
 * - a **private upload** is real content on the platform that Halyard can still
 *   publish, so there is nothing for them to do there;
 * - **nothing delivered** means the post exists only here, which is the normal
 *   state for most platforms and is not a failure.
 *
 * Calling the second one a draft is the specific mistake this component exists
 * to prevent: it sends someone to YouTube Studio to finish something that needs
 * no finishing, and hides that Halyard could have published it.
 */
import { Badge } from '@halyard/ui';

export interface DeliveryFields {
  platform: string;
  status: string;
  delivery_mode: 'direct' | 'draft' | 'private' | null;
  delivery_external_id: string | null;
  delivery_permalink: string | null;
  delivery_manual_url: string | null;
}

type Tone = 'good' | 'info' | 'warn' | 'neutral';

export interface DeliveryReading {
  label: string;
  tone: Tone;
  detail: string;
  /** True only for a native draft: the person must finish it in the platform. */
  creatorActionRequired: boolean;
  externalId: string | null;
  /** Where to go, when there is anywhere to go. */
  href: string | null;
  hrefLabel: string | null;
}

/**
 * Pure, so the wording is testable without rendering anything.
 *
 * Reads the *delivery* record rather than the item status: `published` and
 * `awaiting_manual_publish` are Halyard's own lifecycle, and neither says which
 * of the three things above happened at the platform.
 */
export function readDelivery(item: DeliveryFields): DeliveryReading {
  if (item.delivery_mode === 'draft') {
    return {
      label: 'Native draft',
      tone: 'warn',
      detail:
        `Uploaded to ${item.platform} as a draft. It is waiting in the account's own app, ` +
        'and only a person can finish and post it there — Halyard cannot.',
      creatorActionRequired: true,
      externalId: item.delivery_external_id,
      href: item.delivery_manual_url ?? item.delivery_permalink,
      hrefLabel: `Open ${item.platform} to finish`,
    };
  }

  if (item.delivery_mode === 'private') {
    return {
      label: 'Uploaded privately',
      tone: 'info',
      detail:
        `On ${item.platform} and not public. This is real content the account owns, not a draft, ` +
        'and nothing needs finishing by hand.',
      creatorActionRequired: false,
      externalId: item.delivery_external_id,
      href: item.delivery_permalink ?? item.delivery_manual_url,
      hrefLabel: 'View it',
    };
  }

  if (item.delivery_mode === 'direct') {
    return {
      label: 'Published',
      tone: 'good',
      detail: `Live on ${item.platform}.`,
      creatorActionRequired: false,
      externalId: item.delivery_external_id,
      href: item.delivery_permalink,
      hrefLabel: 'View the post',
    };
  }

  return {
    label: 'Held in Halyard',
    tone: 'neutral',
    detail:
      `Nothing has been sent to ${item.platform}. It will go out through the normal publishing ` +
      'path once a person approves it.',
    creatorActionRequired: false,
    externalId: null,
    href: null,
    hrefLabel: null,
  };
}

/** The compact form, for a queue card. */
export function DeliveryBadge({ item }: { item: DeliveryFields }): React.ReactElement | null {
  const reading = readDelivery(item);
  if (item.delivery_mode === null) return null;
  return (
    <Badge tone={reading.tone}>
      {reading.label}
      {reading.creatorActionRequired ? ' · needs you in-app' : ''}
    </Badge>
  );
}
