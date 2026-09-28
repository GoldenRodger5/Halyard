/**
 * Product-Brain → discovery terms.
 *
 * A connected product should not need a person to seed the trend engine.
 * Verified Brain facts already contain stable semantic slots; derive a small
 * set of search topics from those slots without paying a model to paraphrase
 * them.
 */

export interface DiscoveryFact {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence?: number | null;
}

export interface DiscoveryTerm {
  term: string;
  factIds: string[];
  category: string;
  priority: number;
}

const CATEGORY_PRIORITY: Record<string, number> = {
  content_pillars: 100,
  jobs_to_be_done: 90,
  personas: 80,
  workflows: 70,
  users: 60,
  differentiators: 50,
  app_store_positioning: 40,
};

const GENERIC_KEYS = new Set([
  'primary_audience',
  'secondary_audience',
  'tertiary_audience',
  'positioning',
  'summary',
  'overview',
]);

const STOP = new Set([
  'a','an','and','are','for','from','in','into','is','of','on','or','the','to','who','with',
  'people','cooks','users','someone','something','existing','selected','several','one',
]);

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fromValue(value: string): string {
  const words = clean(value)
    .split(' ')
    .filter((word) => word.length > 2 && !STOP.has(word));
  return words.slice(0, 6).join(' ');
}

function termForFact(fact: DiscoveryFact): string | null {
  const key = clean(fact.key);
  if (!GENERIC_KEYS.has(key.replace(/\s+/g, '_'))) {
    const words = key.split(' ').filter((word) => word.length > 2 && !STOP.has(word));
    if (words.length >= 2 && words.length <= 6) return words.join(' ');
  }

  const value = fromValue(fact.value);
  return value.split(' ').length >= 2 ? value : null;
}

export function deriveDiscoveryTerms(
  facts: readonly DiscoveryFact[],
  maxTerms = 8,
): DiscoveryTerm[] {
  const byTerm = new Map<string, DiscoveryTerm>();

  for (const fact of facts) {
    const basePriority = CATEGORY_PRIORITY[fact.category];
    if (basePriority === undefined) continue;

    const term = termForFact(fact);
    if (!term || term.length < 5 || term.length > 80) continue;

    const confidence = Math.max(0, Math.min(1, fact.confidence ?? 0));
    const priority = basePriority + Math.round(confidence * 10);
    const existing = byTerm.get(term);

    if (existing) {
      if (!existing.factIds.includes(fact.id)) existing.factIds.push(fact.id);
      existing.priority = Math.max(existing.priority, priority);
      continue;
    }

    byTerm.set(term, {
      term,
      factIds: [fact.id],
      category: fact.category,
      priority,
    });
  }

  return [...byTerm.values()]
    .sort((a, b) => b.priority - a.priority || a.term.localeCompare(b.term))
    .slice(0, Math.max(0, maxTerms));
}
