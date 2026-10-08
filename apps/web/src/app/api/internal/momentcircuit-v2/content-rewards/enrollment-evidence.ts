/** A submit button or absent warning cannot prove account connection or application acceptance. */
export function enrollmentEvidence(
  raw: string,
  campaignId: string,
  accountKey: string,
  platform: string,
) {
  const unknown = {
    status: "UNKNOWN",
    submit_available: false,
    account_connected: null,
    application_state: "UNKNOWN",
    facts: { reason: "CAMPAIGN_ACCOUNT_ENROLLMENT_EVIDENCE_UNPROVEN" },
  };
  const roots: unknown[] = [];
  try {
    roots.push(JSON.parse(raw));
  } catch {
    // HTML is expected; only independently parseable structured records can prove enrollment.
  }
  for (const m of raw.matchAll(
    /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      roots.push(JSON.parse(m[1] ?? ""));
    } catch {
      // A malformed record supplies no enrollment evidence.
    }
  }
  const pending = roots.map((value) => ({ value, depth: 0 }));
  for (let i = 0; i < pending.length && i < 10000; i++) {
    const entry = pending[i];
    if (!entry || entry.depth > 20) return unknown;
    const v = entry.value;
    if (!v || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      if (v.length > 1000) return unknown;
      pending.push(...v.map((value) => ({ value, depth: entry.depth + 1 })));
      continue;
    }
    const row = v as Record<string, unknown>;
    if (
      row.campaign_id === campaignId &&
      row.account_key === accountKey &&
      row.platform === platform &&
      typeof row.submit_available === "boolean" &&
      typeof row.account_connected === "boolean" &&
      typeof row.application_state === "string" &&
      ["ACCEPTED", "NOT_REQUIRED", "PENDING", "REJECTED"].includes(
        row.application_state,
      )
    ) {
      const ready =
        row.submit_available &&
        row.account_connected &&
        ["ACCEPTED", "NOT_REQUIRED"].includes(row.application_state);
      return {
        status: ready ? "READY" : "NOT_READY",
        submit_available: row.submit_available,
        account_connected: row.account_connected,
        application_state: row.application_state,
        facts: {
          campaign_id: campaignId,
          account_key: accountKey,
          platform,
          evidence: "STRUCTURED_CAMPAIGN_ACCOUNT",
        },
      };
    }
    if (pending.length + Object.keys(row).length > 10000) return unknown;
    pending.push(
      ...Object.values(row).map((value) => ({ value, depth: entry.depth + 1 })),
    );
  }
  return unknown;
}
