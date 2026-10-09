/** Current first-party JSON contracts; an HTTP success is never enrollment evidence. */
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const data = (v: unknown) => {
  const r = record(v);
  return r?.success === true ? record(r.data) : null;
};
export interface NativeEnrollmentProbe {
  status: string;
  submit_available: boolean;
  account_connected: boolean | null;
  application_state: string;
  facts: Record<string, string | number | boolean | null>;
}
export function nativeEnrollmentEvidence(input: {
  campaignId: string;
  accountKey: string;
  platform: string;
  identity: unknown;
  accounts: unknown;
  campaign: unknown;
  applications: unknown;
}): NativeEnrollmentProbe {
  const facts: Record<string, string | number | boolean | null> = {
    evidence: "AUTHENTICATED_FIRST_PARTY_API",
    campaign_id: input.campaignId,
    account_key: input.accountKey,
    platform: input.platform,
    brand_approval: "UNPROVEN",
    join_action_supported: false,
    application_action_supported: false,
  };
  const unknown = () => ({
    status: "UNKNOWN",
    submit_available: false,
    account_connected: null,
    application_state: "UNKNOWN",
    facts: {
      ...facts,
      reason: "CAMPAIGN_ACCOUNT_ENROLLMENT_EVIDENCE_UNPROVEN",
    },
  });
  const me = data(input.identity),
    accounts = data(input.accounts),
    c = data(input.campaign);
  if (
    typeof me?.id !== "string" ||
    !me.id ||
    c?.id !== input.campaignId ||
    typeof c.joined !== "boolean" ||
    typeof c.requiresApplication !== "boolean" ||
    typeof record(c.access)?.canSubmit !== "boolean" ||
    !Array.isArray(accounts?.socialMediaAccounts) ||
    accounts.socialMediaAccounts.length > 1000
  )
    return unknown();
  // Product handles use one @ prefix; the provider's username field omits it.
  // Do not normalize display names, case, substrings or multiple prefixes.
  const username =
    ["tiktok", "instagram"].includes(input.platform) &&
    /^@[^@]+$/.test(input.accountKey)
      ? input.accountKey.slice(1)
      : input.accountKey;
  const matches = accounts.socialMediaAccounts
    .map(record)
    .filter(
      (r) =>
        r?.username === username &&
        r?.platform === input.platform &&
        r?.userId === me.id,
    );
  if (matches.length !== 1 || typeof matches[0]?.id !== "string")
    return unknown();
  const account = matches[0]!;
  // Exact provider status, not the existence of an account record, proves connection.
  if (
    typeof account.status !== "string" ||
    typeof account.verificationSource !== "string"
  )
    return unknown();
  if (
    account.status !== "active" ||
    !["oauth", "bio"].includes(account.verificationSource)
  )
    return unknown();
  const connected =
    account.status === "active" &&
    ["oauth", "bio"].includes(account.verificationSource) &&
    !account.revokedAt;
  facts.joined = c.joined;
  facts.public_campaign = c.private === false;
  facts.requires_application = c.requiresApplication;
  facts.account_status = account.status;
  let application = "UNKNOWN";
  if (c.requiresApplication === false) application = "NOT_REQUIRED";
  else {
    const apps = data(input.applications);
    if (
      apps?.partialFailure !== false ||
      !Array.isArray(apps.applications) ||
      apps.applications.length > 1000
    )
      return unknown();
    const matching = apps.applications
      .map(record)
      .filter((r) => r?.campaignId === input.campaignId);
    if (matching.length > 1) return unknown();
    const app = matching[0];
    if (app?.status === "pending") application = "PENDING";
    if (app?.status === "rejected" || app?.status === "withdrawn")
      application = "REJECTED";
    // Approval must include this exact connected posting account; another account's approval cannot transfer.
    if (
      app?.status === "approved" &&
      Array.isArray(app.socialAccountIds) &&
      app.socialAccountIds.includes(account.id)
    )
      application = "ACCEPTED";
  }
  const available = record(c.access)!.canSubmit === true;
  const ready =
    connected &&
    c.joined &&
    available &&
    ["ACCEPTED", "NOT_REQUIRED"].includes(application);
  return {
    status: ready ? "READY" : "NOT_READY",
    submit_available: available,
    account_connected: connected,
    application_state: application,
    facts: {
      ...facts,
      reason: !connected
        ? "POSTING_ACCOUNT_NOT_VERIFIED"
        : !c.joined
          ? "NOT_JOINED"
          : application === "PENDING"
            ? "APPLICATION_PENDING"
            : application === "UNKNOWN"
              ? "APPLICATION_UNPROVEN"
              : !available
                ? "SUBMISSION_UNAVAILABLE"
                : "ENROLLMENT_OBSERVED",
    },
  };
}
