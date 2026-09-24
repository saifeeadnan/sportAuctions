import { describe, it, expect } from "vitest";
import { clientIpFromHeaders, userAgentFromHeaders } from "@/lib/clientRequestInfo";

const headers = (init: Record<string, string>) => new Headers(init);

describe("clientIpFromHeaders", () => {
  it("prefers Cloudflare's own client-IP header", () => {
    expect(
      clientIpFromHeaders(headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 10.0.0.2" }))
    ).toBe("203.0.113.7");
  });

  it("takes only the first hop of an x-forwarded-for chain", () => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7, 172.68.1.1, 10.0.0.2" }))).toBe("203.0.113.7");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIpFromHeaders(headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns undefined when no proxy header is present, or one is blank", () => {
    expect(clientIpFromHeaders(headers({}))).toBeUndefined();
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": " ", "cf-connecting-ip": "" }))).toBeUndefined();
  });
});

describe("userAgentFromHeaders", () => {
  it("returns the browser string, trimmed", () => {
    expect(userAgentFromHeaders(headers({ "user-agent": "  Mozilla/5.0 Chrome/153  " }))).toBe("Mozilla/5.0 Chrome/153");
  });

  it("is undefined when absent or blank", () => {
    expect(userAgentFromHeaders(headers({}))).toBeUndefined();
    expect(userAgentFromHeaders(headers({ "user-agent": "   " }))).toBeUndefined();
  });

  it("caps an absurdly long value", () => {
    expect(userAgentFromHeaders(headers({ "user-agent": "x".repeat(5000) }))?.length).toBe(300);
  });
});
