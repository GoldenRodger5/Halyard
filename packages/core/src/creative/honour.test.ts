/**
 * §371. The bargain is: the screenplay wins, and the disagreement survives.
 *
 * Both halves matter. A screenplay that wins silently loses the director's
 * judgement, which is the thing that knows about the ground's luminance and the
 * account's last four pieces. A director that wins makes the screenplay a
 * document about a video nobody made.
 */
import { describe, expect, it } from 'vitest';
import { honour, disagreements, cameraForStagedMove } from './honour.js';
import { MOVES } from './screenplay.js';

describe('honouring the screenplay', () => {
  it('uses what the screenplay staged, over the director', () => {
    const result = honour({
      staged: 'hold',
      directed: 'push_in',
      what: 'The move',
      directorsReason: 'a two-second scene is too short to push',
    });
    expect(result.value).toBe('hold');
    expect(result.overruled).toBe(true);
  });

  it('records both sides, not only the winner', () => {
    /*
     * The note is read by an operator looking at a finished piece and asking
     * why it moves the way it does. "The screenplay said hold" answers half of
     * it; the half that matters is that somebody disagreed and why.
     */
    const result = honour({
      staged: 'hold',
      directed: 'push_in',
      what: 'The move',
      directorsReason: 'a two-second scene is too short to push',
    });
    expect(result.note).toContain('the screenplay stages hold');
    expect(result.note).toContain('the director wanted push_in');
    expect(result.note).toContain('too short to push');
  });

  it('treats silence and agreement as different facts', () => {
    /*
     * A screenplay that says nothing about the score has not overruled the
     * music director, and recording that as an override would fill the account
     * of every piece with decisions nobody made.
     */
    const silent = honour({ staged: null, directed: 'swell', what: 'The score' });
    expect(silent.value).toBe('swell');
    expect(silent.overruled).toBe(false);
    expect(silent.note).toBeNull();

    const undef = honour({ staged: undefined, directed: 'swell', what: 'The score' });
    expect(undef.overruled).toBe(false);

    const agreed = honour({ staged: 'swell', directed: 'swell', what: 'The score' });
    expect(agreed.overruled).toBe(false);
    expect(agreed.note).toBeNull();
  });

  it('compares structural values with the comparison it is given', () => {
    /*
     * `Object.is` is right for a move and an enum and wrong for a list of
     * gestures — two identical plans built separately are not the same object,
     * and reporting that as a disagreement would be noise that never stops.
     */
    const a = [{ target: 'the button', atSeconds: 1 }];
    const b = [{ target: 'the button', atSeconds: 1 }];
    const naive = honour({ staged: a, directed: b, what: 'The gestures' });
    expect(naive.overruled).toBe(true);

    const fair = honour({
      staged: a,
      directed: b,
      what: 'The gestures',
      same: (x, y) => JSON.stringify(x) === JSON.stringify(y),
    });
    expect(fair.overruled).toBe(false);
  });

  it('describes a value the way a person reads it', () => {
    expect(honour({ staged: 3, directed: 5, what: 'Questions' }).note).toContain('stages 3');
    expect(
      honour({ staged: { id: 'stack' }, directed: { id: 'rail' }, what: 'Look' }).note,
    ).toContain('stages stack');
    expect(
      honour({ staged: [1, 2], directed: [1], what: 'Gestures' }).note,
    ).toContain('2 of them');
  });

  it('collects the disagreements so they are read together', () => {
    /*
     * Three directors overruled on one piece is a statement about the
     * screenplay. Three separate log lines is not.
     */
    const results = [
      honour({ staged: 'hold', directed: 'push_in', what: 'The move' }),
      honour({ staged: 'swell', directed: 'swell', what: 'The score' }),
      honour({ staged: null, directed: 'warm', what: 'The bed' }),
      honour({ staged: 'tense', directed: 'calm', what: 'The mood' }),
    ];
    const notes = disagreements(results);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('The move');
    expect(notes[1]).toContain('The mood');
  });
});

/**
 * §371. The screenplay stages moves in a screenwriter's vocabulary and the
 * renderer executes a camera's. Mapping them is a translation, and the two that
 * do not translate are the interesting ones.
 */
describe('translating a staged move for the camera', () => {
  it('maps the moves that have a camera equivalent', () => {
    expect(cameraForStagedMove('hold')).toBe('still');
    expect(cameraForStagedMove('push_in')).toBe('push');
    expect(cameraForStagedMove('drift')).toBe('pan');
  });

  it('reads settle as a pull, which opens out and comes to rest', () => {
    expect(cameraForStagedMove('settle')).toBe('pull');
  });

  it('holds still on a cut, because a cut is an edit and not a movement', () => {
    /*
     * A scene staged as a cut is describing how it *arrives*, not what happens
     * inside it. Moving the camera as well would double the gesture.
     */
    expect(cameraForStagedMove('cut')).toBe('still');
  });

  it('refuses to guess at a move it does not know', () => {
    /*
     * A wrong translation would be recorded as a disagreement the director
     * never had, which is worse than no translation.
     */
    expect(cameraForStagedMove('zoom_out_dramatically')).toBeNull();
  });

  it('covers every move the screenplay can stage', () => {
    for (const move of MOVES) {
      expect(cameraForStagedMove(move)).not.toBeNull();
    }
  });
});
