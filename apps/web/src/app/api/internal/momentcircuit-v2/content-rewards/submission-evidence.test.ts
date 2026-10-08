import { describe, expect, it } from "vitest";
import { submissionEvidence } from "./submission-evidence";
const campaign = "campaign-A";
const url = "https://www.tiktok.com/@account/video/123";
const listing = (rows: unknown[], complete = true) =>
  JSON.stringify({
    submissions: rows,
    pagination: {
      hasNextPage: !complete,
      nextCursor: complete ? null : "next",
      total: complete ? rows.length : 200,
    },
  });
describe("exact campaign-bound CR evidence", () => {
  it("accepts only the exact campaign and exact URL together", () => {
    expect(
      submissionEvidence(
        listing([{ id: "submission-1", campaignId: campaign, url }]),
        campaign,
        url,
      ),
    ).toEqual({ status: "FOUND", remote_id: "submission-1" });
  });
  it.each([
    { campaignId: "campaign-B", url },
    { campaignId: campaign, url: url + "4" },
    { campaignId: campaign, url: "https://other.example/?q=" + url },
  ])("rejects mismatched campaign and substring URLs: %j", (row) => {
    expect(submissionEvidence(listing([row]), campaign, url)).toEqual({
      status: "NOT_FOUND",
    });
  });
  it("requires complete pagination to prove NOT_FOUND", () => {
    expect(submissionEvidence(listing([], false), campaign, url)).toMatchObject(
      { status: "UNKNOWN" },
    );
  });
  it("permits positive exact readback in a partial listing", () => {
    expect(
      submissionEvidence(
        listing([{ campaign_id: campaign, public_url: url }], false),
        campaign,
        url,
      ),
    ).toMatchObject({ status: "FOUND" });
  });
  it.each([
    "<html>" + url + "</html>",
    JSON.stringify({ message: url }),
    "not JSON",
    JSON.stringify({
      submissions: [{ url }],
      pagination: { hasNextPage: false, nextCursor: null, total: 1 },
    }),
  ])("unrecognized evidence stays UNKNOWN", (raw) => {
    expect(submissionEvidence(raw, campaign, url)).toMatchObject({
      status: "UNKNOWN",
    });
  });
  it("reads structured JSON in HTML without executing scripts", () => {
    expect(
      submissionEvidence(
        '<script type="application/json">' +
          listing([{ campaignId: campaign, url }]) +
          "</script>",
        campaign,
        url,
      ),
    ).toMatchObject({ status: "FOUND" });
  });
});
