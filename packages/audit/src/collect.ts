/**
 * Collecting the non-source facts the Auditor needs.
 *
 * The scanner reads TypeScript. These read the other three sources of truth:
 * the job graph, the gate signatures, and — where a connection is available —
 * the database.
 *
 * Kept separate from `rules.ts` on purpose: the rules are pure and trivially
 * testable, while collection touches the filesystem and Postgres. Mixing them
 * would make the rules untestable without a database, and rules that are hard
 * to test do not get tested.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FactBase } from './scanner.js';
import { FACT_CATEGORIES, REACHABLE_CATEGORIES } from '@halyard/core';
import type {
  BrainCategoryFact,
  FeatureFact,
  GateFact,
  JobFacts,
  RuntimeEvidence,
} from './rules.js';

/**
 * The job graph, read from source rather than from a list somebody maintains.
 *
 * `JOB_KINDS`, the handler map and `SCHEDULES` are three separate declarations
 * that must agree. Parsing all three is the only way to notice when they stop
 * agreeing — which has already happened once, when new kinds were added to the
 * TypeScript union and not to the database's check constraint.
 */
export function collectJobFacts(repoRoot: string): JobFacts {
  const read = (rel: string): string => {
    try {
      return readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      return '';
    }
  };

  const dbIndex = read('packages/db/src/index.ts');
  const handlers = read('apps/worker/src/handlers/index.ts');
  const scheduler = read('apps/worker/src/scheduler.ts');
  const coverage = read('apps/worker/src/handlerCoverage.test.ts');

  const kindsBlock = dbIndex.match(/export const JOB_KINDS = \[([\s\S]*?)\] as const;/);
  const declaredKinds = kindsBlock
    ? [...kindsBlock[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    : [];

  /**
   * The handler map, matched on its declaration rather than on its type.
   *
   * The first version keyed off `Record<JobKind, JobHandler>` and the real
   * declaration is `Partial<Record<JobKind, JobHandler>>`, so it matched
   * nothing and reported all fourteen handled kinds as unhandled — a parser
   * failure that looked exactly like a catastrophic finding.
   */
  const handlerBlock = handlers.match(/export const HANDLERS[^=]*=\s*\{([\s\S]*?)\n\};/);
  const handledKinds = handlerBlock
    ? [...handlerBlock[1]!.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]!)
    : [];

  const scheduledKinds = [...scheduler.matchAll(/kind:\s*'([a-z_]+)'/g)].map((m) => m[1]!);

  /**
   * The exemption list, read from the coverage test rather than duplicated.
   *
   * That test already records which kinds are knowingly unhandled and why. A
   * second copy here would be a second thing to keep in sync, and the whole
   * point of this file is that unsynced copies are the bug.
   */
  const exemptBlock = coverage.match(/knowinglyUnhandled: Record<string, string> = \{([\s\S]*?)\n\s*\};/);
  const knowinglyUnhandled: Record<string, string> = {};
  if (exemptBlock) {
    for (const match of exemptBlock[1]!.matchAll(/([a-z_]+):\s*'((?:[^'\\]|\\.)*)'/g)) {
      knowinglyUnhandled[match[1]!] = match[2]!;
    }
  }

  return { declaredKinds, handledKinds, scheduledKinds, knowinglyUnhandled };
}

/**
 * Gates with optional inputs, and whether anything supplies them.
 *
 * The declaration is here rather than inferred because "which parameters are
 * optional inputs that matter" is a judgement — `timeoutMs` is optional and
 * uninteresting, `audio` is optional and load-bearing. What is *not* a
 * judgement, and so is computed, is whether a caller passes it.
 */
const GATE_SPECS: Array<{ name: string; fn: string; optionalInputs: string[] }> = [
  /*
   * `visual` and `audio` left this list in §119, when they stopped being inputs
   * at all — `runAllGates` runs at copy time and no caller could ever supply
   * them. Keeping them here after the removal would report a permanent
   * false positive, which is the failure mode §108 and §118 are both about.
   *
   * `destination` and `proof` are listed because they *are* supplied, so the
   * rule stays capable of firing if a refactor ever drops one.
   */
  {
    name: 'runAllGates',
    fn: 'runAllGates',
    optionalInputs: ['claims', 'destination', 'proof'],
  },
  { name: 'coherence', fn: 'runCoherenceQC', optionalInputs: ['audio'] },
];

export function collectGateFacts(facts: FactBase): GateFact[] {
  return GATE_SPECS.map((spec) => {
    /**
     * Which optional inputs a real caller passes.
     *
     * Read from the raw call text rather than the AST because the question is
     * "does the object literal at this call site mention this key", and the
     * scanner does not retain literal shapes. Restricted to non-test callers:
     * a test supplying `audio` proves the gate can be exercised, not that
     * anything in production does.
     */
    const callers = facts.calls.filter((c) => c.callee === spec.fn && !c.isTest);
    const supplied = new Set<string>();

    for (const caller of callers) {
      const text = callSiteText(caller.file, caller.line);
      for (const input of spec.optionalInputs) {
        if (new RegExp(`\\b${input}\\s*[:,}]`).test(text)) supplied.add(input);
      }
    }

    return { name: spec.name, optionalInputs: spec.optionalInputs, suppliedInputs: [...supplied] };
  });
}

