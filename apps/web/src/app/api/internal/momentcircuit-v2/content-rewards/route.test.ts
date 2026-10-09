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
      reason: "JOIN_REQUIRED",
      brand_approval: "UNPROVEN",
    },
  });
});
it("keeps all mutations killed unless explicitly enabled server-side", async () => {
  vi.stubEnv("MOMENTCIRCUIT_V2_CR_MUTATIONS_ENABLED", "false");
  const fetcher = nativeFetcher();
  vi.stubGlobal("fetch", fetcher);
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
