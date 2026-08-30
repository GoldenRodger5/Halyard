/**
 * §311. Build an import manifest of CC0 beds, one per mood.
 *
 *   pnpm exec tsx scripts/find-cc0-music.ts > /tmp/beds.json
 *   DATABASE_URL=... pnpm exec tsx scripts/import-music.ts /tmp/beds.json
 *
 * Emits the manifest `import-music.ts` already takes, so the licence facts, the
 * duration probe and the loudness measurement all stay where they are. This
 * only answers "what may we legally use", which is the part that was missing:
 * every bed in the library is a `[TEST]` fixture and would have shipped a test
 * tone under a real video.
 *
 * A mood with no usable result is **reported and left empty**. Filling it from
 * a neighbouring mood would put a driving loop under a calm explainer and the
 * selector would have no way to know.
 */
import { BED_MOODS, BED_SEARCHES, searchCc0Music } from '../packages/core/src/index.js';

async function main(): Promise<void> {
  const manifest: unknown[] = [];
  const empty: string[] = [];

  for (const mood of BED_MOODS) {
    const search = BED_SEARCHES[mood]!;
    const found = await searchCc0Music({ query: search.query, limit: 12, minSeconds: 30 });
    /*
     * Longest first. A bed that comfortably covers the piece never loops, and a
     * loop with an audible seam is the single most recognisable sign of a
     * template.
     */
    const best = found
      .slice()
      .sort((a, b) => (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0))[0];

    if (!best) {
      empty.push(mood);
      continue;
    }

    manifest.push({
      file: best.url,
      title: best.title,
      source: best.foreignLandingUrl,
      licence: 'CC0 1.0 Universal',
      licensor: best.creator ?? best.provider ?? 'unknown',
      licenceProof: 'https://creativecommons.org/publicdomain/zero/1.0/',
      mood,
      energy: search.energy,
    });
    process.stderr.write(
      `${mood}: ${best.title} (${best.durationSeconds ?? '?'}s) ${best.foreignLandingUrl}\n`,
    );
  }

  if (empty.length > 0) {
    process.stderr.write(
      `\nNo CC0 bed found for: ${empty.join(', ')}. ` +
        'Left empty on purpose — a bed from a neighbouring mood would be chosen ' +
        'by the selector as if it fitted.\n',
    );
  }

  process.stdout.write(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
