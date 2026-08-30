/**
 * Every colour class must resolve to a real token.
 *
 * `text-bad` was used in three places for error text. There is no
 * `--color-bad`, so Tailwind emitted no rule and the text rendered in body
 * ink — an error that looked exactly like ordinary copy. Nothing caught it:
 * it typechecks (it is a string), it lints, it builds, and the element is
 * present so every selector-based test passes.
 *
 * This scans source for colour utilities and asserts the colour half names a
 * token declared in `@theme`, or a Tailwind built-in the design actually uses.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(__dirname, '..');
const CSS = path.join(WEB, 'app/globals.css');

/** Utilities whose value slot takes a colour. */
const COLOUR_PREFIXES = [
  'text', 'bg', 'border', 'ring', 'fill', 'stroke', 'divide', 'outline',
  'from', 'to', 'via', 'accent', 'caret', 'shadow', 'decoration', 'placeholder',
];

/**
 * Non-colour values these same prefixes accept — `text-sm` is a size, not a
 * colour. Listing them explicitly keeps the scan honest: an unknown word is
 * reported rather than assumed to be a size.
 */
const NON_COLOUR = new Set([
  'xs','sm','base','lg','xl','2xl','3xl','4xl','5xl','6xl','7xl','8xl','9xl',
  'left','center','right','justify','start','end','top','bottom','wrap','nowrap','balance','pretty',
  'clip','ellipsis','none','solid','dashed','dotted','double','hidden','dark','light',
  'inherit','auto','current','transparent','px','0','1','2','3','4','8',
  // `border-collapse` is a table model; `outline-offset-2` is a length.
  'collapse','separate','offset','offset-2','offset-4',
  /*
   * §393. `bg-` also prefixes a background's *size*, *position*, *repeat* and
   * *attachment*. `bg-cover` names how a picture fills its box, which is a
   * shape, not a hue — the same distinction `SHAPE_NOT_COLOUR` draws for
   * gradients.
   */
  'cover','contain','repeat','no-repeat','repeat-x','repeat-y','local','scroll',
]);

/**
 * §382. Utilities where the value after the prefix is a *shape*, not a hue.
 *
 * `bg-gradient-to-b` names a direction, and the colours arrive separately as
 * `from-` and `to-`, which this scan already checks. Matched as a family rather
 * than by enumerating every direction, because the failure of an enumeration is
 * that the next direction somebody uses is reported as an undeclared colour.
 */
const SHAPE_NOT_COLOUR = /^(gradient|linear|radial|conic)(-|$)/;

/** Edge and axis selectors that may precede a colour: `border-l-danger`. */
const EDGE = new Set(['t', 'b', 'l', 'r', 'x', 'y', 's', 'e']);

/** Tailwind built-ins the design uses deliberately. */
const BUILTIN = new Set(['white', 'black']);

function tokens(): Set<string> {
  const css = readFileSync(CSS, 'utf8');
  const names = new Set<string>();
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) names.add(m[1]!);
  return names;
}

/**
 * Blank out comments, preserving length so nothing else shifts. Prose in this
 * repository is full of apostrophes, and every one of them looks like the start
 * of a string literal.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(tsx|ts)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('colour utilities resolve to declared tokens', () => {
  const declared = tokens();

  it('declares the palette the design refers to', () => {
    // Guards the scan itself: if @theme stopped parsing, every check below
    // would pass vacuously against an empty set.
    expect(declared.size).toBeGreaterThan(8);
    expect(declared).toContain('danger');
  });

  it('uses no colour class without a token behind it', () => {
    const pattern = new RegExp(
      `\\b(?:${COLOUR_PREFIXES.join('|')})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\\b`,
      'g',
    );
    const offences: string[] = [];

    for (const file of sourceFiles(WEB)) {
      const source = readFileSync(file, 'utf8');
      /*
       * Class lists live in string literals — in a `className`, in a ternary,
       * or as an argument to `cx`. `text-bad` was found in a ternary, so
       * scanning only `className=` attributes would have missed the defect
       * this file exists because of.
       *
       * Scanning every literal does pick up CSS, where `border-radius` reads as
       * the colour `radius`. CSS and markup are told apart by punctuation a
       * Tailwind class list never contains — a semicolon, a brace, or a tag —
       * checked after interpolations are removed, since `${...}` has braces of
       * its own.
       *
       * Comments are stripped first. An apostrophe in prose — "doesn't" — opens
       * a string match that runs to the next apostrophe and swallows every real
       * literal between them, which is how the first version of this scan
       * silently stopped seeing the file it was written for. §108 is the same
       * trap in the SQL validator.
       */
      const text = [...stripComments(source).matchAll(/`([^`]*)`|'([^']*)'|"([^"]*)"/g)]
        .map((m) =>
          (m[1] ?? m[2] ?? m[3] ?? '')
            .replace(/\$\{[^}]*\}/g, ' ')
            /*
             * §386. Blank arbitrary values.
             *
             * `[text-shadow:0_1px_6px_rgba(0,0,0,.75)]` is a literal CSS
             * declaration Tailwind emits verbatim. It cannot reference a token
             * by construction, so scanning inside it only reports CSS property
             * names — `text-shadow`, `box-shadow` — as undeclared colours.
             *
             * The colours *in* an arbitrary value are literals, which is a
             * different question from the one this scan asks. Where a literal
             * is wrong, contrast is what catches it — §174.
             */
            .replace(/\[[^\]]*\]/g, ' '),
        )
        .filter((literal) => !/[;{}<>]/.test(literal))
        .join(' ');
      for (const m of text.matchAll(pattern)) {
        // strip an opacity suffix such as `primary/10`
        let base = m[1]!.split('/')[0]!;
        // `border-l-danger` names an edge then a colour; `divide-y` names only
        // an axis. Drop a leading edge/axis when something follows it.
        const parts = base.split('-');
        if (EDGE.has(parts[0]!) && parts.length > 1) base = parts.slice(1).join('-');
        else if (EDGE.has(base)) continue;
        if (NON_COLOUR.has(base) || BUILTIN.has(base) || SHAPE_NOT_COLOUR.test(base)) continue;
        // numeric values are widths or Tailwind's own scales, not this palette
        if (/^\d/.test(base)) continue;
        if (declared.has(base)) continue;
        offences.push(`${path.relative(WEB, file)}: ${m[0]}`);
      }
    }

    expect(offences).toEqual([]);
  });
});
