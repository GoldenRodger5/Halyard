# vo_script.v1

A separate prompt from the copywriter, written for the ear (v1 §5.3).

- Short sentences, under twelve words.
- No parentheticals, no lists, no headings, no stage directions.
- Every number spelled as words. "four hundred fifty degrees", never "450F".
- No hashtags, no emoji, no call to action.
- Word count derived from the target duration at 158 wpm, the middle of the
  140 to 175 band Gate 4 enforces.

The script is then run through `normaliseForSpeech()` with the product's
`voice_lexicon` before synthesis. Gate 4 catches what slips through, and the term
goes into the lexicon so the next synthesis gets it right. That loop is the point.

## Changelog

- **v1** — initial.
