import { describe, it, expect } from "vitest";
import { splitName, joinName, NAME_PART_MAX_LENGTH } from "@/lib/personName";

describe("splitName", () => {
  it("splits on the first space, keeping the rest as the last name", () => {
    expect(splitName("Mary Ann Smith")).toEqual({ firstName: "Mary", lastName: "Ann Smith" });
    expect(splitName("Adnan Saifee")).toEqual({ firstName: "Adnan", lastName: "Saifee" });
  });

  it("treats a single-word name as a first name only", () => {
    expect(splitName("Admin")).toEqual({ firstName: "Admin", lastName: "" });
  });

  it("ignores surrounding whitespace", () => {
    expect(splitName("  Adnan Saifee  ")).toEqual({ firstName: "Adnan", lastName: "Saifee" });
  });
});

describe("joinName", () => {
  it("round-trips a normally-spaced name exactly", () => {
    for (const full of ["Adnan Saifee", "Mary Ann Smith", "Admin"]) {
      const { firstName, lastName } = splitName(full);
      expect(joinName(firstName, lastName)).toEqual({ name: full });
    }
  });

  it("trims and collapses internal whitespace", () => {
    expect(joinName("  Adnan ", "  van   der Berg ")).toEqual({ name: "Adnan van der Berg" });
  });

  it("allows an empty last name", () => {
    expect(joinName("Cher", "")).toEqual({ name: "Cher" });
  });

  it("requires a first name", () => {
    expect(joinName("", "Saifee")).toEqual({ error: "name-required" });
    expect(joinName("   ", "")).toEqual({ error: "name-required" });
  });

  it("rejects a first or last name over the length cap", () => {
    const tooLong = "a".repeat(NAME_PART_MAX_LENGTH + 1);
    expect(joinName(tooLong, "Saifee")).toEqual({ error: "name-too-long" });
    expect(joinName("Adnan", tooLong)).toEqual({ error: "name-too-long" });
    expect(joinName("a".repeat(NAME_PART_MAX_LENGTH), "b".repeat(NAME_PART_MAX_LENGTH))).toHaveProperty("name");
  });
});
