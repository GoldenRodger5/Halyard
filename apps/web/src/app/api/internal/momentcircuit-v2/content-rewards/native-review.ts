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

/** Identity of a public post for review matching. TikTok stays exact-string (its handle check lives in the route).
 * Instagram/YouTube URLs carry no handle; only their media id is compared, so the same post matches across the
 * forms Content Rewards stores (www/bare host, trailing slash, /reel/ vs /p/, /shorts/ID vs watch?v=ID).
 * Anything else, including credentials or ports in the URL, has no identity and never matches. */
export function reviewPostKey(platform: string, raw: string): string | null {
  if (platform === "tiktok") return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  if (platform === "instagram") {
    const m = /^\/(?:reel|p)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname);
    return ["www.instagram.com", "instagram.com"].includes(url.hostname) && m
      ? `instagram:${m[1]}`
      : null;
  }
  if (platform === "youtube") {
    if (
      !["www.youtube.com", "youtube.com", "m.youtube.com"].includes(
        url.hostname,
      )
    )
      return null;
    const id =
      url.pathname === "/watch" || url.pathname === "/watch/"
        ? url.searchParams.getAll("v").length === 1
          ? url.searchParams.get("v")
          : null
        : (/^\/shorts\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null);
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `youtube:${id}` : null;
  }
  return null;
}

/** Complete page validation; the caller scans every bounded page before accepting a unique exact record. */
export function nativeReviewPage(
  raw: unknown,
  campaignId: string,
  publicUrl: string,
  userId: string,
  platform = "tiktok",
) {
  const key = reviewPostKey(platform, publicUrl);
  const unknown = {
    status: "UNKNOWN" as const,
    reason: "CONTENT_REWARDS_REVIEW_INCOMPLETE",
  };
  const e = object(raw);
  if (e?.success !== true || !Array.isArray(e.data) || e.data.length > 100)
    return unknown;
  if (key === null) return unknown;
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
      reviewPostKey(platform, post.postUrl) !== key ||
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
