import { describe, it, expect } from "vitest";
import { nativeSubmissionPage } from "./native-submission";
const c = "campaign",
  u = "https://www.tiktok.com/@creator/video/1";
const page = (data: unknown[], nextCursor: unknown = null) => ({
  success: true,
  data,
  pagination: { count: data.length, limit: 20, nextCursor },
});
const row = (campaignId = c, postUrl = u) => ({
  id: "s1",
  campaignId,
  isDeleted: false,
  socialMediaPost: { postUrl },
});
describe("native exact submission readback", () => {
  it("matches campaign and nested public URL on the same row", () =>
    expect(nativeSubmissionPage(page([row()]), c, u)).toEqual({
      status: "FOUND",
      remote_id: "s1",
    }));
  it.each([row("foreign"), row(c, u + "2"), { ...row(), isDeleted: true }])(
    "does not accept foreign, prefix or deleted rows",
    (r) =>
      expect(nativeSubmissionPage(page([r]), c, u)).toEqual({
        status: "NOT_FOUND",
      }),
  );
  it("terminal cursor and exact count establish absence", () =>
    expect(nativeSubmissionPage(page([]), c, u)).toEqual({
      status: "NOT_FOUND",
    }));
  it("a malformed next cursor is UNKNOWN", () => {
    expect(nativeSubmissionPage(page([], 17), c, u).status).toBe("UNKNOWN");
  });
  it("a nonterminal cursor requires another bounded page", () =>
    expect(nativeSubmissionPage(page([], "cursor"), c, u)).toEqual({
      status: "NEXT_PAGE",
      cursor: "cursor",
    }));
  it("omitted cursor, partial counts and malformed records cannot prove absence", () => {
    expect(
      nativeSubmissionPage(
        { success: true, data: [], pagination: { count: 0, limit: 20 } },
        c,
        u,
      ).status,
    ).toBe("UNKNOWN");
    expect(
      nativeSubmissionPage(
        { ...page([]), pagination: { count: 17, limit: 20, nextCursor: null } },
        c,
        u,
      ).status,
    ).toBe("UNKNOWN");
    expect(
      nativeSubmissionPage(
        page([{ ...row(), socialMediaPost: { postUrl: null } }]),
        c,
        u,
      ).status,
    ).toBe("UNKNOWN");
  });
});
