/** Observed CR review vocabulary: review is distinct from enrollment, drafts, earnings and settlement. */
export interface NativeReview {
  readonly remote_id: string;
  readonly review_status: "pending" | "approved" | "rejected" | "flagged";
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
      !["pending", "approved", "rejected", "flagged"].includes(
        row.reviewStatus,
      ) ||
      typeof row.flagged !== "boolean"
    )
      return unknown;
    matched.push({
      remote_id: row.id,
      review_status: row.reviewStatus as NativeReview["review_status"],
      flagged: row.flagged,
    });
  }
  return {
    status: "PAGE" as const,
    matched,
    next_cursor: p.nextCursor as string | null,
  };
}
