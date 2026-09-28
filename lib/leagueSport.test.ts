import { describe, it, expect } from "vitest";
import { isCricketLeague, isPickleballLeague } from "@/lib/leagueSport";

describe("isCricketLeague", () => {
  it("matches the exact label", () => {
    expect(isCricketLeague("Cricket")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isCricketLeague("cricket")).toBe(true);
    expect(isCricketLeague("CRICKET")).toBe(true);
    expect(isCricketLeague("  Cricket  ")).toBe(true);
  });

  it("rejects other sports and empty/missing values", () => {
    expect(isCricketLeague("Soccer")).toBe(false);
    expect(isCricketLeague("Frisbee")).toBe(false);
    expect(isCricketLeague("")).toBe(false);
    expect(isCricketLeague(null)).toBe(false);
    expect(isCricketLeague(undefined)).toBe(false);
  });
});

describe("isPickleballLeague", () => {
  it("matches the exact label", () => {
    expect(isPickleballLeague("Pickleball")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isPickleballLeague("pickleball")).toBe(true);
    expect(isPickleballLeague("PICKLEBALL")).toBe(true);
    expect(isPickleballLeague("  Pickleball  ")).toBe(true);
  });

  it("rejects other sports and empty/missing values", () => {
    expect(isPickleballLeague("Cricket")).toBe(false);
    expect(isPickleballLeague("Soccer")).toBe(false);
    expect(isPickleballLeague("")).toBe(false);
    expect(isPickleballLeague(null)).toBe(false);
    expect(isPickleballLeague(undefined)).toBe(false);
  });
});
