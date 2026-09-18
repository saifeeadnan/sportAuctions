import { describe, it, expect } from "vitest";
import { accessibleSections } from "./sections";

function session(isSiteAdmin: boolean, memberships: { role: string }[]) {
  return { user: { isSiteAdmin, memberships } };
}

describe("accessibleSections", () => {
  it("gives a plain VIEWER (in any number of leagues) only the viewer section", () => {
    expect(accessibleSections(session(false, [{ role: "VIEWER" }]))).toEqual(["viewer"]);
    expect(
      accessibleSections(session(false, [{ role: "VIEWER" }, { role: "VIEWER" }]))
    ).toEqual(["viewer"]);
  });

  it("gives a plain TEAM_MANAGER both manager and viewer (viewer's own guard allows TEAM_MANAGER too)", () => {
    expect(accessibleSections(session(false, [{ role: "TEAM_MANAGER" }]))).toEqual([
      "manager",
      "viewer",
    ]);
  });

  it("regression: TEAM_MANAGER in one league + VIEWER in another reaches both manager and viewer", () => {
    const s = session(false, [{ role: "TEAM_MANAGER" }, { role: "VIEWER" }]);
    expect(accessibleSections(s)).toEqual(["manager", "viewer"]);
  });

  it("gives a LEAGUE_ADMIN both admin and auctioneer, but not manager or viewer", () => {
    expect(accessibleSections(session(false, [{ role: "LEAGUE_ADMIN" }]))).toEqual([
      "admin",
      "auctioneer",
    ]);
  });

  it("gives an AUCTIONEER only the auctioneer section", () => {
    expect(accessibleSections(session(false, [{ role: "AUCTIONEER" }]))).toEqual(["auctioneer"]);
  });

  it("gives a site Admin only admin and auctioneer, never manager or viewer on its own", () => {
    expect(accessibleSections(session(true, []))).toEqual(["admin", "auctioneer"]);
  });

  it("combines a site Admin with an unrelated TEAM_MANAGER membership to reach all four", () => {
    const s = session(true, [{ role: "TEAM_MANAGER" }]);
    expect(accessibleSections(s)).toEqual(["admin", "manager", "viewer", "auctioneer"]);
  });

  it("gives someone with no memberships and no site-admin flag no sections at all", () => {
    expect(accessibleSections(session(false, []))).toEqual([]);
  });
});
