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
