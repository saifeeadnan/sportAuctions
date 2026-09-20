import { describe, it, expect } from "vitest";
import { formatCountdown } from "./countdown";

describe("formatCountdown", () => {
  it("formats whole hours/minutes/seconds, zero-padded", () => {
    expect(formatCountdown(2 * 3600_000 + 5 * 60_000 + 9_000)).toBe("02:05:09");
  });

  it("formats under a minute", () => {
    expect(formatCountdown(45_000)).toBe("00:00:45");
  });

  it("adds a day prefix once 24h or more remains", () => {
    expect(formatCountdown(25 * 3600_000)).toBe("1d 01:00:00");
  });

  it("handles multiple days", () => {
    expect(formatCountdown(3 * 86400_000 + 3661_000)).toBe("3d 01:01:01");
  });

  it("clamps a past target (negative remaining) to zero", () => {
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });

  it("rounds down partial seconds", () => {
    expect(formatCountdown(1999)).toBe("00:00:01");
  });
});
