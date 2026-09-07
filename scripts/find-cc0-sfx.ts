/**
 * §551. Build an import manifest of CC0 sound effects, one per role.
 *
 *   pnpm exec tsx scripts/find-cc0-sfx.ts > /tmp/sfx.json
 *   DATABASE_URL=... pnpm exec tsx scripts/import-sfx.ts /tmp/sfx.json
 *
 * The SFX half of `find-cc0-music.ts`, and it exists for the same reason: the
 * library held four fixtures whose licence field read "Synthesised test fixture
 * — NOT a licence", so every piece logged "the sound effect library is empty"
 * and shipped without a single cue.
 *
 * A role with no usable result is **reported and left empty**. Filling it from
 * a neighbouring role would put a whoosh where an impact belongs, and the
 * planner places cues by role — it would place the wrong one as confidently as
 * the right one.
 */
import {
  MIN_CUE_SECONDS,
  SFX_ROLES_SEARCHED,
  SFX_SEARCHES,
  searchCc0Music,
} from '../packages/core/src/index.js';

async function main(): Promise<void> {
  const manifest: unknown[] = [];
  const empty: string[] = [];

  for (const role of SFX_ROLES_SEARCHED) {
    const search = SFX_SEARCHES[role]!;
    /*
     * The client defaults `minSeconds` to 30 — right for a bed that would
     * otherwise loop, and wrong for every cue ever recorded. `MIN_CUE_SECONDS`
     * is the other end: a ten-millisecond tick is an encode artefact, not
     * punctuation, and the first tuned search picked exactly one.
     */
    const found = await searchCc0Music({
      query: search.query,
      limit: 20,
      minSeconds: MIN_CUE_SECONDS,
      maxSeconds: search.maxSeconds,
    });

    /*
     * Shortest first, and never longer than the role allows. A cue punctuates;
     * a four-second file in a 300ms slot is a bed pretending to be one, and the
     * planner cannot tell from the role alone.
     */
    /* Shortest first; the client has already applied the upper bound. */
    const best = found
      .slice()
      .sort((a, b) => (a.durationSeconds ?? 999) - (b.durationSeconds ?? 999))[0];

    if (!best) {
      empty.push(role);
      continue;
    }

    manifest.push({
      file: best.url,
      title: best.title,
      source: best.foreignLandingUrl,
      licence: 'CC0 1.0 Universal',
      licensor: best.creator ?? best.provider ?? 'unknown',
      licenceProof: 'https://creativecommons.org/publicdomain/zero/1.0/',
      role,
    });
    process.stderr.write(
      `${role}: ${best.title} (${best.durationSeconds ?? '?'}s) ${best.foreignLandingUrl}\n`,
    );
  }

  if (empty.length > 0) {
    process.stderr.write(
      `\nNo CC0 effect found for: ${empty.join(', ')}. Left empty on purpose — an effect ` +
        'from a neighbouring role would be placed by the planner as if it fitted.\n',
    );
  }

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

void main();
