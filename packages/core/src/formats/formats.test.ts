/**
 * §277–279. The format family.
 *
 * The point of these formats is that they let an account post on a day when
 * nothing was converted — so most of what is asserted here is about the two
 * things that would quietly undo that: a format reaching a platform that cannot
 * carry it, and a sourced format publishing a fact with nothing behind it.
 */
import { describe, expect, it } from 'vitest';
import { platformsForFormat } from '../channels/channels.js';
import {
  POST_FORMATS,
  POST_FORMAT_CATALOG,
  expandSlots,
  formatById,
  formatsForPlatform,
  requiresCitation,
} from './catalog.js';
import { selectFormat } from './select.js';
import { briefFor, checkDraft, looksCitable, parseDraft, type FormatDraft } from './write.js';

describe('the catalogue', () => {
  it('declares a platform list for every format, and only real platforms', () => {
    const real = new Set(['tiktok', 'instagram', 'youtube', 'x', 'threads', 'pinterest']);
    for (const id of POST_FORMATS) {
      /* §295. Platforms are derived from the channel now, not listed. */
      const platforms = platformsForFormat(id);
      expect(platforms.length, id).toBeGreaterThan(0);
      for (const p of platforms) expect(real, `${id} -> ${p}`).toContain(p);
    }
  });

  it('keeps the id and the key in step, so a lookup cannot drift', () => {
    for (const id of POST_FORMATS) expect(POST_FORMAT_CATALOG[id].id).toBe(id);
  });

  it('gives every slot a brief and a ceiling', () => {
    for (const id of POST_FORMATS) {
      for (const slot of POST_FORMAT_CATALOG[id].slots) {
        expect(slot.brief.length, `${id}.${slot.key}`).toBeGreaterThan(10);
        expect(slot.maxWords, `${id}.${slot.key}`).toBeGreaterThan(3);
      }
    }
  });

  it('expands repeats into the slots a writer is actually asked for', () => {
    const quiz = POST_FORMAT_CATALOG.quiz;
    const expanded = expandSlots(quiz);
    expect(expanded.filter((s) => s.key === 'question')).toHaveLength(5);
    expect(expanded.filter((s) => s.key === 'answer')).toHaveLength(5);
    expect(expanded.filter((s) => s.key === 'title')).toHaveLength(1);
  });

  it('has formats that work with no product artifact at all', () => {
    /*
     * The whole reason the family exists: an account must be able to post on a
     * day when nothing was converted.
     */
    const standalone = POST_FORMATS.filter((id) => !POST_FORMAT_CATALOG[id].needsArtifact);
    expect(standalone.length).toBeGreaterThanOrEqual(5);
    expect(standalone).toContain('quiz');
    expect(standalone).toContain('history');
  });

  it('marks the formats that assert things about the world as needing citation', () => {
    for (const id of ['quiz', 'history', 'myth_fact', 'origin'] as const) {
      expect(requiresCitation(POST_FORMAT_CATALOG[id]), id).toBe(true);
    }
    /* And the ones that do not, so the rule is not just "everything". */
    expect(requiresCitation(POST_FORMAT_CATALOG.tips)).toBe(false);
    expect(requiresCitation(POST_FORMAT_CATALOG.transformation)).toBe(false);
  });

  it('offers a platform only the formats it can carry', () => {
    for (const f of formatsForPlatform('x')) expect(platformsForFormat(f.id)).toContain('x');
    /* A full recipe is not an X post. */
    expect(formatsForPlatform('x').map((f) => f.id)).not.toContain('recipe');
  });

  it('returns null for a format nobody wrote', () => {
    expect(formatById('not_a_format')).toBeNull();
  });
});

