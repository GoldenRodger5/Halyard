/**
 * §165. The self-correction controller, driven by deliberately bad artifacts.
 *
 * Every case here is a defect the loop has to handle correctly, and most of
 * them are cases where the *obvious* behaviour is wrong: repeating a correction
 * that did not work, accepting a fix that broke something else, rewriting a
 * post because a measurement failed to run, or preferring the last iteration
 * because it is the last one.
 */
import { describe, expect, it } from 'vitest';
import type { GateName, GateResult } from '../qc/index.js';
import { defectsFrom } from './defects.js';
import { policyFor } from './policy.js';
import { assertScope } from './policy.js';
import { gatesInvalidatedBy, invalidateGates, rebuildFrom } from './invalidation.js';
import { regressionsBetween, type IterationSnapshot } from './regression.js';
import { acceptCorrection, bestIteration, decide, type IterationRecord } from './controller.js';

const REQUIRES: GateName[] = ['copy', 'audio', 'visual', 'coherence'];

function gate(name: GateName, status: GateResult['status'], findings: unknown[] = []): GateResult {
  return {
    gate: name,
    status,
    summary: `${name} ${status}`,
    detail: findings.length > 0 ? { findings } : { findings: [] },
  };
}

const passing = (): GateResult[] => REQUIRES.map((g) => gate(g, 'passed'));

function snapshot(over: Partial<IterationSnapshot> = {}): IterationSnapshot {
  return {
    gates: passing(),
    evidencePaths: ['steps[0].updated_note'],
    hasCaptions: true,
    hasAudio: true,
    beatCount: 5,
    ...over,
  };
}

function record(over: Partial<IterationRecord> = {}): IterationRecord {
  return {
    iteration: 0,
    gates: passing(),
    defects: [],
    changed: [],
    action: null,
    costUsd: 0,
    snapshot: snapshot(),
    ...over,
  };
}

// ── Detection ─────────────────────────────────────────────────────────────

