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
      submissions: rows,
      pagination: {
        hasNextPage: !complete,
        nextCursor: complete ? null : "next",
        total: complete ? rows.length : 200,
      },
    }),
    { headers: { "content-type": "text/html" } },
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
    expect(typeof body.result.facts.response_shape).toBe("string");
    expect(
      Object.values(body.result.facts).every(
        (value) =>
          value === null ||
          ["string", "number", "boolean"].includes(typeof value),
      ),
    ).toBe(true);
    expect(JSON.parse(body.result.facts.response_shape)).toMatchObject({
      truncated: false,
    });
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
    expect(fetcher).toHaveBeenCalledTimes(1);
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
