/**
 * §279. Writing to a format, and refusing what does not fill it.
 *
 * The writer is briefed with the format's slots rather than with a free-form
 * prompt, which is the spec's rule: *"Content should not be generated from a
 * single free-form prompt with no provenance."* A slot has a brief, a word
 * ceiling and a count, and what comes back is checked against all three.
 *
 * ## The part that matters most
 *
 * `sourced` formats — quiz, history, myth/fact, origin — assert things about
 * the world. There is no artifact to check them against, so **each factual
 * claim carries its own citation or the piece is refused.**
 *
 * That is not fussiness. An account whose pitch is "we know what is in your
 * food" cannot be wrong about a date, and a wrong fact is the single most
 * screenshottable mistake available. Gotcha 9 is the same rule one domain over:
 * a claim Halyard cannot point at is one it invented.
 *
 * The refusal is deliberately blunt — a missing citation fails the piece rather
 * than downgrading it — because the alternative is a plausible unsourced fact,
 * which is indistinguishable from a true one until someone checks.
 */
import { expandSlots, requiresCitation, type PostFormat } from './catalog.js';

/** One filled slot. */
export interface FilledSlot {
  key: string;
  index: number;
  text: string;
  /**
   * Where this came from, for slots that assert something about the world.
   *
   * A URL or a named authority with a date. Null is legal only on a format
   * whose `factuality` is not `sourced`.
   */
  citation?: string | null;
}

export interface FormatDraft {
  formatId: string;
  slots: FilledSlot[];
}

export interface SlotProblem {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  slot?: string;
}

export interface FormatCheck {
  ok: boolean;
  problems: SlotProblem[];
  /** Slots the format asked for and the draft did not fill. */
  missing: string[];
  summary: string;
}

/**
 * The brief handed to the writer.
 *
 * Built from the format rather than written per format, so adding a format to
 * the catalogue is the whole change — there is no second place to update, which
 * is the failure mode `JOB_KINDS` and `jobs_kind_check` demonstrate (gotcha 1).
 */
export function briefFor(
  format: PostFormat,
  context: { subject: string; audience: string; platform: string },
): string {
  const lines = [
    `Write one ${format.name.toLowerCase()} for ${context.platform}.`,
    `Intent: ${format.intent}`,
    `Subject: ${context.subject}`,
    `Audience: ${context.audience}`,
    '',
    'Fill exactly these slots:',
  ];

  for (const slot of format.slots) {
    const count = slot.repeats ?? 1;
    lines.push(
      `- ${slot.key}${count > 1 ? ` (${count} of them)` : ''}: ${slot.brief} Max ${slot.maxWords} words.`,
    );
  }

  if (requiresCitation(format)) {
    lines.push(
      '',
      'EVERY factual claim needs a citation: a source name and a date, or a URL.',
      'If you cannot cite it, do not assert it. Choose a different fact you can cite.',
      'Do not invent a source. An uncited piece is discarded, so an invented',
      'citation wastes the attempt and risks publishing something false.',
    );
  }

  lines.push(
    '',
    'Reply with JSON only:',
    '{"slots":[{"key":"...","index":0,"text":"...","citation":"..."}]}',
  );

  return lines.join('\n');
}

/** Words, counted the way a reader would. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * A citation that is actually a citation.
 *
 * Deliberately shallow: it cannot verify that a source *says* what is claimed,
 * only that something checkable was offered. A URL, or a name with a year.
 * Rejecting "studies show" and "it is widely known" catches the failure that
 * actually happens, which is a confident sentence with nothing behind it.
 */
export function looksCitable(citation: string | null | undefined): boolean {
  if (!citation) return false;
  const text = citation.trim();
  if (text.length < 6) return false;
  if (/^https?:\/\/\S+$/i.test(text)) return true;
  /* A name and a four-digit year is the minimum a reader could go and check. */
  const hasYear = /\b(1[0-9]{3}|20[0-9]{2})\b/.test(text);
  const hasName = /[A-Z][a-z]{2,}/.test(text);
  const vague = /\b(studies show|experts say|it is (widely )?known|research suggests|some say)\b/i;
  return hasYear && hasName && !vague.test(text);
}

