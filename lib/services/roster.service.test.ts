import { describe, it, expect } from "vitest";
import { parseRosterFile } from "./roster.service";
import { ValidationError } from "@/lib/errors";

function csv(text: string): Buffer {
  return Buffer.from(text, "utf-8");
}

describe("parseRosterFile", () => {
  it("rejects anything that isn't a .csv file, by filename — never sniffs content", () => {
    expect(() => parseRosterFile(csv("Name\nA"), "roster.xlsx")).toThrow(ValidationError);
    expect(() => parseRosterFile(csv("Name\nA"), "roster.xlsx")).toThrow(/CSV/i);
  });

  it("maps aliased headers case- and spacing-insensitively", () => {
    const { validRows } = parseRosterFile(
      csv("Player Name,Login ID,Category\nVirat Kohli,virat1,Icon"),
      "roster.csv"
    );
    expect(validRows).toEqual([
      { name: "Virat Kohli", loginId: "virat1", defaultCategory: "Icon" },
    ]);
  });

  it("drops a row entirely when its name is missing, but keeps other rows", () => {
    const { validRows, errors } = parseRosterFile(
      csv("Name,Position\nVirat Kohli,Batsman\n,Bowler"),
      "roster.csv"
    );
    expect(validRows).toHaveLength(1);
    expect(validRows[0].name).toBe("Virat Kohli");
    expect(errors).toEqual([{ rowNumber: 3, message: "Missing required field: name" }]);
  });

  it("drops only the offending field (not the whole row) when a numeric field is invalid", () => {
    const { validRows, errors } = parseRosterFile(
      csv("Name,Position,Age,Login ID\nJasprit Bumrah,Bowler,notanumber,jb1"),
      "roster.csv"
    );
    expect(validRows).toHaveLength(1);
    const [row] = validRows;
    expect(row.name).toBe("Jasprit Bumrah");
    expect(row.loginId).toBe("jb1");
    expect(row.age).toBeUndefined();
    expect(errors).toEqual([
      { rowNumber: 2, message: 'Invalid age value "notanumber" — must be a number' },
    ]);
  });

  it("skips fully empty lines without producing errors", () => {
    const { validRows, errors } = parseRosterFile(
      csv("Name\nVirat Kohli\n\nJasprit Bumrah"),
      "roster.csv"
    );
    expect(validRows.map((r) => r.name)).toEqual(["Virat Kohli", "Jasprit Bumrah"]);
    expect(errors).toHaveLength(0);
  });
});
