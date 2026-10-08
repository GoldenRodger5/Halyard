/** Exact, campaign-bound readback. Unrecognized or incomplete listings cannot authorize a resend. */
export type SubmissionEvidence =
  | { status: "FOUND"; remote_id: string | null }
  | { status: "NOT_FOUND" }
  | { status: "UNKNOWN"; reason: string };

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function submissionEvidence(
  raw: string,
  campaignId: string,
  publicUrl: string,
): SubmissionEvidence {
  const roots: unknown[] = [];
  try {
    roots.push(JSON.parse(raw));
  } catch {
    /* HTML below, never substring proof. */
  }
  for (const m of raw.matchAll(
    /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      roots.push(JSON.parse(m[1] ?? ""));
    } catch {
      /* partial evidence */
    }
  }
  // Next Flight text chunks are data literals. Never execute scripts or resolve arbitrary code.
  for (const m of raw.matchAll(
    /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g,
  )) {
    try {
      const chunk: unknown = JSON.parse(m[1] ?? "");
      if (typeof chunk !== "string") continue;
      for (const line of chunk.split("\n")) {
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        try {
          roots.push(JSON.parse(line.slice(colon + 1)));
        } catch {
          /* unresolved row */
        }
      }
    } catch {
      /* malformed chunk */
    }
  }
  const queue = roots.map((value) => ({ value, depth: 0 }));
  let visited = 0;
  let complete = false;
  let malformed = false;
  for (let i = 0; i < queue.length && visited < 20_000; i++) {
    const entry = queue[i];
    if (!entry) continue;
    const { value, depth } = entry;
    visited++;
    if (queue.length > 20_000) {
      malformed = true;
      break;
    }
    if (depth > 24) {
      malformed = true;
      continue;
    }
    if (Array.isArray(value)) {
      queue.push(
        ...value.slice(0, 1000).map((v) => ({ value: v, depth: depth + 1 })),
      );
      if (value.length > 1000) malformed = true;
      continue;
    }
    if (!object(value)) continue;
    if (Array.isArray(value.submissions)) {
      const rows = value.submissions;
      if (rows.length > 1000) {
        malformed = true;
        continue;
      }
      for (const row of rows) {
        if (!object(row)) {
          malformed = true;
          continue;
        }
        const campaign =
          row.campaignId ??
          row.campaign_id ??
          (object(row.campaign) ? row.campaign.id : null);
        const url = row.url ?? row.public_url;
        if (typeof campaign !== "string" || typeof url !== "string") {
          malformed = true;
          continue;
        }
        if (campaign === campaignId && url === publicUrl)
          return {
            status: "FOUND",
            remote_id: typeof row.id === "string" ? row.id : null,
          };
      }
      // Absence is evidence only with an explicit, self-consistent complete listing.
      if (
        object(value.pagination) &&
        value.pagination.hasNextPage === false &&
        value.pagination.nextCursor === null &&
        value.pagination.total === rows.length
      )
        complete = true;
      else malformed = true;
    }
    queue.push(
      ...Object.values(value).map((v) => ({ value: v, depth: depth + 1 })),
    );
  }
  if (visited >= 20_000 || malformed || !complete)
    return {
      status: "UNKNOWN",
      reason: "CONTENT_REWARDS_LISTING_INCOMPLETE_OR_UNPARSEABLE",
    };
  return { status: "NOT_FOUND" };
}
