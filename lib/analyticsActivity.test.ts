import { describe, it, expect } from "vitest";
import { shouldSendHeartbeat, IDLE_TIMEOUT_MS } from "@/lib/analyticsActivity";

const now = 1_000_000_000;

describe("shouldSendHeartbeat", () => {
  it("counts a visible tab the user has just touched", () => {
    expect(shouldSendHeartbeat({ visible: true, lastInteractionAt: now - 1_000, now })).toBe(true);
  });

  it("never counts a hidden tab, however recent the last interaction", () => {
    expect(shouldSendHeartbeat({ visible: false, lastInteractionAt: now, now })).toBe(false);
  });

  it("stops counting a visible tab once nobody has touched it for the idle timeout", () => {
    expect(shouldSendHeartbeat({ visible: true, lastInteractionAt: now - IDLE_TIMEOUT_MS - 1, now })).toBe(false);
    // The unattended-tab case that inflated totals: open and visible for hours.
    expect(shouldSendHeartbeat({ visible: true, lastInteractionAt: now - 5 * 60 * 60_000, now })).toBe(false);
  });

  it("still counts right up to the idle timeout", () => {
    expect(shouldSendHeartbeat({ visible: true, lastInteractionAt: now - IDLE_TIMEOUT_MS, now })).toBe(true);
  });

  it("resumes counting as soon as the user touches the page again", () => {
    const idleSince = now - 3 * 60 * 60_000;
    expect(shouldSendHeartbeat({ visible: true, lastInteractionAt: idleSince, now })).toBe(false);
    expect(shouldSendHeartbeat({ visible: true, lastInteractionAt: now, now })).toBe(true);
  });
});
