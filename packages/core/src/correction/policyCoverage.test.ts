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