describe('detection', () => {
  it('turns a failing gate into a structured defect with a root cause', () => {
    const gates = [
      gate('audio', 'failed', [
        { rule: 'audio.pacing', severity: 'error', message: '195 words per minute, outside 140–175.' },
      ]),
    ];
    const [defect] = defectsFrom(gates, policyFor);
    expect(defect!.rule).toBe('audio.pacing');
    expect(defect!.component).toBe('vo_script');
    expect(defect!.observation).toContain('195 words per minute');
    expect(defect!.correctable).toBe(true);
  });

  it('does not call an unrequired skipped gate a defect', () => {
    /*
     * Found in the rendered operator view, not in the database. `skipped` means
     * two things: a *required* gate that never ran is the "never verified is not
     * passed" problem, and an *unrequired* one is a check with nothing to look
     * at — a destination gate on a post with no link. Recording the second as a
     * defect put `destination.unspecified — no link` on every version of a real
     * item's history, in the one screen that exists to explain what went wrong.
     */
    const gates = [gate('destination', 'skipped'), gate('proof', 'skipped')];
    expect(defectsFrom(gates, policyFor, REQUIRES)).toEqual([]);
    // …but a required gate that never ran is still a defect.
    expect(defectsFrom([gate('visual', 'skipped')], policyFor, REQUIRES)).toHaveLength(1);
  });

  it('produces a defect for a gate that failed without naming a rule', () => {
    /*
     * Otherwise the controller sees `passed: false` with nothing to correct and
     * stalls — which looks like progress and is not.
     */
    const [defect] = defectsFrom([gate('visual', 'failed')], policyFor);
    expect(defect).toBeDefined();
    expect(defect!.action).toBe('remeasure');
  });

  it('keeps warnings, because a new warning is how a regression shows up', () => {
    const found = defectsFrom(
      [gate('retention', 'warning', [{ rule: 'retention.slow_open', severity: 'warning', message: 'slow' }])],
      policyFor,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('warning');
  });

  it('says nothing about a gate that passed', () => {
    expect(defectsFrom(passing(), policyFor)).toEqual([]);
  });
});

// ── Correction choice ─────────────────────────────────────────────────────

describe('choosing a correction', () => {
  it('picks the smallest action that addresses the failure', () => {
    const decision = decide({
      requires: REQUIRES,
      history: [
        record({
          gates: [
            ...passing().filter((g) => g.gate !== 'visual'),
            gate('visual', 'failed', [
              { rule: 'visual.contrast', severity: 'error', message: 'captions fail AA' },
            ]),
          ],
        }),
      ],
    });
    expect(decision.kind).toBe('correct');
    if (decision.kind !== 'correct') return;
    expect(decision.action).toBe('adjust_caption_treatment');
    // Not a rewrite. The words are innocent.
    expect(decision.defects.every((d) => d.component !== 'copy')).toBe(true);
  });

  it('corrects one thing at a time, so the next verdict is interpretable', () => {
    /*
     * Two changes landing together make a worse result unattributable, and the
     * history stops being the explanation it exists to be.
     */
    const decision = decide({
      requires: REQUIRES,
      history: [
        record({
          gates: [
            gate('copy', 'failed', [{ rule: 'phrase.banned', severity: 'error', message: 'banned phrase' }]),
            gate('audio', 'failed', [{ rule: 'audio.pacing', severity: 'error', message: 'too fast' }]),
            gate('visual', 'passed'),
            gate('coherence', 'passed'),
          ],
        }),
      ],
    });
    expect(decision.kind).toBe('correct');
    if (decision.kind !== 'correct') return;
    // Cheapest first: copy before a re-synthesis.
    expect(decision.action).toBe('revise_copy');
    expect(new Set(decision.defects.map((d) => d.action)).size).toBe(1);
  });

  it('does not rewrite a post because a measurement failed to run', () => {
    const decision = decide({
      requires: REQUIRES,
      history: [
        record({
          gates: [
            ...passing().filter((g) => g.gate !== 'audio'),
            gate('audio', 'failed', [
              { rule: 'audio.not_measured', severity: 'error', message: 'no transcript' },
            ]),
          ],
        }),
      ],
    });
    expect(decision.kind).toBe('correct');
    if (decision.kind !== 'correct') return;
    expect(decision.action).toBe('remeasure');
    expect(decision.invalidates).toEqual([]);
  });
});

// ── Dependency-aware revalidation ─────────────────────────────────────────

describe('revalidation', () => {
  it('invalidates what a change can reach and nothing else', () => {
    expect(gatesInvalidatedBy(['link'])).toEqual(['destination']);
    expect(gatesInvalidatedBy(['caption_style']).sort()).toEqual(['coherence', 'retention', 'visual']);
  });

  it('follows a copy change everywhere copy is read', () => {
    /*
     * Claims are extracted from the body and the destination gate reads the
     * link out of it, so neither survives a rewrite. Pinning the whole set,
     * because the failure mode of getting this wrong is a *stale green* — a
     * verdict that describes words nothing has examined, which is §143 and
     * §157 both.
     */
    expect(gatesInvalidatedBy(['copy']).sort()).toEqual(['claims', 'copy', 'destination']);
  });

  it('follows a narration change through everything measured on the render', () => {
    /*
     * New speech means new timing, new caption cues and a new video, so every
     * gate measured on the rendered file goes with it. Keeping `visual` green
     * across a re-synthesis is how caption drift ships.
     */
    expect(gatesInvalidatedBy(['vo_script']).sort()).toEqual([
      'audio',
      'coherence',
      'retention',
      'visual',
    ]);
    expect(gatesInvalidatedBy(['voiceover']).sort()).toEqual([
      'audio',
      'coherence',
      'retention',
      'visual',
    ]);
  });

  it('lets new evidence reopen a claim without a word changing', () => {
    expect(gatesInvalidatedBy(['evidence']).sort()).toEqual(['claims', 'proof']);
  });

  it('keeps the audio verdict when a copy revision left the script alone', () => {
    /*
     * The economy that is safe to take, and only because invalidation is
     * computed from what was *actually written*. A copy revision that also
     * rewrote the narration lists `vo_script`, and then audio does go.
     */
    expect(gatesInvalidatedBy(['copy'])).not.toContain('audio');
    expect(gatesInvalidatedBy(['copy', 'vo_script'])).toContain('audio');
  });

  it('marks an invalidated gate unestablished rather than dropping or passing it', () => {
    const next = invalidateGates(passing(), ['visual']);
    const visual = next.find((g) => g.gate === 'visual')!;
    expect(visual.status).toBe('skipped');
    // Still present, so a required gate that never re-runs still blocks.
    expect(next).toHaveLength(passing().length);
  });

  it('re-enters the pipeline at the earliest stage that has to run again', () => {
    expect(rebuildFrom(['voiceover'])).toBe('tts');
    expect(rebuildFrom(['caption_style'])).toBe('render');
    expect(rebuildFrom(['link'])).toBe('none');
    // A change needing new speech also needs a new render; `tts` chains it.
    expect(rebuildFrom(['vo_script', 'creative_plan'])).toBe('tts');
  });
});

// ── Scope ─────────────────────────────────────────────────────────────────

describe('correction scope', () => {
  it('refuses a re-synthesis that touched the copy', () => {
    const verdict = assertScope('resynthesise_voiceover', ['voiceover', 'copy']);
    expect(verdict.ok).toBe(false);
  });

  it('refuses a caption fix that rewrote the words', () => {
    expect(assertScope('adjust_caption_treatment', ['copy']).ok).toBe(false);
  });

  it('allows each action its own declared components', () => {
    expect(assertScope('adjust_caption_treatment', ['caption_style']).ok).toBe(true);
    expect(assertScope('rewrite_vo_script', ['vo_script', 'voiceover']).ok).toBe(true);
    expect(assertScope('revise_copy', ['copy']).ok).toBe(true);
  });
});

// ── Regression protection ─────────────────────────────────────────────────

describe('regression protection', () => {
  it('catches a fix that broke a different gate', () => {
    const before = snapshot();
    const after = snapshot({
      gates: [...passing().filter((g) => g.gate !== 'audio'), gate('audio', 'failed')],
    });
    const found = regressionsBetween(before, after);
    expect(found.some((r) => r.kind === 'gate_newly_failing' && r.gate === 'audio')).toBe(true);
  });

  it('catches provenance quietly disappearing', () => {
    /*
     * The quietest regression there is: the post still reads well, the claims
     * gate still passes on whatever survived, and the link back to the artifact
     * is simply gone.
     */
    const found = regressionsBetween(snapshot(), snapshot({ evidencePaths: [] }));
    expect(found.some((r) => r.kind === 'evidence_lost')).toBe(true);
  });

  it('catches captions, audio and beats being lost', () => {
    expect(regressionsBetween(snapshot(), snapshot({ hasCaptions: false })).some((r) => r.kind === 'captions_lost')).toBe(true);
    expect(regressionsBetween(snapshot(), snapshot({ hasAudio: false })).some((r) => r.kind === 'audio_lost')).toBe(true);
    expect(regressionsBetween(snapshot(), snapshot({ beatCount: 2 })).some((r) => r.kind === 'creative_plan_lost')).toBe(true);
  });

  it('does not call a deliberately removed voiceover a regression', () => {
    /*
     * Found by running this for real. `resynthesise_voiceover` and
     * `rewrite_vo_script` both clear `vo_asset_id` so `tts` will produce a new
     * one — so between applying the correction and `tts` running, the item
     * genuinely has no audio. The snapshot reads that as `audio_lost`.
     *
     * The controller's answer is not to soften this check but to refuse to run
     * it on an unfinished rebuild, which is where the guard lives. This pins
     * that the check itself still *reports* the loss — so if the guard is ever
     * removed, the regression is still detected rather than silently accepted.
     */
    const found = regressionsBetween(snapshot(), snapshot({ hasAudio: false }));
    expect(found.some((r) => r.kind === 'audio_lost')).toBe(true);
  });

  it('does not call a deliberately invalidated gate a regression', () => {
    // Between applying a correction and re-measuring, `skipped` is the system
    // working. Once the rebuild has run it is not.
    const after = snapshot({ gates: invalidateGates(passing(), ['visual']) });
    const verdict = acceptCorrection(record(), record({ iteration: 1, snapshot: after }), ['visual']);
    expect(verdict.ok).toBe(true);

    const strict = acceptCorrection(record(), record({ iteration: 1, snapshot: after }), []);
    expect(strict.ok).toBe(false);
  });
});

// ── Stop conditions ───────────────────────────────────────────────────────

describe('stopping', () => {
  it('accepts as soon as every required gate passes', () => {
    const decision = decide({ requires: REQUIRES, history: [record()] });
    expect(decision.kind).toBe('accept');
  });

  it('treats a required gate that never ran as blocking, not as fine', () => {
    // A skipped gate is not a passed gate — the rule this codebase is built on.
    const decision = decide({
      requires: REQUIRES,
      history: [record({ gates: [...passing().filter((g) => g.gate !== 'visual'), gate('visual', 'skipped')] })],
    });
    expect(decision.kind).not.toBe('accept');
  });

  it('stops on a defect generation cannot fix', () => {
    const decision = decide({
      requires: [...REQUIRES, 'proof'],
      history: [
        record({
          gates: [
            ...passing(),
            gate('proof', 'failed', [
              { rule: 'proof.no_consent', severity: 'error', message: 'no consent recorded' },
            ]),
          ],
        }),
      ],
    });
    expect(decision.kind).toBe('escalate');
    if (decision.kind !== 'escalate') return;
    expect(decision.unresolved.join(' ')).toContain('consent');
  });

  it('stops after the third correction and keeps the best iteration', () => {
    const failing = [...passing().filter((g) => g.gate !== 'visual'), gate('visual', 'failed', [
      { rule: 'visual.contrast', severity: 'error', message: 'still failing' },
    ])];
    const history = [0, 1, 2, 3].map((i) =>
      record({ iteration: i, gates: failing, action: i === 0 ? null : 'adjust_caption_treatment' }),
    );
    const decision = decide({ requires: REQUIRES, history });
    expect(decision.kind).toBe('exhausted');
    if (decision.kind !== 'exhausted') return;
    expect(decision.reason).toContain('maximum');
    expect(decision.attempted.length).toBeGreaterThan(0);
  });

  it('stops on spend even when iterations remain', () => {
    const failing = [...passing().filter((g) => g.gate !== 'visual'), gate('visual', 'failed', [
      { rule: 'visual.contrast', severity: 'error', message: 'still failing' },
    ])];
    const decision = decide({
      requires: REQUIRES,
      maxSpendUsd: 0.5,
      history: [record({ gates: failing, costUsd: 0.4 }), record({ iteration: 1, gates: failing, costUsd: 0.3, action: 'adjust_caption_treatment' })],
    });
    expect(decision.kind).toBe('exhausted');
    if (decision.kind !== 'exhausted') return;
    expect(decision.reason).toContain('budget');
  });

  it('continues to another iteration when a correction did not clear its target', () => {
    /*
     * The case that separates a correction loop from a rubber stamp: iteration
     * 0 failed on pacing, a correction was applied, and the gate *still* fails.
     * Accepting here — because something changed, or because the loop already
     * "did its correction" — is the single most damaging thing this controller
     * could do, because the item would go to a human marked as corrected.
     *
     * It must keep going while budget remains, and the defect must still be
     * the one it targets.
     */
    const stillFailing = [
      ...passing().filter((g) => g.gate !== 'audio'),
      gate('audio', 'failed', [
        { rule: 'audio.pacing', severity: 'error', message: '179 words per minute, outside 140–175.' },
      ]),
    ];
    const decision = decide({
      requires: REQUIRES,
      history: [
        record({ gates: stillFailing, action: 'rewrite_vo_script', defects: defectsFrom(stillFailing, policyFor, REQUIRES) }),
        record({ iteration: 1, gates: stillFailing, changed: ['vo_script', 'voiceover'] }),
      ],
    });

    expect(decision.kind).toBe('correct');
    if (decision.kind !== 'correct') return;
    expect(decision.action).toBe('rewrite_vo_script');
    expect(decision.defects.map((d) => d.rule)).toContain('audio.pacing');
  });

  it('does not accept an item whose targeted gate is still failing', () => {
    // The blunt form of the same rule, stated so a tamper on `blocking()` has
    // something to break.
    const stillFailing = [
      ...passing().filter((g) => g.gate !== 'audio'),
      gate('audio', 'failed', [{ rule: 'audio.pacing', severity: 'error', message: 'still too fast' }]),
    ];
    expect(decide({ requires: REQUIRES, history: [record({ gates: stillFailing })] }).kind).not.toBe('accept');
  });

  it('gives up on a correction that has already failed twice', () => {
    /*
     * Without this the loop repeats the same fix until the budget runs out —
     * the exact dice-rolling the design exists to prevent, arriving through the
     * back door.
     */
    const failing = [...passing().filter((g) => g.gate !== 'visual'), gate('visual', 'failed', [
      { rule: 'visual.contrast', severity: 'error', message: 'still failing' },
    ])];
    const defects = defectsFrom(failing, policyFor);
    const decision = decide({
      requires: REQUIRES,
      history: [
        record({ gates: failing }),
        record({ iteration: 1, gates: failing, action: 'adjust_caption_treatment', defects }),
        record({ iteration: 2, gates: failing, action: 'adjust_caption_treatment', defects }),
      ],
    });
    expect(decision.kind).toBe('escalate');
    if (decision.kind !== 'escalate') return;
    expect(decision.reason).toContain('already been tried twice');
  });
});

// ── Carrying findings forward ─────────────────────────────────────────────

describe('findings survive iterations', () => {
  it('tells the corrector what an earlier iteration already fixed', () => {
    /*
     * §6's scenario exactly: iteration 0 failed on caption overlap, iteration 1
     * fixed it and broke the pacing. Iteration 2 must not recreate the overlap.
     */
    const overlap = defectsFrom(
      [gate('visual', 'failed', [{ rule: 'visual.text_clipped', severity: 'error', message: 'caption over the reason' }])],
      policyFor,
    );
    const pacing = [...passing().filter((g) => g.gate !== 'audio'), gate('audio', 'failed', [
      { rule: 'audio.pacing', severity: 'error', message: '195 wpm' },
    ])];

    const decision = decide({
      requires: REQUIRES,
      history: [
        record({ defects: overlap }),
        record({ iteration: 1, gates: pacing, action: 'adjust_caption_treatment', changed: ['caption_style'] }),
      ],
    });

    expect(decision.kind).toBe('correct');
    if (decision.kind !== 'correct') return;
    expect(decision.doNotRegress.map((d) => d.rule)).toContain('visual.text_clipped');
    expect(decision.action).toBe('rewrite_vo_script');
  });
});

// ── Best-iteration selection ──────────────────────────────────────────────

describe('best iteration', () => {
  it('prefers a passing iteration over a failing later one', () => {
    const failing = [...passing().filter((g) => g.gate !== 'visual'), gate('visual', 'failed')];
    const best = bestIteration(
      [record({ iteration: 0 }), record({ iteration: 1, gates: failing })],
      REQUIRES,
    );
    expect(best!.iteration).toBe(0);
  });

  it('prefers the earliest among equally valid iterations', () => {
    /*
     * The anti-churn rule. Two passing iterations are both publishable and the
     * later one cost more; "the model liked it more" is not a measurable reason
     * to prefer it.
     */
    const best = bestIteration([record({ iteration: 0 }), record({ iteration: 1 })], REQUIRES);
    expect(best!.iteration).toBe(0);
  });

  it('prefers fewer warnings when both pass', () => {
    const warned = [...passing().filter((g) => g.gate !== 'retention'), gate('retention', 'warning')];
    const best = bestIteration(
      [record({ iteration: 0, gates: warned }), record({ iteration: 1 })],
      REQUIRES,
    );
    expect(best!.iteration).toBe(1);
  });
});
