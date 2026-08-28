/**
 * §255. Trend to content, every stage, deterministically.
 *
 * ## What this proves and what it does not
 *
 * It does **not** prove the content is good — nothing automated can. It proves
 * *orchestration*: that each stage produces something the next stage can
 * actually consume, and that a refusal at any stage stops the chain rather
 * than being carried forward as a plausible-looking default.
 *
 * That is worth a test because the failure it guards is the one this codebase
 * keeps finding: two stages that each work, joined by nothing. Every function
 * here is the real production one; only the inputs are fixed.
 *
 * The chain:
 *
 *   signal → opportunity → direction → typography → opening → motion →
 *   variants → voice → music → sound design → QC
 */
import { describe, expect, it } from 'vitest';
import { assessOpportunity } from '../discovery/opportunity.js';
import { selectBed, type MusicBed } from '../audio/director.js';
import { directVoice } from '../audio/voice.js';
import { planSfx } from '../audio/sfx.js';
import { chaptersFromBeats } from '../youtube/chapters.js';
import { runCreativeQC } from '../qc/creativeQC.js';
import { directCreative } from './director.js';
import { chooseOpening } from './openings.js';
import { motionForPlan } from './motion.js';
import { selectTypography, TYPOGRAPHY_FOR_LANGUAGE } from './typography.js';
import { planVariants } from './variants.js';
import { planLongForm } from './longform.js';

const NOW = new Date('2026-08-28T12:00:00Z');
const DAY = 86_400_000;

/** A real-shaped signal: something observed, with somewhere it came from. */
const trend = {
  id: 'sig-1',
  title: 'Everyone is asking how to make sourdough gluten-free',
  source: 'reddit:r/glutenfree',
  sourceUrl: 'https://reddit.com/r/glutenfree/comments/abc',
  platform: 'reddit',
  observedAt: new Date(NOW.getTime() - 2 * DAY),
  confidence: 0.8,
  terms: ['gluten-free', 'sourdough', 'bread'],
};

const CAPABLE = ['gluten-free', 'substitution', 'bread', 'adaptation'];

