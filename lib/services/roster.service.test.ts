import { describe, it, expect } from "vitest";
import { parseRosterFile, rosterTemplateHeaderRow } from "./roster.service";
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

  it("behaves identically to today when no mandatory fields are configured (Generic)", () => {
    const { validRows, errors } = parseRosterFile(
      csv("Name,Position\nVirat Kohli,Batsman"),
      "roster.csv",
      []
    );
    expect(validRows).toEqual([{ name: "Virat Kohli", position: "Batsman" }]);
    expect(errors).toHaveLength(0);
  });

  it("drops a row missing a league-mandatory field, same error shape as a missing name", () => {
    const { validRows, errors } = parseRosterFile(
      csv("Name,Position\nVirat Kohli,\nJasprit Bumrah,Bowler"),
      "roster.csv",
      ["position"]
    );
    expect(validRows).toHaveLength(1);
    expect(validRows[0].name).toBe("Jasprit Bumrah");
    expect(errors).toEqual([{ rowNumber: 2, message: "Missing required field: Position" }]);
  });

  it("reports one error per missing field for a fully custom mandatory set", () => {
    const { validRows, errors } = parseRosterFile(
      csv("Name\nVirat Kohli"),
      "roster.csv",
      ["position", "loginId"]
    );
    expect(validRows).toHaveLength(0);
    expect(errors).toEqual([
      { rowNumber: 2, message: "Missing required field: Position" },
      { rowNumber: 2, message: "Missing required field: Login ID" },
    ]);
  });

  it("re-imports a template-generated asterisked header with zero errors", () => {
    const header = rosterTemplateHeaderRow(["position"]);
    expect(header).toContain("Position *");

    const { validRows, errors } = parseRosterFile(
      csv(`${header.join(",")}\nVirat Kohli,Batsman`),
      "roster.csv",
      ["position"]
    );
    expect(errors).toHaveLength(0);
    expect(validRows).toEqual([{ name: "Virat Kohli", position: "Batsman" }]);
  });

  it("maps Email/Phone header variants to distinct fields, not to Login ID", () => {
    const { validRows } = parseRosterFile(
      csv(
        "Name,Login ID,Email,Phone\nVirat Kohli,virat1,virat@example.com,555-0100"
      ),
      "roster.csv"
    );
    expect(validRows).toEqual([
      {
        name: "Virat Kohli",
        loginId: "virat1",
        email: "virat@example.com",
        phone: "555-0100",
      },
    ]);
  });

  it("maps EmailId, Mobile, and Contact header variants to email/phone", () => {
    const { validRows } = parseRosterFile(
      csv("Name,EmailId,Mobile\nA,a@example.com,111"),
      "roster.csv"
    );
    expect(validRows).toEqual([{ name: "A", email: "a@example.com", phone: "111" }]);

    const { validRows: viaContact } = parseRosterFile(
      csv("Name,Contact\nA,222"),
      "roster.csv"
    );
    expect(viaContact).toEqual([{ name: "A", phone: "222" }]);
  });

  it("rejects a row missing email or phone when both are league-mandatory (the default baseline)", () => {
    const { validRows, errors } = parseRosterFile(
      csv("Name,Email,Phone\nHas Both,a@example.com,111\nMissing Phone,b@example.com,\nMissing Both,,"),
      "roster.csv",
      ["email", "phone"]
    );
    expect(validRows).toEqual([{ name: "Has Both", email: "a@example.com", phone: "111" }]);
    expect(errors).toEqual([
      { rowNumber: 3, message: "Missing required field: Phone" },
      { rowNumber: 4, message: "Missing required field: Email" },
      { rowNumber: 4, message: "Missing required field: Phone" },
    ]);
  });
});
