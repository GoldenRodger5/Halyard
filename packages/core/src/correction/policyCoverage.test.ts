/**
 * §165. Every rule a gate can raise has a correction policy.
 *
 * The same technique `handlerCoverage.test.ts` uses on `JOB_KINDS`: read the
 * real source, enumerate what it can emit, and fail if the table has drifted.
 *
 * The failure this prevents is quiet. A rule added to a gate with no policy
 * entry falls through to the unknown-rule default, which escalates — so the
 * loop would stop on a defect it could have fixed, and the only symptom is an
 * operator being asked to look at something Halyard should have handled. The
 * opposite drift is worse: a namespace default that happens to match gives the
 * *wrong* correction confidently.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { policyFor } from './policy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const QC_DIR = path.join(here, '..', 'qc');
const PROOF = path.join(here, '..', 'proof', 'testimonials.ts');

/**
 * §214. The copy budget lives outside `qc/`, and the scan below did not see it.
 *
 * `checkCopyBudget` raises `budget.*` rules that reach the copy gate through
 * `slopFilter`, and this test enumerates the *gate directory* — so four new
 * rules were live, unmapped, and silently falling through to escalate. Exactly
 * the drift this file exists to prevent, missed because a rule moved house.
 *
 * Scanned by path rather than by directory for the same reason `PROOF` is.
 */
const COPY_BUDGET = path.join(here, '..', 'copy', 'budget.ts');

/** Every `rule: '...'` literal in the gate sources. */
function declaredRules(): string[] {
  const files = [
    ...readdirSync(QC_DIR)
      .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
      .map((f) => path.join(QC_DIR, f)),
    PROOF, COPY_BUDGET,
  ];

  const rules = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/rule: '([a-z0-9_.-]+)'/g)) {
      rules.add(match[1]!);
    }
  }
  return [...rules].sort();
}

