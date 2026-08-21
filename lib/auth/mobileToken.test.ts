import { describe, it, expect } from "vitest";
import { encodeMobileToken, decodeMobileToken } from "./mobileToken";

const PAYLOAD = {
  id: "user-1",
  name: "Test User",
  isSiteAdmin: false,
  memberships: [{ leagueId: "league-1", role: "VIEWER" }],
  analyticsSessionId: "session-1",
};

describe("mobileToken", () => {
  it("round-trips a payload through encode/decode", async () => {
    const token = await encodeMobileToken(PAYLOAD);
    const decoded = await decodeMobileToken(token);

    expect(decoded).toMatchObject(PAYLOAD);
  });

  it("returns null for a tampered token", async () => {
    const token = await encodeMobileToken(PAYLOAD);
    const tampered = token.slice(0, -4) + "abcd";

    expect(await decodeMobileToken(tampered)).toBeNull();
  });

  it("returns null for a garbage string", async () => {
    expect(await decodeMobileToken("not-a-real-token")).toBeNull();
  });
});
