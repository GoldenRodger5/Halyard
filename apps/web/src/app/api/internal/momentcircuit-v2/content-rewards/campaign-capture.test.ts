import { describe, it, expect } from "vitest";
import { campaignCapture } from "./campaign-capture";
const id = "11111111-1111-4111-8111-111111111111";
const raw = JSON.stringify({
  success: true,
  data: {
    id,
    configuration: {
      content: { guidelines: "Use only authorized campaign footage." },
      referenceMaterial: [],
    },
  },
});
describe("authenticated campaign capture", () => {
  it("preserves original bytes for the exact current campaign", () => {
    expect(campaignCapture(raw, id)).toBe(raw);
  });
  it("refuses wrong scope, locked counters and an unsuccessful envelope", () => {
    expect(campaignCapture(raw, "another")).toBeNull();
    expect(
      campaignCapture(
        raw.replace('"configuration"', '"briefCounts":{},"configuration"'),
        id,
      ),
    ).toBeNull();
    expect(
      campaignCapture(raw.replace('"success":true', '"success":false'), id),
    ).toBeNull();
  });
  it("refuses duplicate keys, sensitive fields, oversized and malformed bodies", () => {
    expect(
      campaignCapture(raw.replace('"id":', '"id":"other","id":'), id),
    ).toBeNull();
    expect(
      campaignCapture(
        raw.replace(
          '"configuration"',
          '"access_token":"never-export","configuration"',
        ),
        id,
      ),
    ).toBeNull();
    expect(campaignCapture("x".repeat(200001), id)).toBeNull();
    expect(campaignCapture("{", id)).toBeNull();
  });
});
