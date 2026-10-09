import { structuredDocuments } from "./submission-evidence";
/** Diagnostics carry schema paths/types and exact-target presence only, never strings, IDs, URLs or auth values.
 * Presence is NOT enrollment evidence. Limits/truncation prevent claiming a complete response inspection. */
export function responseShape(
  raw: string,
  campaignId: string,
  accountKey: string,
) {
  const roots = structuredDocuments(raw);
  const queue = roots.map((value) => ({ value, path: "$", depth: 0 }));
  const fields: { path: string; type: string }[] = [];
  let campaign = false,
    account = false,
    truncated = false;
  const privateKey =
    /token|cookie|auth|secret|password|nonce|session|credential|email|csrf|(?:^|_)key$/i;
  for (let i = 0; i < queue.length; i++) {
    if (i >= 200 || fields.length >= 100) {
      truncated = true;
      break;
    }
    const row = queue[i];
    if (!row) continue;
    if (row.depth > 6) {
      truncated = true;
      continue;
    }
    if (typeof row.value === "string") {
      campaign ||= row.value === campaignId;
      account ||= row.value === accountKey;
      continue;
    }
    if (!row.value || typeof row.value !== "object") continue;
    if (Array.isArray(row.value)) {
      if (row.value.length > 20) truncated = true;
      queue.push(
        ...row.value
          .slice(0, 20)
          .map((value) => ({
            value,
            path: row.path + "[]",
            depth: row.depth + 1,
          })),
      );
      continue;
    }
    const entries = Object.entries(row.value as Record<string, unknown>);
    if (entries.length > 40) truncated = true;
    for (const [key, value] of entries.slice(0, 40)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(key) || privateKey.test(key))
        continue;
      const path = row.path + "." + key;
      fields.push({
        path,
        type: Array.isArray(value)
          ? "array"
          : value === null
            ? "null"
            : typeof value,
      });
      queue.push({ value, path, depth: row.depth + 1 });
    }
  }
  return {
    structured_roots: roots.length,
    fields: fields.slice(0, 100),
    campaign_value_present: campaign,
    account_value_present: account,
    truncated,
  };
}