describe('the correction policy', () => {
  it('finds the gate rules at all, so this test cannot pass vacuously', () => {
    /*
     * The guard on the guard. If the source layout moves and the matcher finds
     * nothing, every assertion below passes over an empty list — which is the
     * failure shape §143 and §70 both took: a check that examined nothing and
     * reported success.
     */
    const rules = declaredRules();
    expect(rules.length).toBeGreaterThan(40);
    expect(rules).toContain('audio.pacing');
    expect(rules).toContain('retention.no_pattern_interrupt');
  });

  it('covers every rule the gates can raise', () => {
    const uncovered = declaredRules().filter((rule) => {
      const entry = policyFor(rule, 'copy');
      return entry.rootCause.startsWith('No correction policy covers');
    });
    expect(uncovered, `rules with no policy entry: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('never leaves a rule on a namespace fallback that does not fit it', () => {
    /*
     * §234. Coverage in the letter and a wrong answer in substance.
     *
     * A namespace policy is the right answer when the whole namespace really
     * does take one correction — every `punctuation.*` finding is fixed by
     * revising the copy, and eighty-odd rules legitimately sit on one.
     *
     * It is the wrong answer when the namespace is *heterogeneous*. Nine rules
     * added with the creative acceptance suite were all "covered" by the
     * `creative` fallback, which routes to `resequence_scenes` — a correction
     * that cannot add alt text, cannot change a font and cannot remix audio.
     * The coverage assertion passed the entire time.
     *
     * So: once any rule in a namespace has been given its own entry, that is
     * evidence the namespace is not uniform, and every other rule in it has to
     * be decided rather than inherited.
     */
    const byNamespace = new Map<string, string[]>();
    for (const rule of declaredRules()) {
      const ns = rule.split('.')[0] ?? '';
      byNamespace.set(ns, [...(byNamespace.get(ns) ?? []), rule]);
    }

    /*
     * Rules deliberately left on their namespace's policy, because the
     * namespace really does take one correction for them.
     *
     * The list is the record that somebody looked. It is asserted to be
     * *exact*, so a rule added to one of these namespaces tomorrow fails this
     * test until it is either decided or added here on purpose.
     */
    const DELIBERATELY_INHERITED = new Set([
      /* All three are a link pointing at the wrong place. */
      'destination.app_store_mismatch',
      'destination.bare_homepage',
      'destination.default_board',
      /* Both are unverifiable evidence, which a machine must not "fix". */
      'proof.empty',
      'proof.not_verbatim',
      /* Genuinely a plan defect: what is said and what is shown do not line up. */
      'coherence.brandmark_only_open',
      'coherence.narration_shows_nothing',
      'coherence.no_text_in_hook',
      'coherence.nothing_claimed_is_shown',
      'coherence.partly_shown',
      'coherence.silent_open_says_nothing',
      'coherence.static_open',
      'creative.no_payoff',
      'creative.single_role',
      'creative.unused_product_footage',
      'visual.carousel_consistency',
    ]);

    const offenders: string[] = [];
    for (const [namespace, rules] of byNamespace) {
      const generic = policyFor(`${namespace}.a_rule_nobody_wrote`, 'copy');
      if (generic.rootCause.startsWith('No correction policy covers')) continue;

      const onFallback = rules.filter((r) => {
        if (DELIBERATELY_INHERITED.has(r)) return false;
        const e = policyFor(r, 'copy');
        return e.rootCause === generic.rootCause && e.action === generic.action;
      });
      const specific = rules.length - onFallback.length;
      /* A namespace where somebody has already had to write a specific entry
         is a namespace that spans more than one kind of defect. */
      if (specific > 0 && onFallback.length > 0) {
        offenders.push(`${namespace}: ${onFallback.join(', ')}`);
      }
    }

    expect(
      offenders,
      `these namespaces mix specific and inherited policies, so the inherited ones were never decided:\n${offenders.join('\n')}`,
    ).toEqual([]);

    /* The allowlist has to stay honest too: an entry for a rule that no longer
       exists is a stale note that hides the next real one. */
    const known = new Set(declaredRules());
    const stale = [...DELIBERATELY_INHERITED].filter((r) => !known.has(r));
    expect(stale, `allowlisted rules that no longer exist: ${stale.join(', ')}`).toEqual([]);
  });

  it('gives an unknown rule the refusal, not a guess', () => {
    // The one case the coverage check cannot reach: a rule that arrives from a
    // provider response rather than from source.
    const entry = policyFor('something.nobody.wrote', 'visual');
    expect(entry.correctable).toBe(false);
    expect(entry.action).toBe('escalate');
  });

  it('never marks a defect correctable without giving it an action that changes something', () => {
    for (const rule of declaredRules()) {
      const entry = policyFor(rule, 'copy');
      if (!entry.correctable) continue;
      expect(entry.action, `${rule} is correctable but escalates`).not.toBe('escalate');
    }
  });

  it('routes the two audio failures to different corrections', () => {
    /*
     * The distinction that motivated a per-rule entry. Pacing is the script —
     * too many words for the runtime. Word-error is pronunciation. Sending both
     * to the same correction means one of them is always the wrong fix.
     */
    expect(policyFor('audio.pacing', 'audio').component).toBe('vo_script');
    expect(policyFor('audio.word_error_rate', 'audio').component).toBe('vo_script');
    expect(policyFor('audio.trailing_silence', 'audio').component).toBe('voiceover');
  });

  it('refuses to correct a defect that generation cannot fix', () => {
    // Consent cannot be written into existence, and neither can a source row.
    for (const rule of ['proof.no_consent', 'proof.no_source']) {
      expect(policyFor(rule, 'proof').correctable, rule).toBe(false);
    }
  });

  it('treats an unrun measurement as a measurement problem, not a content problem', () => {
    /*
     * `audio.not_measured` means nothing was established about the artifact.
     * Rewriting the post in response would be correcting something that was
     * never shown to be wrong.
     */
    for (const rule of ['audio.not_measured', 'coherence.not_measured']) {
      const entry = policyFor(rule, 'audio');
      expect(entry.component, rule).toBe('measurement');
      expect(entry.action, rule).toBe('remeasure');
    }
  });
});
