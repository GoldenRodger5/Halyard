/**
 * Turning proposals into rows.
 *
 * Several agents read overlapping evidence, so the same fact arrives more than
 * once — and that repetition is the entire signal. This is where it is counted.
 *
 * ## Why corroboration is counted here and not per agent
 *
 * If each agent's proposals were written independently, two agents reading the
 * *same page* would look like two sources agreeing, and a fact would reach
 * `verified` on one observation seen twice. Grouping by slot first, then
 * counting **distinct evidence sources** behind the group, is what makes
 * verification mean "two places said so" rather than "two readers read it".
 */
import {
  computeConfidence,
  deriveFactStatus,
  independentSources,
  sameValue,
  type EvidenceRef,
  type FactCategory,
  type FactStatus,
  type ProposedFact,
} from './model.js';

export interface AttributedProposal extends ProposedFact {
  agentId: string;
  agentVersion: string;
  promptVersion: string | null;
  /** The evidence rows this agent was shown when it proposed this. */
  evidenceIds: string[];
}

export interface FactWrite {
  category: FactCategory;
  key: string;
  value: string;
  detail: string | null;
  status: FactStatus;
  confidence: number;
  evidenceIds: string[];
  agentId: string;
  agentVersion: string;
  promptVersion: string | null;
  /** Set when the group agreed; null when a fact rests on one observation. */
  lastVerifiedAt: Date | null;
  /** Distinct sources behind this fact, for the UI. Not stored. */
  sourceCount: number;
}

/**
 * What should be written, given everything proposed this run.
 *
 * Note the signature once more: proposals carry no status and there is no
 * parameter through which one could arrive. Status and confidence are computed
 * from `evidenceById` — the observed rows — and nothing else.
 */
export function planFactWrites(input: {
  proposals: AttributedProposal[];
  evidenceById: Map<string, EvidenceRef>;
  now?: Date;
}): FactWrite[] {
  const now = input.now ?? new Date();

  /** Slot → the proposals landing in it. */
  const bySlot = new Map<string, AttributedProposal[]>();
  for (const proposal of input.proposals) {
    const slot = `${proposal.category}:${proposal.key}`;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), proposal]);
  }

  const writes: FactWrite[] = [];

  for (const group of bySlot.values()) {
    /**
     * Proposals in one slot that say the same thing corroborate; ones that say
     * different things are separate candidate facts, and the contradiction pass
     * will find them. Merging them here would hide the disagreement.
     */
    const variants: AttributedProposal[][] = [];
    for (const proposal of group) {
      const existing = variants.find((v) => sameValue(v[0]!.value, proposal.value));
      if (existing) existing.push(proposal);
      else variants.push([proposal]);
    }

    for (const variant of variants) {
      // Distinct evidence rows behind every proposal of this value, resolved to
      // sources. A row cited by two agents is one source, not two.
      const evidenceIds = [...new Set(variant.flatMap((p) => p.evidenceIds))];
      const evidence = evidenceIds
        .map((id) => input.evidenceById.get(id))
        .filter((e): e is EvidenceRef => e !== undefined);

      const category = variant[0]!.category;
      const status = deriveFactStatus({ category, evidence });
      const confidence = computeConfidence({ category, evidence, now });

      // The winner of a tie is the first proposer, which is stable because the
      // agents run in a fixed order. Attribution names who to ask, so an
      // arbitrary-but-stable answer is better than a clever one.
      const primary = variant[0]!;

      writes.push({
        category,
        key: primary.key,
        value: primary.value,
        detail: primary.detail ?? null,
        status,
        confidence,
        evidenceIds,
        agentId: primary.agentId,
        agentVersion: primary.agentVersion,
        promptVersion: primary.promptVersion,
        /**
         * Only a verified fact carries a verification time.
         *
         * Stamping `now` on an unverified fact would make it look freshly
         * checked, and `isStale` would then report it healthy for a fortnight
         * on the strength of never having been confirmed.
         */
        lastVerifiedAt: status === 'verified' ? now : null,
        sourceCount: independentSources(evidence),
      });
    }
  }

  return writes;
}
