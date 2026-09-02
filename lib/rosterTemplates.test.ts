import { describe, it, expect } from "vitest";
import { ROSTER_TEMPLATES, matchingRosterTemplateKey } from "./rosterTemplates";

describe("ROSTER_TEMPLATES", () => {
  it("Generic requires just the email/phone baseline, nothing sport-specific", () => {
    expect(ROSTER_TEMPLATES.GENERIC.mandatoryFields).toEqual(["email", "phone"]);
  });

  it("Cricket carries the email/phone baseline alongside its sport-specific fields", () => {
    expect(ROSTER_TEMPLATES.CRICKET.mandatoryFields).toEqual(
      expect.arrayContaining(["position", "email", "phone"])
    );
  });
});

describe("matchingRosterTemplateKey", () => {
  it("identifies the Generic preset regardless of order", () => {
    expect(matchingRosterTemplateKey(["phone", "email"])).toBe("GENERIC");
  });

  it("identifies the Cricket preset regardless of order", () => {
    expect(matchingRosterTemplateKey(["phone", "position", "email"])).toBe("CRICKET");
  });

  it("returns null for a custom set that matches no preset", () => {
    expect(matchingRosterTemplateKey(["position", "loginId"])).toBeNull();
    expect(matchingRosterTemplateKey(["age"])).toBeNull();
    expect(matchingRosterTemplateKey([])).toBeNull();
  });
});
