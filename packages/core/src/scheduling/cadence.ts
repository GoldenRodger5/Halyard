/**
 * Per-format cadence ceilings. Milestone 27, Part E.
 *
 * The scheduler already caps posts per platform per day. That is the wrong axis
 * for video: three to five short videos a week keeps the algorithm confident,
 * below three the account is treated as lower priority, and above seven quality
 * drops and average retention degrades — which pulls the channel-level signal
 * down with it.
 *
 * So the ceiling is weekly and per format, and the *floor* matters as much as
 * the ceiling. A floor is the only thing that catches the failure where the
 * queue quietly fills with cheap text posts.
 */

export interface CadenceRule {
  format: string;
  weeklyFloor: number;
  weeklyCeiling: number;
  reason?: string | null;
}

export const DEFAULT_CADENCE: CadenceRule[] = [
  {
    format: 'video',
    weeklyFloor: 3,
    weeklyCeiling: 5,
    reason:
      'Below three per week the algorithm treats the account as lower priority. Above seven, quality drops and average retention degrades, which pulls the channel-level signal down.',
  },
  { format: 'carousel', weeklyFloor: 2, weeklyCeiling: 5, reason: 'Expensive to make well.' },
  { format: 'image', weeklyFloor: 2, weeklyCeiling: 7, reason: null },
  {
    format: 'text',
    weeklyFloor: 3,
    weeklyCeiling: 14,
    reason: 'Cheap to produce and cheap to ignore. The ceiling stops text crowding everything else out.',
  },
  {
    format: 'pin',
    weeklyFloor: 5,
    weeklyCeiling: 35,
    reason: 'Pinterest is a search index, not a feed. Volume works here and nowhere else.',
  },
];

export interface CadenceState {
  /** Posts published or scheduled in the trailing seven days, per format. */
  thisWeek: Record<string, number>;
}

export type CadenceVerdict =
  | { allowed: true; headroom: number; note?: string }
  | { allowed: false; reason: string };

export function checkCadence(
  format: string,
  state: CadenceState,
  rules: CadenceRule[] = DEFAULT_CADENCE,
): CadenceVerdict {
  const rule = rules.find((r) => r.format === format);
  if (!rule) return { allowed: true, headroom: Number.POSITIVE_INFINITY };

  const used = state.thisWeek[format] ?? 0;
  if (used >= rule.weeklyCeiling) {
    return {
      allowed: false,
      reason: `${format} is at its weekly ceiling of ${rule.weeklyCeiling}.${
        rule.reason ? ` ${rule.reason}` : ''
      }`,
    };
  }

  return {
    allowed: true,
    headroom: rule.weeklyCeiling - used,
    note:
      used < rule.weeklyFloor
        ? `${used} of a ${rule.weeklyFloor} weekly floor. Under-posting this format costs reach.`
        : undefined,
  };
}

/**
 * Formats that are behind their floor, worst first. The idea engine uses this to
 * bias selection the same way it uses mix debt — a format nobody is filling is a
 * debt, not a preference.
 */
export function cadenceDebt(
  state: CadenceState,
  rules: CadenceRule[] = DEFAULT_CADENCE,
): Array<{ format: string; short: number; floor: number; used: number }> {
  return rules
    .map((rule) => ({
      format: rule.format,
      used: state.thisWeek[rule.format] ?? 0,
      floor: rule.weeklyFloor,
      short: Math.max(0, rule.weeklyFloor - (state.thisWeek[rule.format] ?? 0)),
    }))
    .filter((row) => row.short > 0)
    .sort((a, b) => b.short - a.short);
}

/**
 * Operator-facing summary for the dashboard. Reads as a sentence rather than a
 * table, because the only useful question is "what should I make next".
 */
export function cadenceSummary(
  state: CadenceState,
  rules: CadenceRule[] = DEFAULT_CADENCE,
): string {
  const debt = cadenceDebt(state, rules);
  const capped = rules.filter((r) => (state.thisWeek[r.format] ?? 0) >= r.weeklyCeiling);

  if (debt.length === 0 && capped.length === 0) return 'Every format is inside its weekly band.';

  const parts: string[] = [];
  if (debt.length > 0) {
    parts.push(
      `Behind on ${debt.map((d) => `${d.format} (${d.used} of ${d.floor})`).join(', ')}.`,
    );
  }
  if (capped.length > 0) {
    parts.push(`At the ceiling on ${capped.map((c) => c.format).join(', ')}.`);
  }
  return parts.join(' ');
}
