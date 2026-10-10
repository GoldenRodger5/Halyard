import { nativeJson } from "./native-json";
/** Campaign-owned native API evidence, without cookies/headers or unrelated response envelopes. */
export function campaignCapture(
  raw: string,
  campaignId: string,
): string | null {
  try {
    const envelope = nativeJson(raw, 200_000, true) as {
      success?: unknown;
      data?: Record<string, unknown>;
    };
    const c = envelope?.data;
    if (
      envelope?.success !== true ||
      !c ||
      Array.isArray(c) ||
      c.id !== campaignId ||
      c.briefCounts !== undefined ||
      !c.configuration ||
      typeof c.configuration !== "object" ||
      Array.isArray(c.configuration)
    )
      return null;
    // Return the original encoded API bytes. V2's canonical campaign parser remains the sole parser
    // for briefs, structured sources, approval and terms. No erased duplicate key can acquire authority.
    return raw;
  } catch {
    return null;
  }
}
