/**
 * §387. The bubbles are the most visible thing on the floor, which makes them
 * the easiest place to accidentally claim something the run did not do.
 */
import { describe, expect, it } from 'vitest';
import { WRITTEN_LINES, crewLine } from './crewVoice';

describe('what a desk says', () => {
  it('says the handler’s own reason when nothing is written for the message', () => {
    const line = crewLine('some message nobody phrased', { because: 'two pages returned 403' });
    expect(line.says).toBe('two pages returned 403');
  });

  it('falls back to the message itself rather than to nothing', () => {
    expect(crewLine('a bare message').says).toBe('a bare message');
    expect(crewLine('a bare message').says.length).toBeGreaterThan(0);
  });

  it('prefers a written line over the raw because', () => {
    const line = crewLine('rendered', { because: 'quiz_v3 at final' });
    expect(line.says).toBe('Frames.');
  });

  it('trims a because that would overflow the bubble', () => {
    const long = 'x'.repeat(400);
    const line = crewLine('unknown', { because: long });
    expect(line.says.length).toBeLessThanOrEqual(110);
    expect(line.says.endsWith('…')).toBe(true);
  });

  it('collapses whitespace so a multi-line reason stays one bubble', () => {
    expect(crewLine('unknown', { because: 'two\n\n  words' }).says).toBe('two words');
  });

  it('keeps every written line short enough to read at a glance', () => {
    for (const [key, line] of Object.entries(WRITTEN_LINES)) {
      const full = `${line.says} ${line.then ?? ''}`.trim();
      expect(full.length, key).toBeLessThanOrEqual(72);
    }
  });

  it('states no number of its own', () => {
    /*
     * Gotcha 9, in the friendliest possible disguise. A bubble reading "found
     * six sources" over a stage that found two is a fabricated observation, and
     * the way to make that impossible is for no written line to contain a
     * quantity at all — every number on this screen comes from the event.
     */
    for (const [key, line] of Object.entries(WRITTEN_LINES)) {
      expect(`${line.says} ${line.then ?? ''}`, key).not.toMatch(/\b\d+\b/);
    }
  });

  it('gives each desk its own words when it wakes up', () => {
    /*
     * `stage opened` fires for all eleven stages. A single written line for it
     * put the same sentence in six different mouths — every desk woke up saying
     * "Right, let me look at this." The stage's own `doing` is specific to the
     * desk and true of it, and `openStage` already carries it.
     */
    const art = crewLine('stage opened', { doing: 'Choosing what to photograph' });
    const research = crewLine('stage opened', { doing: 'Finding facts' });
    expect(art.says).toBe('Choosing what to photograph');
    expect(research.says).not.toBe(art.says);
  });

  it('still says something when a stage opens with no doing recorded', () => {
    expect(crewLine('stage opened', {}).says.length).toBeGreaterThan(0);
  });
});
