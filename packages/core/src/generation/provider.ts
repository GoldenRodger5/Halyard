/**
 * §491. A provider that has said no is not a per-call hiccup.
 *
 * OpenAI ran out of credits in the middle of photographing a tips piece. The
 * image client threw a generic `Error("Image generation failed: HTTP 429 …")`,
 * `generateHeroImage` caught it and returned null — its documented behaviour
 * for "a generation outage must not take the whole run down" — and the loop
 * asked three more times. Six of nine beats fell back to the hero image, the
 * piece rendered as one photograph behind four text changes (§407's exact
 * defect, back as a fallback), and `review_media` died on the same 429 with
 * the piece still in the approval queue, unmeasured.
 *
 * Two refusals look alike and mean different things. A transient failure — a
 * timeout, a 500, a 503 — is per call, and falling back is right. A refusal
 * that says *the account cannot pay* or *the key is wrong* — 401, 402, 403,
 * 429 with a quota or credits message — is a fact about the run: the next
 * call will get the same answer and so will the next piece. That one has to
 * stop the run, mark the piece with the reason, and be visible to a person.
 * This is the vocabulary that lets each caller tell them apart in code.
 */
export class ProviderUnavailable extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    message: string,
    /** True when no retry and no other piece will get a different answer. */
    public readonly exhausted: boolean,
  ) {
    super(`${provider} ${status}: ${message}`);
    this.name = 'ProviderUnavailable';
  }
}

const EXHAUSTED_STATUSES = new Set([401, 402, 403]);
const EXHAUSTED_MESSAGE = /credit|quota|billing|insufficient|exceeded your current|payment/i;

/** Whether a refusal with this status and body means the account, not the call, is the problem. */
export function refusalIsExhausted(status: number, body: string): boolean {
  if (EXHAUSTED_STATUSES.has(status)) return true;
  return status === 429 && EXHAUSTED_MESSAGE.test(body);
}

export function providerRefusal(provider: string, status: number, body: string): ProviderUnavailable {
  return new ProviderUnavailable(provider, status, body.slice(0, 300), refusalIsExhausted(status, body));
}

/** True for an error this module raised with `exhausted` set. Safe on anything. */
export function isProviderExhausted(err: unknown): err is ProviderUnavailable {
  return err instanceof ProviderUnavailable && err.exhausted;
}