/** Cache of file contents, so a file with ten call sites is read once. */
const fileCache = new Map<string, string[]>();
let cacheRoot = '';

export function primeFileCache(repoRoot: string): void {
  if (cacheRoot !== repoRoot) {
    fileCache.clear();
    cacheRoot = repoRoot;
  }
}

/** A window of source around a call, enough to see its argument object. */
function callSiteText(file: string, line: number): string {
  let lines = fileCache.get(file);
  if (!lines) {
    try {
      lines = readFileSync(path.join(cacheRoot, file), 'utf8').split('\n');
    } catch {
      lines = [];
    }
    fileCache.set(file, lines);
  }
  return lines.slice(Math.max(0, line - 1), line + 14).join('\n');
}

export interface DbQuery {
  <T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Runtime evidence from execution records.
 *
 * "Recent" is the last 30 days: long enough that a weekly job counts as
 * exercised, short enough that an agent removed from the pipeline a quarter ago
 * stops looking alive.
 */
export async function collectRuntimeEvidence(query: DbQuery): Promise<RuntimeEvidence> {
  const rows = await query<{
    agent_id: string;
    agent_version: string;
    total: string;
    failures: string;
    consumed: string;
  }>(
    `select agent_id,
            agent_version,
            count(*) as total,
            count(*) filter (where status in ('failed','refused')) as failures,
            count(*) filter (where downstream_consumed_at is not null) as consumed
       from agent_runs
      where started_at > now() - interval '30 days'
      group by agent_id, agent_version`,
  );

  const evidence: RuntimeEvidence = {
    runCounts: new Map(),
    recentFailures: new Map(),
    consumedCounts: new Map(),
    versionsSeen: new Map(),
  };

  for (const row of rows) {
    const id = row.agent_id;
    evidence.runCounts.set(id, (evidence.runCounts.get(id) ?? 0) + Number(row.total));
    evidence.recentFailures.set(id, (evidence.recentFailures.get(id) ?? 0) + Number(row.failures));
    evidence.consumedCounts.set(id, (evidence.consumedCounts.get(id) ?? 0) + Number(row.consumed));

    const versions = evidence.versionsSeen.get(id) ?? new Set<string>();
    versions.add(row.agent_version);
    evidence.versionsSeen.set(id, versions);
  }

  return evidence;
}

/**
 * Templates marked enabled, and whether any code path can render them.
 *
 * This is the check that would have caught four Remotion templates sitting
 * `enabled` in the database for months while `generate.ts` only ever created
 * `satori` render rows. Reachability is decided by whether the renderer name
 * appears in a non-test insert into `renders`.
 */
export async function collectFeatureFacts(
  query: DbQuery,
  facts: FactBase,
): Promise<FeatureFact[]> {
  let templates: Array<{ id: string; renderer: string; enabled: boolean }>;
  try {
    templates = await query<{ id: string; renderer: string; enabled: boolean }>(
      'select id, renderer, enabled from templates',
    );
  } catch {
    // No templates table reachable — return nothing rather than reporting every
    // template as unreachable, which would be a database error dressed as a
    // catastrophic finding.
    return [];
  }

  /** Renderers that appear in a non-test `insert into renders`. */
  const producible = new Set<string>();
  for (const str of facts.strings) {
    if (str.isTest) continue;
    if (!str.value.includes('insert into renders')) continue;
    for (const match of str.value.matchAll(/'(satori|remotion|playwright)'/g)) {
      producible.add(match[1]!);
    }
  }
  return templates.map((t) => ({
    id: t.id,
    kind: `template:${t.renderer}`,
    enabled: t.enabled,
    reachable: producible.has(t.renderer),
    why: producible.has(t.renderer)
      ? ''
      : `No non-test code path inserts a '${t.renderer}' render, so nothing can produce it.`,
  }));
}

/**
 * The Brain's fact categories, and whether an agent can fill each.
 *
 * `REACHABLE_CATEGORIES` is built by spreading the four per-agent category
 * arrays, so it cannot drift from what the agents actually declare — the
 * comparison is therefore between what the **UI offers** (`FACT_CATEGORIES`,
 * which `/brain/[category]` will render a page for) and what the **agents can
 * produce**. Two independent lists, which is what makes this a real check
 * rather than a constant compared with itself.
 *
 * The fact count needs the database, so it is zero on a static run. That
 * understates one variant of the finding and never invents one: a category with
 * no producer is unreachable whether or not anything is stored in it.
 */
export async function collectBrainCategoryFacts(
  query: DbQuery | null,
): Promise<BrainCategoryFact[]> {
  let counts = new Map<string, number>();
  if (query) {
    try {
      const rows = await query<{ category: string; n: string }>(
        'select category, count(*) as n from product_facts group by category',
      );
      counts = new Map(rows.map((r) => [r.category, Number(r.n)]));
    } catch {
      // No table reachable. Reporting every category as holding zero facts is
      // accurate about reachability, which is what the rule turns on.
      counts = new Map();
    }
  }

  return FACT_CATEGORIES.map((category) => ({
    category,
    reachable: REACHABLE_CATEGORIES.has(category),
    factCount: counts.get(category) ?? 0,
  }));
}
