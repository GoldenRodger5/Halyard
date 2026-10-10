/** Bounded original JSON parsing: duplicate keys cannot disappear through JSON.parse. */
export function nativeJson(
  raw: string,
  maxBytes = 1_000_000,
  rejectCredentials = false,
): unknown {
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return null;
  const stack: (Set<string> | null)[] = [];
  let tokens = 0;
  try {
    for (const m of raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]]/g)) {
      if (++tokens > 20_000) return null;
      if (m[0] === "{" || m[0] === "[") {
        stack.push(m[0] === "{" ? new Set() : null);
        if (stack.length > 32) return null;
      } else if (m[0] === "}" || m[0] === "]") stack.pop();
      else if (/^\s*:/.test(raw.slice(m.index + m[0].length))) {
        const key = JSON.parse(m[0]) as string;
        if (
          rejectCredentials &&
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
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
