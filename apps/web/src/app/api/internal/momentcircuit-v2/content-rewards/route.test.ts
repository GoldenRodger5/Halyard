import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
import { POST } from "./route";
const campaign = "11111111-1111-4111-8111-111111111111";
const url = "https://www.tiktok.com/@account/video/123";
const credential = "fixture-bridge-authentication";
const listing = (rows: unknown[], complete = true) =>
  new Response(
    JSON.stringify({
      success: true,
      data: rows.map((v) => {
        const r = v as { id?: unknown; campaignId?: unknown; url?: unknown };
        return {
          ...r,
          id: r.id ?? "s-fixture",
          isDeleted: false,
          socialMediaPost: { postUrl: r.url },
        };
      }),
      pagination: {
        count: rows.length,
        limit: 20,
        nextCursor: complete ? null : "next",
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
const request = (action: string) =>
  new NextRequest(
    "https://halyard.example/api/internal/momentcircuit-v2/content-rewards",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-momentcircuit-v2-secret": credential,
      },
      body: JSON.stringify({ action, campaign_id: campaign, public_url: url }),
    },
  );
beforeEach(() => {
  vi.stubEnv("MOMENTCIRCUIT_V2_CR_BRIDGE_SECRET", credential);
  vi.stubEnv("MOMENTCIRCUIT_V2_CR_MUTATIONS_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-role");
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => ({
    error: null,
    data: name.startsWith("get_")
      ? JSON.stringify({
          cookies: Object.fromEntries(
            [
              "__Host-cr-session",
              "__Host-cr-access-token",
              "__Host-cr-access-token-refresh-at",
              "__Host-cr-whop-id",
            ].map((name) => [name, "fixture-cookie"]),
          ),
        })
      : null,
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("private CR bridge protocol", () => {
  it("keeps unknown probe diagnostics inside the primitive-only V2 facts contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => listing([])),
    );
    const probeRequest = new NextRequest(
      "https://halyard.example/api/internal/momentcircuit-v2/content-rewards",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-momentcircuit-v2-secret": credential,
        },
        body: JSON.stringify({
          action: "probe",
          campaign_id: campaign,
          account_key: "momentcircuit0",
          platform: "tiktok",
        }),
      },
    );
    const body = await (await POST(probeRequest)).json();
    expect(body).toMatchObject({
      ok: true,
      result: { status: "UNKNOWN", submit_available: false },
    });
    expect(body.result.facts.reason).toBe(
      "CAMPAIGN_ACCOUNT_ENROLLMENT_EVIDENCE_UNPROVEN",
    );
    expect(
      Object.values(body.result.facts).every(
        (value) =>
          value === null ||
          ["string", "number", "boolean"].includes(typeof value),
      ),
    ).toBe(true);
  });
  it("binds lookup to exact campaign and URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => listing([{ id: "s1", campaignId: campaign, url }])),
    );
    expect(await (await POST(request("lookup"))).json()).toEqual({
      ok: true,
      result: { status: "FOUND", remote_id: "s1" },
    });
  });
  it.each([
    { campaignId: "another-campaign", url },
    { campaignId: campaign, url: url + "4" },
  ])("does not accept a foreign campaign or URL prefix: %j", async (row) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => listing([row])),
    );
    expect(await (await POST(request("lookup"))).json()).toEqual({
      ok: true,
      result: { status: "NOT_FOUND" },
    });
  });
  it("refuses mutation when listing completeness is unknown", async () => {
    const fetcher = vi.fn(async () => listing([], false));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await POST(request("submit"))).json()).toMatchObject({
      result: { status: "UNKNOWN" },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("verifies the exact submission after a successful POST", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(new Response('{"success":true}'))
      .mockResolvedValueOnce(
        listing([{ id: "s2", campaignId: campaign, url }]),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await (await POST(request("submit"))).json()).toEqual({
      ok: true,
      result: { status: "ACCEPTED", remote_id: "s2" },
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not turn an unverified 409 into another campaign's acceptance", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(
        new Response("already been submitted", { status: 409 }),
      )
      .mockResolvedValueOnce(
        listing([{ campaignId: "another-campaign", url }]),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await (await POST(request("submit"))).json()).toMatchObject({
      result: {
        status: "UNKNOWN",
        reason: "CONTENT_REWARDS_CONFLICT_UNVERIFIED",
      },
    });
  });
  it("successful POST with uncertain readback stays UNKNOWN and is not resent", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(new Response('{"success":true}'))
      .mockResolvedValueOnce(new Response("<html>" + url + "</html>"));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await POST(request("submit"))).json()).toMatchObject({
      result: { status: "UNKNOWN" },
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("preserves same-origin refresh rotation and never replays a mutating redirect", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "/refreshed",
            "set-cookie": "__Host-cr-session=rotated-fixture; Secure; HttpOnly",
          },
        }),
      )
      .mockResolvedValueOnce(listing([{ campaignId: campaign, url }]));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await POST(request("lookup"))).json()).toMatchObject({
      result: { status: "FOUND" },
    });
    expect(
      rpc.mock.calls.filter(
        (c) => c[0] === "set_momentcircuit_cr_cookie_bundle",
      ),
    ).toHaveLength(1);
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("cookie"),
    ).toContain("__Host-cr-session=rotated-fixture");
  });
});