/**
 * Check a draft against the format that asked for it.
 *
 * Errors fail the piece; warnings are for an operator to weigh. The split is
 * along the same line the rest of the system draws: a missing slot or an
 * uncited claim is a defect, and prose that runs three words long is a
 * judgement.
 */
export function checkDraft(format: PostFormat, draft: FormatDraft): FormatCheck {
  const problems: SlotProblem[] = [];
  const wanted = expandSlots(format);
  const filled = new Map<string, FilledSlot>();
  for (const slot of draft.slots) {
    filled.set(`${slot.key}:${slot.index}`, slot);
  }

  const missing: string[] = [];
  for (const slot of wanted) {
    const got = filled.get(`${slot.key}:${slot.index}`);
    if (!got || got.text.trim().length === 0) {
      missing.push(slot.repeats && slot.repeats > 1 ? `${slot.key}[${slot.index}]` : slot.key);
      continue;
    }

    const words = wordCount(got.text);
    if (words > slot.maxWords) {
      problems.push({
        rule: 'format.slot_too_long',
        /*
         * A warning, not an error. The slot ceilings are what the layout can
         * hold comfortably, and §264 already refuses to truncate mid-word — so
         * an over-long slot degrades the card rather than breaking it, and an
         * operator can judge whether it is worth another attempt.
         */
        severity: 'warning',
        message: `${slot.key} runs ${words} words against a ${slot.maxWords} ceiling.`,
        slot: slot.key,
      });
    }

    if (requiresCitation(format) && !looksCitable(got.citation)) {
      problems.push({
        rule: 'format.uncited_claim',
        severity: 'error',
        message: `${slot.key} asserts something about the world with no citable source.`,
        slot: slot.key,
      });
    }
  }

  if (missing.length > 0) {
    problems.push({
      rule: 'format.incomplete',
      severity: 'error',
      message: `The format asked for ${wanted.length} slots and ${missing.length} were not filled: ${missing.join(', ')}.`,
    });
  }

  const errors = problems.filter((p) => p.severity === 'error');
  return {
    ok: errors.length === 0,
    problems,
    missing,
    summary:
      errors.length > 0
        ? `${errors.length} problem${errors.length === 1 ? '' : 's'} that fail the piece.`
        : problems.length > 0
          ? `Fills the format, with ${problems.length} thing${problems.length === 1 ? '' : 's'} to look at.`
          : `Fills all ${wanted.length} slots of the ${format.name.toLowerCase()} format.`,
  };
}

/**
 * Parse a writer reply into a draft, keeping only well-formed slots.
 *
 * Fails closed like every other parser here: an unusable reply yields an empty
 * draft, which `checkDraft` then reports as entirely missing. It never invents a
 * slot to fill a hole.
 */
export function parseDraft(raw: unknown, format: PostFormat): FormatDraft {
  const parsed = raw as { slots?: unknown } | null;
  const list = Array.isArray(parsed?.slots) ? parsed!.slots : [];
  const known = new Set(format.slots.map((s) => s.key));

  const slots: FilledSlot[] = [];
  for (const entry of list) {
    const item = entry as { key?: unknown; index?: unknown; text?: unknown; citation?: unknown };
    if (typeof item.key !== 'string' || !known.has(item.key)) continue;
    if (typeof item.text !== 'string' || item.text.trim().length === 0) continue;
    const index = Number.isInteger(item.index) ? (item.index as number) : 0;
    slots.push({
      key: item.key,
      index,
      text: item.text.trim(),
      citation: typeof item.citation === 'string' && item.citation.trim() ? item.citation.trim() : null,
    });
  }
  return { formatId: format.id, slots };
}
