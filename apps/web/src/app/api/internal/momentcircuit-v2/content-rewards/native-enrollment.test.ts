import { describe, it, expect } from "vitest";
import { nativeEnrollmentEvidence } from "./native-enrollment";
const campaignId = "11111111-1111-4111-8111-111111111111";
const envelope = (data: unknown) => ({ success: true, data });
const base = () => ({
  campaignId,
  accountKey: "creator",
  platform: "tiktok",
  identity: envelope({ id: "self" }),
  accounts: envelope({
    socialMediaAccounts: [
      {
        id: "account-1",
        userId: "self",
        platform: "tiktok",
        username: "creator",
        status: "active",
        verificationSource: "bio",
      },
    ],
  }),
  campaign: envelope({
    id: campaignId,
    joined: true,
    requiresApplication: false,
    access: { canSubmit: true },
    configuration: { requirement: { preApproval: true } },
  }),
  applications: envelope({ applications: [], partialFailure: false }),
});
describe("current authenticated enrollment contracts", () => {
  it("proves exact active posting account enrollment without granting brand approval", () => {
    expect(nativeEnrollmentEvidence(base())).toMatchObject({
      status: "READY",
      account_connected: true,
      application_state: "NOT_REQUIRED",
      facts: { brand_approval: "UNPROVEN", join_action_supported: false },
    });
  });
  it("canSubmit without joined is NOT_READY", () => {
    const x = base();
    x.campaign = envelope({
      id: campaignId,
      joined: false,
      requiresApplication: false,
      access: { canSubmit: true },
    });
    expect(nativeEnrollmentEvidence(x)).toMatchObject({
      status: "NOT_READY",
      facts: { reason: "NOT_JOINED" },
    });
  });
  it.each(["identity", "accounts", "campaign"])(
    "HTTP 200 without %s evidence is UNKNOWN",
    (key) => {
      const x = base();
      Object.assign(x, { [key]: { success: true, data: {} } });
      expect(nativeEnrollmentEvidence(x).status).toBe("UNKNOWN");
    },
  );
  it("does not transfer another campaign's identity or another account's connection", () => {
    const x = base();
    x.accounts = envelope({
      socialMediaAccounts: [
        {
          id: "other",
          userId: "foreign",
          username: "creator",
          platform: "tiktok",
          status: "active",
          verificationSource: "bio",
        },
      ],
    });
    expect(nativeEnrollmentEvidence(x).status).toBe("UNKNOWN");
  });
  it("separates application acceptance from joined and posting-account approval", () => {
    const x = base();
    x.campaign = envelope({
      id: campaignId,
      joined: true,
      requiresApplication: true,
      access: { canSubmit: true },
    });
    x.applications = envelope({
      partialFailure: false,
      applications: [
        { campaignId, status: "approved", socialAccountIds: ["other"] },
      ],
    });
    expect(nativeEnrollmentEvidence(x)).toMatchObject({
      status: "NOT_READY",
      application_state: "UNKNOWN",
    });
    x.applications = envelope({
      partialFailure: false,
      applications: [
        { campaignId, status: "approved", socialAccountIds: ["account-1"] },
      ],
    });
    expect(nativeEnrollmentEvidence(x)).toMatchObject({
      status: "READY",
      application_state: "ACCEPTED",
      facts: { brand_approval: "UNPROVEN" },
    });
  });
  it.each(["pending", "rejected"])("keeps %s explicit", (status) => {
    const x = base();
    x.campaign = envelope({
      id: campaignId,
      joined: true,
      requiresApplication: true,
      access: { canSubmit: true },
    });
    x.applications = envelope({
      partialFailure: false,
      applications: [{ campaignId, status }],
    });
    expect(nativeEnrollmentEvidence(x)).toMatchObject({
      status: "NOT_READY",
      application_state: status.toUpperCase(),
    });
  });
  it("partial application listing cannot prove acceptance", () => {
    const x = base();
    x.campaign = envelope({
      id: campaignId,
      joined: true,
      requiresApplication: true,
      access: { canSubmit: true },
    });
    x.applications = envelope({ partialFailure: true, applications: [] });
    expect(nativeEnrollmentEvidence(x).status).toBe("UNKNOWN");
  });
  it("duplicate account rows cannot prove identity", () => {
    const x = base();
    x.accounts = envelope({
      socialMediaAccounts: [
        {
          id: "1",
          userId: "self",
          platform: "tiktok",
          username: "creator",
          status: "active",
          verificationSource: "bio",
        },
        {
          id: "2",
          userId: "self",
          platform: "tiktok",
          username: "creator",
          status: "active",
          verificationSource: "bio",
        },
      ],
    });
    expect(nativeEnrollmentEvidence(x).status).toBe("UNKNOWN");
  });
});

it("unknown account contract values stay UNKNOWN rather than disconnected", () => {
  const x = base();
  x.accounts = envelope({
    socialMediaAccounts: [
      {
        id: "account-1",
        userId: "self",
        platform: "tiktok",
        username: "creator",
        status: "active",
        verificationSource: "new-provider-mechanism",
      },
    ],
  });
  expect(nativeEnrollmentEvidence(x)).toMatchObject({
    status: "UNKNOWN",
    account_connected: null,
  });
});
