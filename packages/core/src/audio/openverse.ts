/**
 * §311. Music the account is actually allowed to use.
 *
 * The bed library has six entries and every one is captioned
 * `[TEST] … synthesised test fixture, not licensed music`. §221's selector, the
 * ducking, the sidechain and the mix all work — against fixtures. So "music is
 * wired" was true of the code and false of the account, and any video that
 * shipped with a bed would have shipped with a test tone.
 *
 * ElevenLabs Music is not licensed for advertising and this is advertising, so
 * that path stays shut (§246). What was missing was a *source*.
 *
 * ## Why Openverse, and why CC0 only
 *
 * Openverse is the Creative Commons search API. No key, a real commercial-use
 * filter, and it indexes Freesound and Jamendo rather than hosting its own —
 * so the licence attached to a result is the one the uploader granted.
 *
 * **CC0 only, and this is not caution for its own sake.** CC-BY is free and
 * legal and requires attribution *on every use* — which for a social video
 * means a credit line in a caption written by a copywriter that does not know
 * it is there, on a platform that truncates captions. A licence obligation that
 * depends on a caption surviving is an obligation that will be broken. CC0 is
 * public domain: nothing to carry, nothing to truncate, nothing to breach.
 *
 * Everything here still records where a track came from, because "we believe
 * this is CC0" and "the API said CC0 on this date and here is the page" are
 * different claims, and only the second survives being asked.
 */

export interface MusicCandidate {
  /** Openverse's id, stable enough to deduplicate against. */
  id: string;
  title: string;
  /** Direct audio URL. */
  url: string;
  /** The page a human can check the licence on. */
  foreignLandingUrl: string;
  /** Always 'cc0' here; carried so the record is explicit rather than implied. */
  license: string;
  creator: string | null;
  /** Seconds. Null when the index does not know, which is common. */
  durationSeconds: number | null;
  provider: string | null;
}

export interface OpenverseSearch {
  /** What kind of bed is wanted, in the words a music library would use. */
  query: string;
  /** How many to consider. */
  limit?: number;
  /**
   * The shortest usable bed, in seconds.
   *
   * A bed shorter than the video has to loop, and a loop with an audible seam
   * is worse than no music — it is the single most recognisable sign of a
   * template. Short-form runs to about 45s, so 30 is the floor at which one
   * loop is survivable.
   */
  minSeconds?: number;
}

const ENDPOINT = 'https://api.openverse.org/v1/audio/';

/**
 * Search for beds that are safe to publish under.
 *
 * Returns candidates, never a decision: §221's `selectBed` chooses which bed
 * suits a piece, and that judgement does not move here. This only answers "what
 * may we legally use", which is a different question and a factual one.
 */
export async function searchCc0Music(
  search: OpenverseSearch,
  fetchImpl: typeof fetch = fetch,
): Promise<MusicCandidate[]> {
  const params = new URLSearchParams({
    q: search.query,
    /*
     * Both filters, deliberately. `license=cc0` is the specific grant and
     * `license_type=commercial` is Openverse's own commercial-use screen —
     * belt and braces on the one question that has legal consequences.
     */
    license: 'cc0',
    license_type: 'commercial',
    page_size: String(Math.min(50, search.limit ?? 20)),
  });

  const response = await fetchImpl(`${ENDPOINT}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Openverse returned ${response.status} searching for "${search.query}".`);
  }

  const body = (await response.json()) as {
    results?: Array<{
      id?: string;
      title?: string;
      url?: string;
      foreign_landing_url?: string;
      license?: string;
      creator?: string | null;
      duration?: number | null;
      provider?: string | null;
    }>;
  };

  const minSeconds = search.minSeconds ?? 30;

  return (body.results ?? [])
    .filter((r) => {
      if (!r.id || !r.url) return false;
      /*
       * Trust the filter and check it anyway. A licence is the one field where
       * taking the API's word for it and being wrong is not a rendering bug.
       */
      if ((r.license ?? '').toLowerCase() !== 'cc0') return false;
      /* `duration` is milliseconds. Unknown is allowed through and flagged. */
      if (r.duration != null && r.duration / 1000 < minSeconds) return false;
      return true;
    })
    .map((r) => ({
      id: r.id!,
      title: r.title ?? 'Untitled',
      url: r.url!,
      foreignLandingUrl: r.foreign_landing_url ?? '',
      license: 'cc0',
      creator: r.creator ?? null,
      durationSeconds: r.duration == null ? null : Math.round(r.duration / 1000),
      provider: r.provider ?? null,
    }));
}

/**
 * The searches that cover what the bed selector can ask for.
 *
 * Keyed by the mood `selectBed` reasons about, so importing "everything the
 * director might want" is one loop rather than a person guessing search terms.
 * A mood with no usable result is a gap the import reports rather than papering
 * over with a bed from a different mood — a calm explainer under an upbeat loop
 * is worse than silence.
 */
export const BED_SEARCHES: Record<string, { query: string; energy: number }> = {
  /*
   * Queries were tuned against the live index rather than written from
   * intuition: "warm acoustic instrumental loop" returned nothing over 30s and
   * "acoustic guitar instrumental" returns a usable set. A search term nobody
   * has run is a guess, and a mood that silently finds nothing is a mood the
   * selector will fill with a bed that does not suit the piece.
   */
  warm: { query: 'acoustic guitar instrumental', energy: 0.4 },
  bright: { query: 'bright upbeat instrumental music', energy: 0.7 },
  calm: { query: 'calm ambient instrumental', energy: 0.2 },
  driving: { query: 'groove bass loop music', energy: 0.8 },
  playful: { query: 'playful light instrumental', energy: 0.6 },
  tense: { query: 'tense atmospheric drone', energy: 0.5 },
  melancholy: { query: 'melancholy piano instrumental', energy: 0.25 },
  confident: { query: 'cinematic music', energy: 0.65 },
};
