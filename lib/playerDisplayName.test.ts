import { describe, it, expect } from "vitest";
import { shortName } from "./playerDisplayName";

describe("shortName", () => {
  it("shortens a full name to first name + last initial", () => {
    expect(shortName("Abdulqadir Zumkhawala")).toBe("Abdulqadir Z.");
  });

  it("uses the last word's initial when there are more than two parts", () => {
    expect(shortName("Mary Jane Watson")).toBe("Mary W.");
  });

  it("leaves a single-word name unchanged", () => {
    expect(shortName("Cher")).toBe("Cher");
  });

  it("collapses extra internal whitespace", () => {
    expect(shortName("  John   Smith  ")).toBe("John S.");
  });
});