it("inspects only fixed read-only first-party contracts without exposing response values or claiming readiness", async () => {
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");
    return new Response(
      JSON.stringify({
        data: {
          campaignId: campaign,
          token: "never-return-this-token",
          account: "private-account",
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const r = await POST(
    new NextRequest(
      "https://halyard.example/api/internal/momentcircuit-v2/content-rewards",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-momentcircuit-v2-secret": credential,
        },
        body: JSON.stringify({
          action: "inspect_contract",
          campaign_id: campaign,
          account_key: "account",
          platform: "tiktok",
        }),
      },
    ),
  );
  const body = await r.json();
  expect(body.result.status).toBe("UNKNOWN");
  expect(fetcher).toHaveBeenCalledTimes(6);
  expect(JSON.stringify(body)).not.toContain("never-return-this-token");
  expect(JSON.stringify(body)).not.toContain("private-account");
  expect(fetcher.mock.calls.map((c) => String(c[0]))).toContain(
    `https://b4e0vdqv6zgqeqj4pfgm.apps.whop.com/api/campaign/campaigns/${campaign}`,
  );
});

const probeRequest = (action = "probe") =>
  new NextRequest(
    "https://halyard.example/api/internal/momentcircuit-v2/content-rewards",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-momentcircuit-v2-secret": credential,
      },
      body: JSON.stringify({
        action,
        campaign_id: campaign,
        account_key: "creator",
        platform: "tiktok",
        attempt_id: "22222222-2222-4222-8222-222222222222",
      }),
    },
  );