describe('a trend becomes content, or is refused for a reason', () => {
  it('carries a signal all the way to a QC verdict', () => {
    /* 1. Is this worth building? */
    const opportunity = assessOpportunity({
      signal: trend,
      capableTerms: CAPABLE,
      forbiddenTerms: ['keto cures'],
      recentTopics: [],
      now: NOW,
    });
    expect(opportunity.verdict).toBe('build');
    expect(opportunity.evidence?.url).toBe(trend.sourceUrl);

    /* 2. What does it look like? */
    const direction = directCreative({
      platform: 'tiktok',
      treatment: 'before_after',
      emotionalAngle: 'recognition',
      targetSeconds: 30,
      hasImagery: true,
      hasProductFootage: true,
    });

    /*
     * 3. What type? The handoff that matters: a language the director can
     * choose must be one typography can serve, or the compatibility rule is
     * silently switched off for it.
     */
    const typography = selectTypography({ visualLanguage: direction.language });
    expect(TYPOGRAPHY_FOR_LANGUAGE[direction.language]).toBeDefined();
    expect(TYPOGRAPHY_FOR_LANGUAGE[direction.language]).toContain(typography.system.id);

    /* 4. How does it open? */
    const opening = chooseOpening({
      text: 'Everyone blames the flour and almost everyone is wrong',
      visualLanguage: direction.language,
      hasMedia: true,
      beforeState: 'ordinary sourdough starter',
    });
    expect(opening.composition).toBeDefined();

    /* 5. How does it move? One motion per beat, in the director's language. */
    const beats = [
      { role: 'hook', emphasis: 'hold' as const, wordCount: 8, hasMedia: false },
      { role: 'before', emphasis: 'normal' as const, wordCount: 6, hasMedia: true },
      { role: 'change', emphasis: 'normal' as const, wordCount: 7, hasMedia: true },
      { role: 'proof', emphasis: 'normal' as const, wordCount: 6, hasMedia: false },
      { role: 'cta', emphasis: 'quick' as const, wordCount: 4, hasMedia: false },
    ];
    const motions = motionForPlan('before_after', beats, 'punch', direction.language);
    expect(motions).toHaveLength(beats.length);
    /* The last beat never transitions out of anything. */
    expect(motions[motions.length - 1]!.transitionOut).toBe('cut');

    /* 6. Where else does it go? */
    const variants = planVariants({
      primaryPlatform: 'tiktok',
      platforms: ['tiktok', 'instagram', 'youtube', 'pinterest'],
      treatment: 'before_after',
      hasFootage: true,
    });
    expect(variants.find((v) => v.platform === 'tiktok')!.decision).toBe('original');
    expect(variants.some((v) => v.decision !== 'original')).toBe(true);

    /* 7. How is it read? */
    const voice = directVoice({
      platform: 'tiktok',
      visualLanguage: direction.language,
      emotionalAngle: 'recognition',
      targetSeconds: 30,
    });
    expect(voice.deliveryNotes.length).toBeGreaterThan(0);

    /* 8. What plays under it? */
    const bed: MusicBed = {
      id: 'b1',
      assetId: 'a1',
      title: 'Warm Counter',
      mood: 'warm',
      energy: 0.5,
      bpm: 110,
      durationSeconds: 90,
      loopable: true,
      licence: 'CC0',
      provenance: 'licensed_production',
      licenceProof: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
      platformRestrictions: [],
      hasVocals: false,
    };
    const music = selectBed(
      [bed],
      {
        platform: 'tiktok',
        targetSeconds: 30,
        hasVoiceover: true,
        visualLanguage: direction.language,
        cutsPerMinute: 20,
      },
      NOW,
    );
    expect(music.chosen?.bed.id).toBe('b1');
    expect(music.chosen!.reasons.length).toBeGreaterThan(0);

    /* 9. Sound design, which may legitimately refuse — both are valid. */
    const sfx = planSfx({
      beats: motions.map((m, i) => ({
        startSeconds: i * 6,
        role: beats[i]!.role,
        transitionOut: m.transitionOut,
        entrance: m.entrance,
      })),
      totalSeconds: 30,
      visualLanguage: direction.language,
      hasVoiceover: true,
    });
    expect(sfx.cues.length > 0 || Boolean(sfx.refusedReason)).toBe(true);

    /* 10. Does it survive the gate? */
    const qc = runCreativeQC({
      creativeType: 'before_after',
      platform: 'tiktok',
      footageAvailable: true,
      durationSeconds: 30,
      beats: beats.map((b) => ({
        role: b.role,
        emphasis: b.emphasis,
        wordCount: b.wordCount,
        hasMedia: b.hasMedia,
      })),
      motions: motions.map((m) => ({
        entrance: m.entrance,
        camera: m.camera,
        transitionOut: m.transitionOut,
      })),
      visualLanguage: direction.language,
      typography: typography.system.id,
      opening: opening.composition,
      recentLanguages: ['documentary'],
      recentTypography: ['editorial_serif'],
      recentOpenings: ['question'],
      recentTypes: ['how_to'],
      hasMusic: true,
      lufs: -14,
      altText: 'A gluten-free sourdough before and after',
      targetCutsPerMinute: 10,
    });
    expect(qc.findings.filter((f) => f.severity === 'error')).toEqual([]);
    /*
     * Nothing silently unmeasured in a fully-supplied chain. This is the
     * assertion that catches a stage quietly not handing its output on: an
     * absent input reports `unmeasured` rather than passing, so an empty list
     * means every rule genuinely ran.
     */
    expect(qc.unmeasured).toEqual([]);
  });

  it('stops at the first stage that refuses, rather than carrying a default forward', () => {
    /*
     * The property that matters. An off-brand trend must not reach the
     * director at all — a system that scores everything and builds the least
     * bad thing is how a feed fills with content nobody wanted.
     */
    const offBrand = assessOpportunity({
      signal: { ...trend, title: 'keto cures diabetes, say influencers' },
      capableTerms: CAPABLE,
      forbiddenTerms: ['cures'],
      now: NOW,
    });
    expect(offBrand.verdict).toBe('off_brand');
    expect(offBrand.score).toBe(0);
    expect(offBrand.reason).toContain('does not become true later');
  });

  it('refuses a trend with no source before scoring it at all', () => {
    const invented = assessOpportunity({
      signal: { ...trend, source: null, sourceUrl: null },
      capableTerms: CAPABLE,
      now: NOW,
    });
    expect(invented.verdict).toBe('unevidenced');
    expect(invented.evidence).toBeNull();
  });

  it('marks a trend the product cannot evidence as unbuildable, not low-scoring', () => {
    /*
     * Different from "weak". A weak trend can be built badly; an unbuildable
     * one can only be built by inventing the connection to the product.
     */
    const r = assessOpportunity({
      signal: { ...trend, title: 'air fryer accessories are trending', terms: ['air fryer'] },
      capableTerms: CAPABLE,
      now: NOW,
    });
    expect(r.verdict).toBe('unbuildable');
    expect(r.reason).toContain('inventing a connection');
  });

  it('deprioritises a trend this account already covered', () => {
    const r = assessOpportunity({
      signal: trend,
      capableTerms: CAPABLE,
      recentTopics: ['gluten-free sourdough'],
      now: NOW,
    });
    expect(r.verdict).toBe('covered');
    /* Still scored, because it becomes buildable again with time. */
    expect(r.score).toBeGreaterThan(0);
  });

  it('drops a signal that has gone stale', () => {
    const r = assessOpportunity({
      signal: { ...trend, observedAt: new Date(NOW.getTime() - 60 * DAY) },
      capableTerms: CAPABLE,
      now: NOW,
    });
    expect(r.verdict).toBe('stale');
  });

  it('keeps the four refusals distinct, because they need different actions', () => {
    /*
     * Off-brand is permanent. Covered fixes itself with time. Unbuildable
     * fixes itself when the product ships something. Stale fixes itself by
     * being dropped. Collapsing them into one `false` is how a discovery
     * system becomes a thing that rejects everything for reasons nobody can
     * act on.
     */
    const verdicts = new Set(
      [
        assessOpportunity({ signal: { ...trend, title: 'cures everything' }, forbiddenTerms: ['cures'], capableTerms: CAPABLE, now: NOW }),
        assessOpportunity({ signal: trend, capableTerms: CAPABLE, recentTopics: ['sourdough'], now: NOW }),
        assessOpportunity({ signal: { ...trend, terms: ['air fryer'], title: 'air fryer' }, capableTerms: CAPABLE, now: NOW }),
        assessOpportunity({ signal: { ...trend, observedAt: new Date(NOW.getTime() - 90 * DAY) }, capableTerms: CAPABLE, now: NOW }),
      ].map((r) => r.verdict),
    );
    expect(verdicts).toEqual(new Set(['off_brand', 'covered', 'unbuildable', 'stale']));
  });
});

describe('the same trend, taken to YouTube long-form', () => {
  it('produces sections and a chapter list YouTube will actually render', () => {
    const artifact = {
      headline: 'Gluten-free sourdough that holds',
      highlights: [
        { type: 'technique', note: 'Feed the starter twice as often.' },
        { type: 'technique', note: 'Hydrate the blend before mixing.' },
        { type: 'technique', note: 'Shape cold, bake hot.' },
        { type: 'swap', before: 'wheat starter', after: 'rice-flour starter', reason: 'It ferments faster.' },
      ],
    } as never;

    const plan = planLongForm({ artifact, targetSeconds: 480, hasFootage: true });
    expect(plan.sections.length).toBeGreaterThanOrEqual(6);

    let at = 0;
    const chapters = plan.sections.map((s) => {
      const start = at;
      at += s.targetSeconds;
      return { title: s.title, startSeconds: start };
    });
    const result = chaptersFromBeats(chapters, plan.totalSeconds);
    expect(result.refusedReason).toBeNull();
    expect(result.lines[0]).toMatch(/^0:00 /);
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
  });
});