describe('choosing a format', () => {
  it('never picks one the platform cannot carry', () => {
    /*
     * §295. Pinterest and Facebook are deliberately not in a channel yet, so
     * they are not in this list. `selectFormat` reports that as a gap rather
     * than inventing a shape for them — asserted separately below.
     */
    for (const platform of ['tiktok', 'instagram', 'x', 'youtube', 'threads']) {
      const { format } = selectFormat({ platform, hasArtifact: true });
      expect(platformsForFormat(format.id), `${platform} -> ${format.id}`).toContain(platform);
    }
  });

  it('never picks an artifact-dependent format when there is no artifact', () => {
    for (const platform of ['instagram', 'youtube']) {
      const { format } = selectFormat({ platform, hasArtifact: false });
      expect(format.needsArtifact, `${platform} -> ${format.id}`).toBe(false);
    }
  });

  it('honours an operator pick the platform can carry', () => {
    const { format, reason } = selectFormat({
      platform: 'tiktok',
      hasArtifact: false,
      requested: 'quiz',
    });
    expect(format.id).toBe('quiz');
    expect(reason).toContain('operator');
  });

  it('falls back and says so when the operator picks something impossible', () => {
    /* A recipe is not an X post; refusing silently would look like a bug. */
    const { format, reason } = selectFormat({
      platform: 'x',
      hasArtifact: true,
      requested: 'recipe',
    });
    expect(format.id).not.toBe('recipe');
    expect(reason).toContain('cannot carry');
  });

  it('rotates rather than repeating the same shape', () => {
    const used: Array<(typeof POST_FORMATS)[number]> = [];
    for (let i = 0; i < 4; i += 1) {
      const { format } = selectFormat({
        platform: 'tiktok',
        hasArtifact: true,
        recentFormats: used,
      });
      used.unshift(format.id);
    }
    expect(new Set(used).size).toBeGreaterThan(1);
  });

  it('avoids sourced formats when nothing can cite them', () => {
    /*
     * The alternative is a confident unsourced fact, which is worse than a
     * duller post — and indistinguishable from a true one until someone checks.
     */
    const { format } = selectFormat({
      platform: 'tiktok',
      hasArtifact: true,
      canCite: false,
    });
    expect(format.factuality).not.toBe('sourced');
  });

  it('says a platform nothing serves is a gap, rather than inventing a shape', () => {
    /*
     * Pinterest and Facebook are out of scope for now. The selector still has
     * to return something, and it says plainly that this is a gap — silently
     * picking a shape would make an unserved platform look served.
     */
    const { reason } = selectFormat({ platform: 'pinterest', hasArtifact: true });
    expect(reason).toContain('gap');
  });

  it('explains the choice', () => {
    const { reason } = selectFormat({ platform: 'instagram', hasArtifact: true });
    expect(reason.length).toBeGreaterThan(20);
  });
});

