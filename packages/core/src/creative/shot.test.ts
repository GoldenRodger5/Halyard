/**
 * §402. The bug was that every picture was the same picture.
 *
 * So the assertions are about *consecutive* choices, not about any single one.
 * A test that checked `chooseShot({}).framing === 'overhead_flat_lay'` would
 * have passed against the broken code too, because the broken code was
 * perfectly consistent — that was the whole defect.
 */
import { describe, expect, it } from 'vitest';
import {
  FRAMINGS,
  LIGHTS,
  SURFACES,
  chooseShot,
  parseShot,
  shotDirection,
  shotId,
} from './shot.js';

/** Shoot n pictures in a row, each seeing what the ones before it chose. */
function series(n: number, format?: string): string[] {
  const history: string[] = [];
  for (let i = 0; i < n; i += 1) {
    history.unshift(chooseShot({ format, recent: history }).id);
  }
  return history.reverse();
}

describe('chooseShot', () => {
  it('does not repeat a framing, light or surface on the next picture', () => {
    const shots = series(2).map(parseShot);
    expect(shots[0]!.framing).not.toBe(shots[1]!.framing);
    expect(shots[0]!.light).not.toBe(shots[1]!.light);
    expect(shots[0]!.surface).not.toBe(shots[1]!.surface);
  });

  it('uses every framing before reusing one', () => {
    const framings = series(FRAMINGS.length).map((id) => parseShot(id)!.framing);
    expect(new Set(framings).size).toBe(FRAMINGS.length);
  });

  it('uses every light and surface before reusing one', () => {
    const lights = series(LIGHTS.length).map((id) => parseShot(id)!.light);
    expect(new Set(lights).size).toBe(LIGHTS.length);
    const surfaces = series(SURFACES.length).map((id) => parseShot(id)!.surface);
    expect(new Set(surfaces).size).toBe(SURFACES.length);
  });

  it('produces distinct pictures across a fortnight of every-other-day posting', () => {
    const week = series(7);
    expect(new Set(week).size).toBe(7);
  });

  it('refuses a framing the format cannot honestly use', () => {
    const quiz = series(FRAMINGS.length, 'quiz').map((id) => parseShot(id)!.framing);
    expect(quiz).not.toContain('hands_at_work');
    const walkthrough = series(FRAMINGS.length, 'walkthrough').map((id) => parseShot(id)!.framing);
    expect(walkthrough).not.toContain('wide_table');
  });

  it('leaves every format at least two framings to rotate between', () => {
    /*
     * A refusal table that emptied a format would silently fall back to the
     * full vocabulary and un-refuse the framing it meant to forbid. One
     * framing left is no better: it is a constant, which is this bug again.
     */
    for (const format of ['quiz', 'history', 'myth', 'walkthrough', 'tips', 'recipe']) {
      const framings = new Set(
        series(FRAMINGS.length, format).map((id) => parseShot(id)!.framing),
      );
      expect(framings.size).toBeGreaterThan(1);
    }
  });

  it('is a pure function of its inputs, so a re-render reproduces the picture', () => {
    const recent = ['macro_detail/hard_sun/pale_marble'];
    expect(chooseShot({ recent }).id).toBe(chooseShot({ recent }).id);
  });

  it('drops a recorded shot it cannot parse rather than guessing at it', () => {
    expect(parseShot('nonsense')).toBeNull();
    expect(parseShot('macro_detail/not_a_light/worn_wood')).toBeNull();
    expect(parseShot(null)).toBeNull();
    /* An unparseable history must not skew the choice. */
    expect(chooseShot({ recent: ['nonsense', null] }).id).toBe(chooseShot({ recent: [] }).id);
  });

  it('round-trips through the column', () => {
    const chosen = chooseShot({ recent: [] });
    expect(parseShot(shotId(chosen))).toEqual({
      framing: chosen.framing,
      light: chosen.light,
      surface: chosen.surface,
    });
  });

  it('says every axis to the image model', () => {
    const direction = shotDirection(parseShot('macro_detail/hard_sun/dark_slate')!);
    expect(direction).toContain('close-up');
    expect(direction).toContain('sunlight');
    expect(direction).toContain('slate');
  });
});
