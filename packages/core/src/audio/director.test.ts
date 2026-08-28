/**
 * §221. Choosing a bed.
 *
 * The assertions that matter are the refusals: a licence problem is not a lower
 * score, and an empty library must say so in words rather than returning null
 * and letting the caller guess.
 */
import { describe, expect, it } from 'vitest';
import {
  bedPermitted,
  coversRuntime,
  duckingFor,
  energyFor,
  moodFor,
  selectBed,
  type AudioBrief,
  type MusicBed,
} from './director.js';

const NOW = new Date('2026-08-28T00:00:00Z');
const DAY = 86_400_000;

function bed(over: Partial<MusicBed> = {}): MusicBed {
  return {
    id: 'b1',
    assetId: 'a1',
    title: 'Warm Kitchen',
    mood: 'warm',
    energy: 0.4,
    bpm: 90,
    durationSeconds: 60,
    loopable: true,
    /* §239. The default fixture is a licensed production bed with proof, so a
       test that means to exercise the *licence* gate has to say so. */
    provenance: 'licensed_production',
    licenceProof: 'receipt://fixture-0001',
    licence: 'Artlist unlimited, seat 1',
    attributionRequired: false,
    platformRestrictions: [],
    ...over,
  };
}

function brief(over: Partial<AudioBrief> = {}): AudioBrief {
  return {
    platform: 'tiktok',
    targetSeconds: 24,
    hasVoiceover: true,
    cutsPerMinute: 14,
    ...over,
  };
}

describe('licence is a gate, not a tiebreak', () => {
  it('refuses a bed with no stated terms', () => {
    const d = bedPermitted(bed({ licence: '  ' }), 'tiktok', NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/not a licence/);
  });

  it('refuses a licence that has expired', () => {
    const d = bedPermitted(bed({ expiresAt: new Date(NOW.getTime() - DAY) }), 'tiktok', NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/expired/);
  });

  it('refuses a platform the licence does not cover', () => {
    const d = bedPermitted(bed({ platformRestrictions: ['youtube'] }), 'youtube', NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/does not cover youtube/);
  });

  it('refuses required attribution with nothing to render', () => {
    const d = bedPermitted(bed({ attributionRequired: true }), 'tiktok', NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/no attribution text/);
  });

  it('allows attribution when the credit exists', () => {
    const d = bedPermitted(
      bed({ attributionRequired: true, attributionText: 'Music: Someone' }),
      'tiktok',
      NOW,
    );
    expect(d.allowed).toBe(true);
  });

  /** Filtered before scoring, and reported. */
  it('excludes an unlicensed bed rather than ranking it low', () => {
    const result = selectBed(
      [bed({ id: 'blocked', platformRestrictions: ['tiktok'] })],
      brief(),
      NOW,
    );
    expect(result.chosen).toBeNull();
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reason).toMatch(/does not cover tiktok/);
  });
});

describe('runtime', () => {
  it('accepts a bed long enough on its own', () => {
    expect(coversRuntime(bed({ durationSeconds: 30, loopable: false }), 24)).toBe(true);
  });

  it('accepts a short bed that loops cleanly', () => {
    expect(coversRuntime(bed({ durationSeconds: 12, loopable: true }), 30)).toBe(true);
  });

  it('refuses a short bed with no clean loop — a seam or silence, and silence is honest', () => {
    expect(coversRuntime(bed({ durationSeconds: 12, loopable: false }), 30)).toBe(false);
  });
});

describe('what the piece wants', () => {
  it('takes the mood from the emotional angle when the concept stated one', () => {
    expect(moodFor(brief({ emotionalAngle: 'surprise' }))).toBe('playful');
    expect(moodFor(brief({ emotionalAngle: 'relief' }))).toBe('calm');
    expect(moodFor(brief({ emotionalAngle: 'recognition' }))).toBe('warm');
  });

  it('falls back to the visual language, which is also a real signal', () => {
    expect(moodFor(brief({ visualLanguage: 'kinetic' }))).toBe('driving');
    expect(moodFor(brief({ visualLanguage: 'editorial_cut' }))).toBe('confident');
  });

  it('raises energy with the cut rhythm', () => {
    expect(energyFor(brief({ cutsPerMinute: 40, hasVoiceover: false }))).toBeGreaterThan(
      energyFor(brief({ cutsPerMinute: 10, hasVoiceover: false })),
    );
  });

  /** A bed competing with a voice is the commonest way a mix goes wrong. */
  it('caps energy when narration has to sit on top', () => {
    expect(energyFor(brief({ cutsPerMinute: 60, hasVoiceover: true }))).toBeLessThanOrEqual(0.62);
  });
});

