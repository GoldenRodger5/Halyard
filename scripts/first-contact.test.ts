/**
 * §154. Argument parsing for the only destructive command in this repository.
 *
 * `--platform=x` used `=` and `--item` used a following token, so
 * `--item=<uuid>` — the spelling the sibling flag teaches — parsed as nothing
 * and the id was silently dropped. On `--dry-run` that prints the wrong post.
 * On `--publish` it would have spent real money on one nobody chose, and
 * neither confirmation names the item: one asks for the account handle, the
 * other for the word PUBLISH.
 */
import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

const ID = '260769d6-d48f-4f60-9609-19e3f2c0a6ba';

describe('parseArgs', () => {
  it('accepts the = spelling the sibling flag teaches', () => {
    expect(parseArgs([`--item=${ID}`, '--dry-run']).itemId).toBe(ID);
  });

  it('still accepts the spaced spelling the help text shows', () => {
    expect(parseArgs(['--item', ID, '--publish']).itemId).toBe(ID);
  });

  it('reads the platform either way', () => {
    expect(parseArgs(['--platform=threads']).platform).toBe('threads');
    expect(parseArgs(['--platform', 'threads']).platform).toBe('threads');
  });

  it('does not swallow the next flag as a value', () => {
    // `--item --publish` must not read "--publish" as an id and then publish.
    expect(parseArgs(['--item', '--publish']).itemId).toBeUndefined();
  });

  it('reports no item when none was given', () => {
    expect(parseArgs(['--dry-run']).itemId).toBeUndefined();
    expect(parseArgs(['--item=']).itemId).toBeUndefined();
  });
});
