/** Campaign-owned native API evidence, without cookies/headers or unrelated response envelopes. */
export function campaignCapture(
  raw: string,
  campaignId: string,
): string | null {
  if (Buffer.byteLength(raw, "utf8") > 200_000) return null;
  const stack: (Set<string> | null)[] = [];
  let tokens = 0;
  for (const m of raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]]/g)) {
    if (++tokens > 20_000) return null;
    if (m[0] === "{" || m[0] === "[") {
      stack.push(m[0] === "{" ? new Set() : null);
      if (stack.length > 32) return null;
    } else if (m[0] === "}" || m[0] === "]") stack.pop();
    else if (/^\s*:/.test(raw.slice(m.index + m[0].length))) {
      let key: string;
      try {
        key = JSON.parse(m[0]) as string;
      } catch {
        return null;
      }
      if (
        /cookie|secret|password|session|credential|access.?token|refresh.?token/i.test(
          key,
        )
      )
        return null;
      const keys = stack.at(-1);
      if (keys?.has(key)) return null;
      keys?.add(key);
    }
  }
  try {
    const envelope = JSON.parse(raw) as {
      success?: unknown;
      data?: Record<string, unknown>;
    };
    const c = envelope.data;
    if (
      envelope.success !== true ||
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