describe('selection', () => {
  it('prefers the bed whose mood matches', () => {
    const result = selectBed(
      [bed({ id: 'wrong', mood: 'tense' }), bed({ id: 'right', mood: 'driving' })],
      brief({ visualLanguage: 'kinetic' }),
      NOW,
    );
    expect(result.chosen!.bed.id).toBe('right');
    expect(result.chosen!.reasons.join(' ')).toMatch(/driving suits the piece/);
  });

  it('rotates away from what was just used', () => {
    const result = selectBed(
      [
        bed({ id: 'fresh', lastUsedAt: new Date(NOW.getTime() - 40 * DAY) }),
        bed({ id: 'stale', lastUsedAt: new Date(NOW.getTime() - 1 * DAY) }),
      ],
      brief(),
      NOW,
    );
    expect(result.chosen!.bed.id).toBe('fresh');
  });

  it('flags when the chosen bed needs a credit rendered', () => {
    const result = selectBed(
      [bed({ attributionRequired: true, attributionText: 'Music: Someone' })],
      brief(),
      NOW,
    );
    expect(result.chosen!.requiresAttribution).toBe(true);
  });

  /**
   * The state Halyard is actually in, and it must say so rather than returning
   * a bare null the caller has to interpret.
   */
  it('explains an empty library instead of failing silently', () => {
    const result = selectBed([], brief(), NOW);
    expect(result.chosen).toBeNull();
    expect(result.silenceReason).toMatch(/library is empty/);
    expect(result.silenceReason).toMatch(/narration-only/);
  });

  it('explains why every candidate was unusable', () => {
    const result = selectBed(
      [bed({ durationSeconds: 5, loopable: false })],
      brief({ targetSeconds: 30 }),
      NOW,
    );
    expect(result.chosen).toBeNull();
    expect(result.silenceReason).toMatch(/not loopable/);
  });
});

describe('ducking', () => {
  it('puts the bed well under a voice', () => {
    const under = duckingFor(brief({ hasVoiceover: true }));
    const alone = duckingFor(brief({ hasVoiceover: false }));
    expect(under.bedGainDb).toBeLessThan(alone.bedGainDb);
    expect(under.duckDb).toBeLessThan(0);
  });

  it('does not duck what has nothing to duck under', () => {
    expect(duckingFor(brief({ hasVoiceover: false })).duckDb).toBe(0);
  });
});

describe('provenance decides what may reach a post', () => {
  /*
   * §239/§241. The gate that makes a fixture library safe to have.
   *
   * §221 refused to synthesise beds because a synthesised pad would be
   * indistinguishable in the pipeline from a real one, so nobody would notice
   * which shipped. That danger is this column: a fixture is usable for a
   * preview and refused for a post, by name.
   */
  const brief = {
    platform: 'tiktok',
    targetSeconds: 30,
    hasVoiceover: true,
  };

  it('refuses a test fixture for anything that will be published', () => {
    const fixture = bed({ provenance: 'test', licenceProof: null });
    const r = selectBed([fixture], { ...brief, forPublication: true }, NOW);
    expect(r.chosen).toBeNull();
    expect(r.rejected[0]!.reason).toContain('never for a post');
  });

  it('allows the same fixture for a preview or a regression render', () => {
    const fixture = bed({ provenance: 'test', licenceProof: null });
    const r = selectBed([fixture], { ...brief, forPublication: false }, NOW);
    expect(r.chosen?.bed.id).toBe(fixture.id);
  });

  it('defaults to refusing, so a fixture cannot leak in by omission', () => {
    // A caller that wants a fixture has to say so. The unsafe direction is
    // never the default.
    const r = selectBed([bed({ provenance: 'test', licenceProof: null })], brief, NOW);
    expect(r.chosen).toBeNull();
  });

  it('refuses a production claim with no proof', () => {
    /*
     * The database has the same constraint. Checked here too because a bed
     * can arrive from a fixture, a migration or an older row, and "claims a
     * licence" is not the same fact as "a licence exists".
     */
    const r = selectBed(
      [bed({ provenance: 'licensed_production', licenceProof: '  ' })],
      brief,
      NOW,
    );
    expect(r.chosen).toBeNull();
    expect(r.rejected[0]!.reason).toContain('no proof');
  });

  it('refuses an unverified bed and says what would fix it', () => {
    const r = selectBed([bed({ provenance: 'unverified' })], brief, NOW);
    expect(r.rejected[0]!.reason).toContain('licensed_production');
  });

  it('refuses a retired bed without deleting its history', () => {
    const r = selectBed([bed({ active: false })], brief, NOW);
    expect(r.rejected[0]!.reason).toContain('Retired');
  });

  it('honours an express platform prohibition', () => {
    const r = selectBed([bed({ prohibitedPlatforms: ['tiktok'] })], brief, NOW);
    expect(r.rejected[0]!.reason).toContain('prohibited on tiktok');
  });

  it('honours a per-account restriction', () => {
    const r = selectBed([bed({ accountRestrictions: ['acct-1'] })], { ...brief, accountId: 'acct-1' }, NOW);
    expect(r.rejected[0]!.reason).toContain('does not cover this account');
  });
});

