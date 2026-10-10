/** Exact native capture. V2 owns interpretation; provider monitoring is distinct from approval and cash. */
export interface NativeReview {
  readonly remote_id: string;
  readonly native_review_status: string;
  readonly native_status: string;
  readonly flagged: boolean;
}
const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** Complete page validation; the caller scans every bounded page before accepting a unique exact record. */
export function nativeReviewPage(
  raw: unknown,
  campaignId: string,
  publicUrl: string,
  userId: string,
) {
  const unknown = {
    status: "UNKNOWN" as const,
    reason: "CONTENT_REWARDS_REVIEW_INCOMPLETE",
  };
  const e = object(raw);
  if (e?.success !== true || !Array.isArray(e.data) || e.data.length > 100)
    return unknown;
  const p = object(e.pagination);
  if (
    !p ||
    !Number.isInteger(p.count) ||
    p.count !== e.data.length ||
    !Number.isInteger(p.limit) ||
    Number(p.limit) < e.data.length ||
    Number(p.limit) > 100 ||
    !(
      p.nextCursor === null ||
      (typeof p.nextCursor === "string" &&
        p.nextCursor.length > 0 &&
        p.nextCursor.length <= 1024)
    )
  )
    return unknown;
  const matched: NativeReview[] = [];
  for (const value of e.data) {
    const row = object(value),
      post = object(row?.socialMediaPost);
    if (
      !row ||
      typeof row.id !== "string" ||
      !row.id ||
      row.id.length > 200 ||
      typeof row.campaignId !== "string" ||
      typeof row.isDeleted !== "boolean" ||
      typeof post?.postUrl !== "string"
    )
      return unknown;
    if (
      row.campaignId !== campaignId ||
      post.postUrl !== publicUrl ||
      row.isDeleted
    )
      continue;
    if (
      row.userId !== userId ||
      typeof row.reviewStatus !== "string" ||
      !/^[A-Za-z_-]{1,32}$/.test(row.reviewStatus) ||
      typeof row.status !== "string" ||
      !/^[A-Za-z_-]{1,32}$/.test(row.status) ||
      typeof row.flagged !== "boolean"
    )
      return unknown;
    matched.push({
      remote_id: row.id,
      native_review_status: row.reviewStatus,
      native_status: row.status,
      flagged: row.flagged,
    });
  }
  return {
    status: "PAGE" as const,
    matched,
    next_cursor: p.nextCursor as string | null,
  };
}
