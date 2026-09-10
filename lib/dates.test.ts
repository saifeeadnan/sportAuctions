import { describe, it, expect } from "vitest";
import { toZonedDateTimeInputValue, fromZonedDateTimeInputValue } from "@/lib/dates";

const ET = "America/New_York";

describe("toZonedDateTimeInputValue / fromZonedDateTimeInputValue", () => {
  it("converts a UTC instant to Eastern wall-clock and back, in EDT (summer)", () => {
    // 2026-07-15T16:30:00Z is noon EDT (UTC-4).
    const instant = new Date("2026-07-15T16:30:00.000Z");
    const local = toZonedDateTimeInputValue(instant, ET);
    expect(local).toBe("2026-07-15T12:30");
    expect(fromZonedDateTimeInputValue(local, ET).toISOString()).toBe(instant.toISOString());
  });

  it("converts a UTC instant to Eastern wall-clock and back, in EST (winter)", () => {
    // 2026-01-15T17:30:00Z is noon EST (UTC-5).
    const instant = new Date("2026-01-15T17:30:00.000Z");
    const local = toZonedDateTimeInputValue(instant, ET);
    expect(local).toBe("2026-01-15T12:30");
    expect(fromZonedDateTimeInputValue(local, ET).toISOString()).toBe(instant.toISOString());
  });

  it("round-trips correctly across the spring-forward DST boundary", () => {
    // 2026-03-08 02:00 local is when EST -> EDT jumps in the US. Pick times
    // clearly on either side of the transition instant, not the skipped hour
    // itself (01:30 EST and 03:30 EDT are both valid, real wall-clock times).
    const beforeTransition = fromZonedDateTimeInputValue("2026-03-08T01:30", ET);
    const afterTransition = fromZonedDateTimeInputValue("2026-03-08T03:30", ET);
    expect(toZonedDateTimeInputValue(beforeTransition, ET)).toBe("2026-03-08T01:30");
    expect(toZonedDateTimeInputValue(afterTransition, ET)).toBe("2026-03-08T03:30");
    // 2 hours of wall-clock time passed (01:30 -> 03:30) but only 1 real hour
    // elapsed, since the clock jumped forward an hour (skipping 02:00-02:59)
    // in between.
    expect(afterTransition.getTime() - beforeTransition.getTime()).toBe(1 * 60 * 60 * 1000);
  });

  it("a bare UTC ISO instant and its Eastern round-trip always represent the identical moment", () => {
    const samples = ["2026-01-01T00:00:00.000Z", "2026-06-01T04:00:00.000Z", "2026-11-01T05:00:00.000Z"];
    for (const iso of samples) {
      const instant = new Date(iso);
      const roundTripped = fromZonedDateTimeInputValue(toZonedDateTimeInputValue(instant, ET), ET);
      expect(roundTripped.getTime()).toBe(instant.getTime());
    }
  });
});
