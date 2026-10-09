import { expect, it } from "vitest";
import { responseShape } from "./response-shape";
import { enrollmentEvidence } from "./enrollment-evidence";
const campaign = "00000000-0000-4000-8000-000000000001";
const account = "momentcircuit0";
it("diagnoses schema without returning values or secret-bearing field names", () => {
  const raw = JSON.stringify({
    campaign_id: campaign,
    handle: account,
    nested: {
      password: "private-password",
      session: "private-cookie",
      access_token: "private-token",
    },
    url: "https://private.example/?token=private-token",
  });
  const shape = responseShape(raw, campaign, account);
  expect(shape.campaign_value_present).toBe(true);
  expect(shape.account_value_present).toBe(true);
  const out = JSON.stringify(shape);
  for (const value of [
    campaign,
    account,
    "private-password",
    "private-cookie",
    "private-token",
    "https://private.example",
    "password",
    "access_token",
  ])
    expect(out).not.toContain(value);
});
it("bounds diagnosis and keeps presence separate from acceptance", () => {
  const raw = JSON.stringify({
    rows: Array.from({ length: 1000 }, () => ({
      campaign_id: campaign,
      handle: account,
    })),
  });
  expect(responseShape(raw, campaign, account).truncated).toBe(true);
  expect(enrollmentEvidence(raw, campaign, account, "tiktok").status).toBe(
    "UNKNOWN",
  );
});
it("reads known exact enrollment records from literal Next Flight data without executing scripts", () => {
  const row = {
    campaign_id: campaign,
    account_key: account,
    platform: "tiktok",
    submit_available: true,
    account_connected: true,
    application_state: "NOT_REQUIRED",
  };
  const chunk = "1:" + JSON.stringify(row) + "\n";
  const raw =
    "<script>self.__next_f.push([1," + JSON.stringify(chunk) + "])</script>";
  expect(enrollmentEvidence(raw, campaign, account, "tiktok").status).toBe(
    "READY",
  );
  expect(
    enrollmentEvidence(raw, campaign + "2", account, "tiktok").status,
  ).toBe("UNKNOWN");
});
