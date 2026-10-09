/** Observed authenticated submissions envelope. No neighboring object or URL substring can qualify. */
export function nativeSubmissionPage(
  raw: unknown,
  campaignId: string,
  publicUrl: string,
) {
  const unknown = {
    status: "UNKNOWN" as const,
    reason: "CONTENT_REWARDS_LISTING_INCOMPLETE",
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return unknown;
  const e = raw as { success?: unknown; data?: unknown; pagination?: unknown };
  if (e.success !== true || !Array.isArray(e.data) || e.data.length > 100)
    return unknown;
  let malformed = false;
  for (const v of e.data) {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      malformed = true;
      continue;
    }
    const r = v as {
      id?: unknown;
      campaignId?: unknown;
      isDeleted?: unknown;
      socialMediaPost?: { postUrl?: unknown };
    };
    if (
      typeof r.id !== "string" ||
      !r.id ||
      typeof r.campaignId !== "string" ||
      typeof r.isDeleted !== "boolean" ||
      typeof r.socialMediaPost?.postUrl !== "string"
    ) {
      malformed = true;
      continue;
    }
    if (
      r.isDeleted === false &&
      r.campaignId === campaignId &&
      r.socialMediaPost.postUrl === publicUrl
    )
      return { status: "FOUND" as const, remote_id: r.id };
  }
  if (
    malformed ||
    !e.pagination ||
    typeof e.pagination !== "object" ||
    Array.isArray(e.pagination)
  )
    return unknown;
  const p = e.pagination as {
    count?: unknown;
    limit?: unknown;
    nextCursor?: unknown;
  };
  if (
    !Number.isInteger(p.count) ||
    p.count !== e.data.length ||
    !Number.isInteger(p.limit) ||
    Number(p.limit) < e.data.length ||
    Number(p.limit) > 100
  )
    return unknown;
  if (p.nextCursor === null) return { status: "NOT_FOUND" as const };
  if (
    typeof p.nextCursor === "string" &&
    p.nextCursor.length > 0 &&
    p.nextCursor.length <= 1024
  )
    return { status: "NEXT_PAGE" as const, cursor: p.nextCursor };
  return unknown;
}
