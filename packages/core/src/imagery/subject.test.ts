/**
 * §314. A model may not decide that its own subject is photographable.
 */
import { describe, it, expect } from 'vitest';
import { checkSubject } from './subject.js';

describe('checkSubject', () => {
  it('accepts a noun phrase', () => {
    expect(checkSubject('a rustic sourdough loaf').subject).toBe('a rustic sourdough loaf');
  });

  it('refuses a sentence, which is what produced "A photograph of Bread was an accident"', () => {
    expect(checkSubject('Bread was an accident of wild yeast.').subject).toBeNull();
  });

  it('refuses an abstraction, because an abstraction has no photograph', () => {
    expect(checkSubject('the history of gluten').subject).toBeNull();
    expect(checkSubject('general knowledge').subject).toBeNull();
  });

  it('refuses an empty answer', () => {
    expect(checkSubject('   ').subject).toBeNull();
  });

  it('strips quoting and trailing punctuation a model adds', () => {
    expect(checkSubject('"a bowl of oats"').subject).toBe('a bowl of oats');
  });

  it('explains itself either way', () => {
    expect(checkSubject('a bowl of oats').reason.length).toBeGreaterThan(20);
    expect(checkSubject('Bread was an accident.').reason.length).toBeGreaterThan(20);
  });
});