it("native review diagnostics expose bounded enum counts without submission URLs or claiming readiness", async () => {
  const native = nativeFetcher();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: unknown, init?: RequestInit) =>
      new URL(String(value)).pathname.endsWith("/submission/submissions")
        ? listing([
            {
              id: "s",
              campaignId: campaign,
              url: "https://private.example/do-not-export",
              reviewStatus: "NATIVE_UNVERIFIED",
            },
          ])
        : native(value, init),
    ),
  );
  const body = await (await POST(probeRequest("inspect_contract"))).json();
  expect(body.result.status).toBe("UNKNOWN");
  expect(
    body.result.evidence.submissions.observed.native_review_vocabulary,
  ).toEqual({ NATIVE_UNVERIFIED: 1 });
  expect(JSON.stringify(body)).not.toContain("do-not-export");
});
function nativeFetcher(joinReadback = false) {
  let sent = false;
  return vi.fn(async (value: unknown, init?: RequestInit) => {
    const path = new URL(String(value)).pathname;
    let data: unknown;
    if (path.endsWith("/join")) {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeUndefined();
      sent = true;
      data = {};
    } else if (path.endsWith("/users/me")) data = { id: "self" };
    else if (path.endsWith("/social-media-accounts")) {
      expect(new URL(String(value)).searchParams.get("userId")).toBe("self");
      data = {
        socialMediaAccounts: [
          {
            id: "account",
            userId: "self",
            platform: "tiktok",
            username: "creator",
            status: "active",
            verificationSource: "bio",
          },
        ],
      };
    } else if (path.endsWith("/applications/me"))
      data = { applications: [], partialFailure: false };
    else
      data = {
        id: campaign,
        private: false,
        joined: sent && joinReadback,
        requiresApplication: false,
        access: { canSubmit: true },
      };
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { "content-type": "application/json" },
    });
  });
}
it("native probe proves account but never equates canSubmit with joined", async () => {
  vi.stubGlobal("fetch", nativeFetcher());
  const body = await (await POST(probeRequest())).json();
  expect(body.result).toMatchObject({
    status: "NOT_READY",
    account_connected: true,
    application_state: "NOT_REQUIRED",
    facts: {
      joined: false,
      reason: "NOT_JOINED",
      brand_approval: "UNPROVEN",
    },
  });
});
it("keeps all mutations killed unless explicitly enabled server-side", async () => {
  vi.stubEnv("MOMENTCIRCUIT_V2_CR_MUTATIONS_ENABLED", "false");
  const fetcher = nativeFetcher();
  vi.stubGlobal("fetch", fetcher);
  const probe = await (await POST(probeRequest())).json();
  expect(probe.result).toMatchObject({
    status: "NOT_READY",
    facts: {
      joined: false,
      join_contract_supported: true,
      join_action_supported: false,
      brand_approval: "UNPROVEN",
    },
  });
  expect(
    (await (await POST(probeRequest("join"))).json()).result.facts.reason,
  ).toBe("ENROLLMENT_MUTATIONS_KILLED");
  expect((await (await POST(request("submit"))).json()).result.reason).toBe(
    "REWARD_MUTATIONS_KILLED",
  );
  expect(
    fetcher.mock.calls.every((c) => (c[1]?.method ?? "GET") === "GET"),
  ).toBe(true);
});
it.each([false, true])(
  "join ignores HTTP200 and requires fresh exact joined=%s readback",
  async (joined) => {
    const fetcher = nativeFetcher(joined);
    vi.stubGlobal("fetch", fetcher);
    const b = await (await POST(probeRequest("join"))).json();
    expect(b.result.status).toBe(joined ? "READY" : "UNKNOWN");
    expect(
      fetcher.mock.calls.filter((c) => c[1]?.method === "POST"),
    ).toHaveLength(1);
    expect(b.result.facts.brand_approval).toBe("UNPROVEN");
  },
);
it("reads a second exact submission page and does not trust a nonterminal first page", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(listing([], false))
    .mockResolvedValueOnce(
      listing([{ id: "second", campaignId: campaign, url }]),
    );
  vi.stubGlobal("fetch", fetcher);
  expect((await (await POST(request("lookup"))).json()).result).toEqual({
    status: "FOUND",
    remote_id: "second",
  });
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("?cursor=next");
});