describe('writing to a format', () => {
  const history = POST_FORMAT_CATALOG.history;

  const draft = (over: Partial<Record<string, string | null>> = {}): FormatDraft => ({
    formatId: 'history',
    slots: history.slots.map((s) => ({
      key: s.key,
      index: 0,
      text: over[s.key] ?? 'Some text that fills this slot.',
      citation: 'Beccari, 1728',
    })),
  });

  it('briefs the writer with every slot and its ceiling', () => {
    const brief = briefFor(history, { subject: 'gluten', audience: 'home bakers', platform: 'tiktok' });
    for (const slot of history.slots) expect(brief).toContain(slot.key);
    expect(brief).toContain('Max');
  });

  it('demands citations in the brief for a sourced format', () => {
    const brief = briefFor(history, { subject: 'gluten', audience: 'bakers', platform: 'tiktok' });
    expect(brief).toContain('citation');
    /* §282 — the brief now demands a *link*, because the page gets fetched. */
    expect(brief).toContain('must be a URL');
    expect(brief).toContain('invented URL costs you the attempt');
  });

  it('does not demand citations for a craft format', () => {
    const brief = briefFor(POST_FORMAT_CATALOG.tips, {
      subject: 'bread',
      audience: 'bakers',
      platform: 'x',
    });
    expect(brief).not.toContain('EVERY factual claim');
  });

  it('accepts a complete, cited draft', () => {
    const check = checkDraft(history, draft());
    expect(check.ok).toBe(true);
    expect(check.missing).toHaveLength(0);
  });

  it('fails a draft with a missing slot', () => {
    const d = draft();
    d.slots = d.slots.filter((s) => s.key !== 'turn');
    const check = checkDraft(history, d);
    expect(check.ok).toBe(false);
    expect(check.missing).toContain('turn');
  });

  it('fails a sourced slot with no citation', () => {
    const d = draft();
    d.slots[0]!.citation = null;
    const check = checkDraft(history, d);
    expect(check.ok).toBe(false);
    expect(check.problems.some((p) => p.rule === 'format.uncited_claim')).toBe(true);
  });

  it('rejects a citation that is not one', () => {
    /* The failure that actually happens: a confident sentence with nothing behind it. */
    for (const vague of ['studies show', 'experts say', 'it is widely known', 'research suggests']) {
      expect(looksCitable(vague), vague).toBe(false);
    }
    expect(looksCitable(null)).toBe(false);
    expect(looksCitable('')).toBe(false);
  });

  it('accepts a citation a reader could actually check', () => {
    expect(looksCitable('Beccari, 1728')).toBe(true);
    expect(looksCitable('https://www.nature.com/articles/12345')).toBe(true);
  });

  it('warns rather than fails on an over-long slot', () => {
    /* §264 already refuses to truncate mid-word, so this degrades a card
       rather than breaking one. */
    /*
     * Real prose, not repeated filler: §293 runs the slop filter over slot text
     * now, and "word word word…" trips a repetition rule, which would make this
     * test pass for the wrong reason.
     */
    const d = draft({
      /*
       * Real prose in short sentences. §293 runs the slop filter over slot text
       * now, so filler trips repetition and one long sentence trips the
       * structure rules — either would make this pass for the wrong reason.
       */
      hook:
        'Hydration depends on the flour. Some blends drink more. Weigh it once. Then adjust by feel. Keep notes each bake. The dough tells you soon enough.',
    });
    const check = checkDraft(history, d);
    expect(check.problems.some((p) => p.rule === 'format.slot_too_long')).toBe(true);
    expect(check.ok).toBe(true);
  });

  it('never invents a slot from a malformed reply', () => {
    for (const bad of [null, {}, { slots: 'nope' }, { slots: [{ key: 'nope', text: 'x' }] }]) {
      const parsed = parseDraft(bad, history);
      expect(parsed.slots).toHaveLength(0);
      expect(checkDraft(history, parsed).ok).toBe(false);
    }
  });

  it('keeps only slots the format actually declares', () => {
    const parsed = parseDraft(
      { slots: [{ key: 'hook', index: 0, text: 'Real.', citation: 'Beccari, 1728' }, { key: 'invented', index: 0, text: 'x' }] },
      history,
    );
    expect(parsed.slots.map((s) => s.key)).toEqual(['hook']);
  });

  it('counts a quiz as incomplete until all five questions are there', () => {
    const quiz = POST_FORMAT_CATALOG.quiz;
    const partial: FormatDraft = {
      formatId: 'quiz',
      slots: [
        { key: 'title', index: 0, text: 'Five in thirty seconds.', citation: 'Beccari, 1728' },
        { key: 'question', index: 0, text: 'When was gluten identified?', citation: 'Beccari, 1728' },
        { key: 'answer', index: 0, text: 'In 1728, by Jacopo Beccari.', citation: 'Beccari, 1728' },
      ],
    };
    const check = checkDraft(quiz, partial);
    expect(check.ok).toBe(false);
    expect(check.missing.length).toBeGreaterThan(5);
  });
});

describe('§291 — whose claims a piece is making', () => {
  it('marks only product-grounded formats as making claims about the artifact', async () => {
    /*
     * The first production quiz died three times on
     * "claims: 4/5 verified against artifact". It was a quiz about the history
     * of gluten; the recipe artifact was never going to contain those claims,
     * so verifying against it was a category error rather than a strict gate.
     */
    const { POST_FORMAT_CATALOG } = await import('./catalog.js');
    expect(POST_FORMAT_CATALOG.transformation.factuality).toBe('product');
    expect(POST_FORMAT_CATALOG.recipe.factuality).toBe('product');

    /* And the ones grounded elsewhere, which must not be checked that way. */
    for (const id of ['quiz', 'history', 'myth_fact', 'origin'] as const) {
      expect(POST_FORMAT_CATALOG[id].factuality, id).toBe('sourced');
    }
    for (const id of ['tips', 'comparison'] as const) {
      expect(POST_FORMAT_CATALOG[id].factuality, id).toBe('craft');
    }
  });

  it('leaves every format with a factuality, so the caller never has to guess', () => {
    for (const id of POST_FORMATS) {
      expect(['product', 'sourced', 'craft'], id).toContain(POST_FORMAT_CATALOG[id].factuality);
    }
  });
});
