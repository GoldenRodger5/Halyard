import { describe, expect, it } from "vitest";
import { enrollmentEvidence } from "./enrollment-evidence";
const row = {
  campaign_id: "campaign",
  account_key: "@actual",
  platform: "tiktok",
  submit_available: true,
  account_connected: true,
  application_state: "ACCEPTED",
};
describe("current campaign/account enrollment evidence", () => {
  it("a button and no disconnected warning prove nothing", () => {
    expect(
      enrollmentEvidence(
        "<button>Submit clip</button>",
        "campaign",
        "@actual",
        "tiktok",
      ),
    ).toMatchObject({
      status: "UNKNOWN",
      account_connected: null,
      application_state: "UNKNOWN",
    });
  });
  it("requires an exact campaign/account/platform binding", () => {
    for (const override of [
      { campaign_id: "other" },
      { account_key: "@other" },
      { platform: "youtube" },
    ])
      expect(
        enrollmentEvidence(
          JSON.stringify({ ...row, ...override }),
          "campaign",
          "@actual",
          "tiktok",
        ).status,
      ).toBe("UNKNOWN");
  });
  it("permits only explicit accepted/not-required and connected submit evidence", () => {
    expect(
      enrollmentEvidence(JSON.stringify(row), "campaign", "@actual", "tiktok")
        .status,
    ).toBe("READY");
    for (const state of ["PENDING", "REJECTED"])
      expect(
        enrollmentEvidence(
          JSON.stringify({ ...row, application_state: state }),
          "campaign",
          "@actual",
          "tiktok",
        ),
      ).toMatchObject({ status: "NOT_READY", application_state: state });
    expect(
      enrollmentEvidence(
        JSON.stringify({ ...row, account_connected: false }),
        "campaign",
        "@actual",
        "tiktok",
      ).status,
    ).toBe("NOT_READY");
  });
  it("does not infer brand approval from accepted application", () => {
    expect(
      enrollmentEvidence(JSON.stringify(row), "campaign", "@actual", "tiktok"),
    ).not.toHaveProperty("brand_approval");
  });
});