it.each([true, false])(
  "bounded API-401 refresh requires actual structured identity recovery=%s",
  async (recover) => {
    let identityCalls = 0;
    const native = nativeFetcher();
    const fetcher = vi.fn(async (value: unknown, init?: RequestInit) => {
      const path = new URL(String(value)).pathname;
      expect(init?.method ?? "GET").toBe("GET");
      if (path.endsWith("/users/me")) {
        identityCalls++;
        if (identityCalls === 1 || !recover)
          return new Response(null, { status: 401 });
        expect(new Headers(init?.headers).get("cookie")).toContain(
          "__Host-cr-session=rotated-fixture",
        );
      }
      if (path.endsWith("/preview"))
        return new Response(null, {
          status: 307,
          headers: {
            location: "/refresh-fixture",
            "set-cookie": "__Host-cr-session=rotated-fixture; Secure; HttpOnly",
          },
        });
      if (path === "/refresh-fixture")
        return new Response("login or campaign page");
      return native(value, init);
    });
    vi.stubGlobal("fetch", fetcher);
    const b = await (await POST(probeRequest())).json();
    expect(b.result.account_connected).toBe(recover ? true : null);
    expect(b.result.status).toBe(recover ? "NOT_READY" : "UNKNOWN");
    expect(identityCalls).toBe(2);
    expect(
      fetcher.mock.calls.filter((c) => String(c[0]).endsWith("/preview")),
    ).toHaveLength(1);
    expect(
      fetcher.mock.calls.every((c) => (c[1]?.method ?? "GET") === "GET"),
    ).toBe(true);
  },
);
it("refuses external session-refresh destinations after API 401", async () => {
  const fetcher = vi.fn(async (value: unknown) =>
    new URL(String(value)).pathname.endsWith("/users/me")
      ? new Response(null, { status: 401 })
      : new Response(null, {
          status: 307,
          headers: { location: "https://elsewhere.example/login" },
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  const b = await (await POST(probeRequest())).json();
  expect(b.result?.status).not.toBe("READY");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("contract inspection refreshes API 401 but retains diagnostics-only status", async () => {
  let calls = 0;
  const native = nativeFetcher();
  const f = vi.fn(async (value: unknown, init?: RequestInit) => {
    const path = new URL(String(value)).pathname;
    if (path.endsWith("/users/me") && ++calls === 1)
      return new Response(null, { status: 401 });
    if (path.endsWith("/preview"))
      return new Response("page alone proves nothing");
    return native(value, init);
  });
  vi.stubGlobal("fetch", f);
  const b = await (await POST(probeRequest("inspect_contract"))).json();
  expect(b.result.status).toBe("UNKNOWN");
  expect(b.result.evidence.identity.observed.identity_record_present).toBe(
    true,
  );
  expect(calls).toBe(2);
});

it("authenticated campaign read requires an exact active account and sends no mutation", async () => {
  const native = nativeFetcher();
  const f = vi.fn(async (value: unknown, init?: RequestInit) => {
    const path = new URL(String(value)).pathname;
    if (path.endsWith("/" + campaign))
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: campaign,
            joined: false,
            private: false,
            requiresApplication: false,
            access: { canSubmit: true },
            configuration: {
              content: { guidelines: "Use the supplied media." },
              referenceMaterial: [],
            },
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    return native(value, init);
  });
  vi.stubGlobal("fetch", f);
  const b = await (await POST(probeRequest("read_campaign"))).json();
  expect(b.result).toMatchObject({
    status: "COMPLETE",
    campaign_id: campaign,
    account_key: "creator",
    platform: "tiktok",
  });
  expect(JSON.parse(b.result.raw).data.id).toBe(campaign);
  expect(f.mock.calls.every((c) => (c[1]?.method ?? "GET") === "GET")).toBe(
    true,
  );
});

const reviewUrl = "https://www.tiktok.com/@creator/video/123";
const reviewRow = {
  id: "s-review",
  campaignId: campaign,
  userId: "self",
  isDeleted: false,
  socialMediaPost: { postUrl: reviewUrl },
  reviewStatus: "tracking",
  status: "pending",
  flagged: false,
};
const reviewRequest = (publicUrl = reviewUrl, accountKey = "@creator") =>
  new NextRequest(
    "https://halyard.example/api/internal/momentcircuit-v2/content-rewards",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-momentcircuit-v2-secret": credential,
      },
      body: JSON.stringify({
        action: "read_review",
        campaign_id: campaign,
        account_key: accountKey,
        platform: "tiktok",
        public_url: publicUrl,
      }),
    },
  );
function reviewFetcher(pages: Response[]) {
  const native = nativeFetcher();
  return vi.fn(async (value: unknown, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");
    return new URL(String(value)).pathname.endsWith("/submission/submissions")
      ? (pages.shift() ?? listing([], false))
      : native(value, init);
  });
}
it("reads exact authenticated reward review with mutations killed, without claiming cash or enrollment", async () => {
  vi.stubEnv("MOMENTCIRCUIT_V2_CR_MUTATIONS_ENABLED", "false");
  const f = reviewFetcher([listing([{ ...reviewRow, url: reviewUrl }])]);
  vi.stubGlobal("fetch", f);
  const b = await (await POST(reviewRequest())).json();
  expect(b.result).toEqual({
    status: "COMPLETE",
    campaign_id: campaign,
    account_key: "@creator",
    platform: "tiktok",
    public_url: reviewUrl,
    remote_id: "s-review",
    native_review_status: "tracking",
    native_status: "pending",
    flagged: false,
    captured_at: expect.any(String),
  });
  expect(f).toHaveBeenCalledTimes(5);
});
it.each([
  "https://www.tiktok.com/@foreign/video/123",
  "https://evil.example/@creator/video/123",
  "https://creator:pass@www.tiktok.com/@creator/video/123",
])(
  "does not send any provider request for foreign review URL %s",
  async (publicUrl) => {
    const f = reviewFetcher([]);
    vi.stubGlobal("fetch", f);
    expect(
      (await (await POST(reviewRequest(publicUrl))).json()).result.status,
    ).toBe("UNKNOWN");
    expect(f).not.toHaveBeenCalled();
  },
);
it("does not trust a matching review until all pages complete", async () => {
  const f = reviewFetcher([
    listing([{ ...reviewRow, url: reviewUrl }], false),
    new Response("<html>partial</html>"),
  ]);
  vi.stubGlobal("fetch", f);
  expect((await (await POST(reviewRequest())).json()).result.status).toBe(
    "UNKNOWN",
  );
  expect(f).toHaveBeenCalledTimes(6);
});
it("rejects competing exact submission records across pages", async () => {
  const f = reviewFetcher([
    listing([{ ...reviewRow, url: reviewUrl }], false),
    listing([{ ...reviewRow, id: "another", url: reviewUrl }]),
  ]);
  vi.stubGlobal("fetch", f);
  expect((await (await POST(reviewRequest())).json()).result.reason).toBe(
    "CONTENT_REWARDS_REVIEW_MULTIPLE_RECORDS",
  );
});
it("rejects a duplicate review key before JSON parsing can hide it", async () => {
  const f = reviewFetcher([
    new Response(
      JSON.stringify({
        success: true,
        data: [reviewRow],
        pagination: { count: 1, limit: 20, nextCursor: null },
      }).replace(
        '"reviewStatus":"tracking"',
        '"reviewStatus":"tracking","reviewStatus":"rejected"',
      ),
      { headers: { "content-type": "application/json" } },
    ),
  ]);
  vi.stubGlobal("fetch", f);
  expect((await (await POST(reviewRequest())).json()).result.status).toBe(
    "UNKNOWN",
  );
});
it("trusts NOT_FOUND only from a completed listing and binds the row to the authenticated user", async () => {
  vi.stubGlobal(
    "fetch",
    reviewFetcher([
      listing([{ ...reviewRow, campaignId: "foreign", url: reviewUrl }]),
    ]),
  );
  expect((await (await POST(reviewRequest())).json()).result.status).toBe(
    "NOT_FOUND",
  );
  vi.stubGlobal(
    "fetch",
    reviewFetcher([
      listing([{ ...reviewRow, userId: "foreign", url: reviewUrl }]),
    ]),
  );
  expect((await (await POST(reviewRequest())).json()).result.status).toBe(
    "UNKNOWN",
  );
});
