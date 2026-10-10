import { describe, expect, it } from "vitest";
import { nativeReviewPage } from "./native-review";
import { nativeJson } from "./native-json";

const campaign = "campaign",
  url = "https://www.tiktok.com/@creator/video/123";
const row = {
  id: "submission",
  campaignId: campaign,
  userId: "self",
  isDeleted: false,
  socialMediaPost: { postUrl: url },
  reviewStatus: "approved",
  flagged: false,
  status: "unrelated-payment-status",
};
const page = (rows: unknown[], cursor: string | null = null) => ({
  success: true,
  data: rows,
  pagination: { count: rows.length, limit: 20, nextCursor: cursor },
});
describe("exact native reward review", () => {
  it.each(["pending", "approved", "rejected", "flagged"])(
    "captures separate native fields %s without inferring approval or payment",
    (reviewStatus) => {
      expect(
        nativeReviewPage(
          page([{ ...row, reviewStatus }]),
          campaign,
          url,
          "self",
        ),
      ).toEqual({
        status: "PAGE",
        matched: [
          {
            remote_id: "submission",
            native_review_status: reviewStatus,
            native_status: row.status,
            flagged: false,
          },
        ],
        next_cursor: null,
      });
    },
  );
  it.each([
    { campaignId: "foreign" },
    { socialMediaPost: { postUrl: url + "4" } },
    { isDeleted: true },
  ])(
    "does not match a different campaign, URL prefix or deleted record",
    (change) => {
      expect(
        nativeReviewPage(page([{ ...row, ...change }]), campaign, url, "self"),
      ).toMatchObject({ status: "PAGE", matched: [] });
    },
  );
  it.each([
    { userId: "foreign" },
    { status: null },
    { reviewStatus: null },
    { flagged: undefined },
    { socialMediaPost: null },
  ])("keeps malformed/foreign review unknown", (change) => {
    expect(
      nativeReviewPage(page([{ ...row, ...change }]), campaign, url, "self")
        .status,
    ).toBe("UNKNOWN");
  });
  it("requires explicit complete pagination and surfaces the next page", () => {
    expect(
      nativeReviewPage({ success: true, data: [row] }, campaign, url, "self")
        .status,
    ).toBe("UNKNOWN");
    expect(
      nativeReviewPage(
        {
          ...page([row]),
          pagination: { count: 2, limit: 20, nextCursor: null },
        },
        campaign,
        url,
        "self",
      ).status,
    ).toBe("UNKNOWN");
    expect(
      nativeReviewPage(page([row], "next"), campaign, url, "self"),
    ).toMatchObject({ status: "PAGE", next_cursor: "next" });
  });
  it("rejects duplicate keys in original JSON including escaped keys", () => {
    expect(nativeJson('{"success":true,"data":[],"success":false}')).toBeNull();
    expect(nativeJson('{"data":{"id":"a","\\u0069d":"b"}}')).toBeNull();
    expect(nativeJson('{"data":[{"id":"a"},{"id":"b"}]}')).not.toBeNull();
  });
  it("bounds bytes, depth and credential fields in exported captures", () => {
    expect(nativeJson('"long"', 2)).toBeNull();
    expect(nativeJson("[".repeat(33) + "0" + "]".repeat(33))).toBeNull();
    expect(nativeJson('{"accessToken":"fixture"}', 100, true)).toBeNull();
    expect(
      nativeJson(
        JSON.stringify({ message: 'a string containing "id": is inert' }),
      ),
    ).not.toBeNull();
  });
});