describe('selection uses more than mood and recency', () => {
  const brief = {
    platform: 'tiktok',
    targetSeconds: 30,
    hasVoiceover: true,
    cutsPerMinute: 28,
    visualLanguage: 'energetic_short',
    treatment: 'process_montage',
  };

  it('avoids a vocal bed under narration', () => {
    /*
     * The most audible mistake this module can make, and the cheapest to
     * avoid. A penalty rather than a refusal: a vocal bed under a piece with
     * no narration is fine.
     */
    const vocal = bed({ id: 'vocal', hasVocals: true, mood: 'bright', energy: 0.75, bpm: 112 });
    const instrumental = bed({ id: 'instr', hasVocals: false, mood: 'bright', energy: 0.75, bpm: 112 });
    const r = selectBed([vocal, instrumental], brief, NOW);
    expect(r.chosen?.bed.id).toBe('instr');
    expect(r.chosen?.reasons.join(' ')).toContain('does not fight the voice');
  });

  it('allows a vocal bed when nothing is being said', () => {
    const vocal = bed({ id: 'vocal', hasVocals: true, mood: 'bright', energy: 0.75 });
    const r = selectBed([vocal], { ...brief, hasVoiceover: false }, NOW);
    expect(r.chosen?.bed.id).toBe('vocal');
  });

  it('matches tempo to the cut rhythm and says so', () => {
    const slow = bed({ id: 'slow', bpm: 70, mood: 'bright', energy: 0.7 });
    const fast = bed({ id: 'fast', bpm: 115, mood: 'bright', energy: 0.7 });
    const r = selectBed([slow, fast], brief, NOW);
    expect(r.chosen?.bed.id).toBe('fast');
    expect(r.chosen?.reasons.join(' ')).toMatch(/bpm matched/);
  });

  it('penalises a bed this account used recently, not merely one used recently', () => {
    /*
     * §239. `lastUsedAt` is global; a viewer scrolling one account notices
     * repetition in *that* feed. Two accounts may legitimately use the same
     * bed on the same day.
     */
    const a = bed({ id: 'a', mood: 'bright', energy: 0.7, bpm: 112 });
    const b = bed({ id: 'b', mood: 'bright', energy: 0.7, bpm: 112 });
    const r = selectBed([a, b], {
      ...brief,
      accountId: 'acct-1',
      history: [
        { musicBedId: 'a', platform: 'tiktok', usedAt: new Date(NOW.getTime() - DAY) },
      ],
    }, NOW);
    expect(r.chosen?.bed.id).toBe('b');
    expect(r.chosen?.reasons).toContain('not used by this account');
  });

  it('lets measurement tilt the choice and names it', () => {
    const a = bed({ id: 'a', mood: 'bright', energy: 0.7, bpm: 112 });
    const b = bed({ id: 'b', mood: 'bright', energy: 0.7, bpm: 112 });
    const r = selectBed([a, b], {
      ...brief,
      insights: [{ feature: 'music_bed', featureValue: 'b', lift: 0.8, confidence: 0.9 }],
    }, NOW);
    expect(r.chosen?.bed.id).toBe('b');
    expect(r.chosen?.reasons.join(' ')).toContain('historically strong');
  });

  it('prefers music that matches how much the picture is moving', () => {
    const quiet = bed({ id: 'quiet', mood: 'bright', energy: 0.2, bpm: 112 });
    const lively = bed({ id: 'lively', mood: 'bright', energy: 0.75, bpm: 112 });
    const r = selectBed([quiet, lively], { ...brief, motionDensity: 0.8 }, NOW);
    expect(r.chosen?.bed.id).toBe('lively');
  });

  it('explains every choice in terms an operator can disagree with', () => {
    const r = selectBed([bed({ mood: 'bright', energy: 0.7, bpm: 112 })], brief, NOW);
    expect(r.chosen!.reasons.length).toBeGreaterThan(0);
    for (const reason of r.chosen!.reasons) expect(reason.length).toBeGreaterThan(4);
  });
});
