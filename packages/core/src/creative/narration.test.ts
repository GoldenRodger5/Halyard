import { describe, expect, it } from 'vitest';
import { joinSpoken } from './narration.js';

describe('§484 joinSpoken', () => {
  it('closes a line that does not end a sentence, so the next one does not run into it', () => {
    expect(joinSpoken(['Keep herbs alive two weeks', 'Trim the stems.'])).toBe(
      'Keep herbs alive two weeks. Trim the stems.',
    );
  });
  it('leaves a line alone when it already ends one', () => {
    expect(joinSpoken(['Really?', 'Yes!', 'So…', 'He said "no."'])).toBe('Really? Yes! So… He said "no."');
  });
  it('drops empty lines and stray whitespace', () => {
    expect(joinSpoken(['  ', 'One ', '', 'Two.'])).toBe('One. Two.');
  });
});
