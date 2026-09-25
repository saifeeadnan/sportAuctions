import { describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/siteOrigin";

const origin = (input: Parameters<typeof publicOrigin>[0]) => publicOrigin(input)?.origin;

describe("publicOrigin", () => {
  it("uses NEXTAUTH_URL when it is set", () => {
    expect(origin({ envUrl: "https://auction.example.com/", host: "internal:10000" })).toBe("https://auction.example.com");
  });

  it("falls back to the address the request arrived on, as https unless told otherwise", () => {
    expect(origin({ host: "auction.example.com" })).toBe("https://auction.example.com");
    expect(origin({ host: "auction.example.com", proto: "http" })).toBe("http://auction.example.com");
    expect(origin({ host: "auction.example.com", proto: "javascript" })).toBe("https://auction.example.com");
  });

  it("never prefers localhost over a public address", () => {
    expect(origin({ envUrl: "http://localhost:3000", host: "auction.example.com", proto: "https" })).toBe(
      "https://auction.example.com"
    );
    expect(origin({ envUrl: "http://127.0.0.1:3000", host: "auction.example.com" })).toBe("https://auction.example.com");
    expect(origin({ envUrl: "https://auction.example.com", host: "localhost:3000", proto: "http" })).toBe(
      "https://auction.example.com"
    );
  });

  it("still returns localhost when that is all there is (plain local dev)", () => {
    expect(origin({ host: "localhost:3000", proto: "http" })).toBe("http://localhost:3000");
    expect(origin({ host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(origin({ envUrl: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it("takes the first entry of a forwarded list and ignores junk", () => {
    expect(origin({ host: "auction.example.com, proxy.internal", proto: "https, http" })).toBe("https://auction.example.com");
    expect(origin({ envUrl: "not a url", host: "bad host with spaces" })).toBeUndefined();
    expect(origin({})).toBeUndefined();
  });
});
