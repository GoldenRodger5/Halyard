/**
 * Validating a music bed before it enters the library. §248.
 *
 * ## Why this is a module and not a script
 *
 * The library is the one place in Halyard where a mistake is a *legal*
 * mistake rather than a quality one. A bed with a plausible-looking licence
 * string and no proof is exactly as publishable as a real one unless
 * something refuses it — so the refusal lives here, in code with tests,
 * rather than in the head of whoever ran the importer.
 *
 * ## What it will not do
 *
 * It will not infer a licence. A file with no stated licence is `unverified`,
 * and `unverified` cannot be published. There is no path from "this was free
 * to download" to `licensed_production` that does not pass through a human
 * writing down where the grant is.
 */

export type LicenceClass = 'licensed_production' | 'test' | 'unverified';

export interface BedImport {
  title: string;
  /** Where the file came from, verbatim. A URL, a purchase, a drive path. */
  source: string;
  /** The licence name, as the licensor states it. */
  licence: string;
  /** Who granted it. */
  licensor?: string | null;
  /**
   * Where the grant can be checked: the licence URL, a receipt, a key.
   * Without this a bed cannot be `licensed_production`, whatever `licence`
   * says.
   */
  licenceProof?: string | null;
  attributionRequired?: boolean;
  attributionText?: string | null;
  mood: string;
  energy: number;
  bpm?: number | null;
  genre?: string | null;
  hasVocals?: boolean;
  durationSeconds: number;
  loopable?: boolean;
  platformRestrictions?: string[];
  prohibitedPlatforms?: string[];
  expiresAt?: Date | null;
}

export interface ImportVerdict {
  /** What class this bed may enter the library as. */
  provenance: LicenceClass;
  /** Blocking problems. A bed with any of these must not be imported at all. */
  errors: string[];
  /** Things worth saying that do not block. */
  warnings: string[];
}

/** Moods the director can score against. Anything else is unreachable. */
export const IMPORTABLE_MOODS = ['calm', 'warm', 'bright', 'playful', 'tense'] as const;

/**
 * Licences that permit commercial use in marketing without a per-use fee.
 *
 * Deliberately a short list of names this codebase understands. A licence not
 * on it is not rejected — it is `unverified`, which means a person has to
 * look at it. Guessing that an unfamiliar licence is fine is precisely the
 * mistake this module exists to prevent.
 */
const UNDERSTOOD_LICENCES = [
  /^cc0\b/i,
  /^public\s*domain\b/i,
  /^cc[\s-]?by(\b|[\s-]4)/i,
  /^pixabay\b/i,
  /^royalty[\s-]?free\b/i,
  /^purchased\b/i,
  /^licensed\b/i,
];

/**
 * Decide what class a bed may enter as, and whether it may enter at all.
 *
 * Three outcomes rather than two: importable as production, importable but
 * unverified, or not importable. The middle one matters — a bed whose licence
 * nobody has checked is still worth having in the library, because losing it
 * means re-downloading it later, and `unverified` keeps it out of posts.
 */
export function validateBedImport(input: BedImport): ImportVerdict {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.title?.trim()) errors.push('A bed needs a title; the library is browsed by a person.');
  if (!input.source?.trim()) errors.push('A bed needs a source. "Somewhere" is not a provenance.');
  if (!IMPORTABLE_MOODS.includes(input.mood as never)) {
    errors.push(
      `Mood '${input.mood}' is not one the director scores against (${IMPORTABLE_MOODS.join(', ')}), ` +
        'so this bed would be in the library and never selected.',
    );
  }
  if (!(input.energy >= 0 && input.energy <= 1)) {
    errors.push('Energy is 0..1; it is matched against the cut rhythm, not a volume.');
  }
  if (!(input.durationSeconds > 0)) errors.push('Duration must be measured from the file, not guessed.');

  if (input.bpm != null && (input.bpm < 40 || input.bpm > 220)) {
    warnings.push(`${input.bpm}bpm is outside the range tempo matching uses; it will be ignored.`);
  }
  if (input.durationSeconds < 30 && !input.loopable) {
    warnings.push(
      `${Math.round(input.durationSeconds)}s and not loopable — it can only cover pieces shorter than itself.`,
    );
  }
  if (input.hasVocals) {
    warnings.push('Vocals are heavily penalised under narration; this will rarely be chosen for a voiceover piece.');
  }

  /* Attribution that cannot be rendered is a licence breach waiting to happen. */
  if (input.attributionRequired && !input.attributionText?.trim()) {
    errors.push(
      'Attribution is required by this licence and no attribution text was supplied. ' +
        'The renderer cannot credit a licensor it was not told about.',
    );
  }

  if (errors.length > 0) return { provenance: 'unverified', errors, warnings };

  const licence = (input.licence ?? '').trim();
  const proof = (input.licenceProof ?? '').trim();

  if (!licence) {
    return {
      provenance: 'unverified',
      errors,
      warnings: [...warnings, 'No licence stated, so this cannot be published until someone records one.'],
    };
  }
  if (!proof) {
    return {
      provenance: 'unverified',
      errors,
      warnings: [
        ...warnings,
        `Licence "${licence}" is stated but not evidenced. Record where the grant can be checked — ` +
          'a licence URL, a receipt, a key — and it becomes publishable.',
      ],
    };
  }
  if (!UNDERSTOOD_LICENCES.some((re) => re.test(licence))) {
    return {
      provenance: 'unverified',
      errors,
      warnings: [
        ...warnings,
        `"${licence}" is not a licence this importer recognises. It may well be fine — but guessing ` +
          'that an unfamiliar licence permits commercial marketing use is the mistake this refuses to make.',
      ],
    };
  }

  return { provenance: 'licensed_production', errors, warnings };
}
