import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureAdmin, createFixtureLeague, createFixtureUserWithMembership } from "../helpers/fixtures";
import { expectAuditLog } from "../helpers/auditLog";

// lib/auth/guards.ts pulls in next-auth's real "@/auth", which doesn't resolve
// under Vitest's plain Node environment (see tests/integration/authScope.test.ts).
// Nothing here calls the real auth() function.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { prisma } from "@/lib/prisma";
import {
  deleteStatsUpload,
  getPublicTournamentStats,
  getStatsShare,
  getStatsUploadFile,
  getStatsUploadForAdmin,
  listStatsUploads,
  publishStatsUpload,
  rotateStatsLink,
  stopSharingStats,
  updateStatsSettings,
  uploadTournamentStats,
} from "@/lib/services/tournamentStats.service";
import { STATS_LIMITS } from "@/lib/statsUpload/schema";

const { AuthError, assertInScope } = await import("@/lib/auth/guards");

beforeEach(resetDb);

const bytes = (text: string) => new TextEncoder().encode(text);

function sheet(name: string, rows: (string | number | null)[][]) {
  return {
    name,
    display: rows.map((r) => r.map((c) => (c === null ? null : String(c)))),
    values: rows,
  };
}

const CAREER = sheet("Career", [["Player", "Runs"], ["Hashim", 174], ["Saifee", 90]]);
const LEADERS = sheet("Leaders", [["Top scorers", null], ["Hashim", 174]]);

async function fixture() {
  const league = await createFixtureLeague();
  const admin = await createFixtureAdmin();
  return { league, admin };
}

async function upload(
  leagueId: string,
  actorId: string,
  overrides: Partial<Parameters<typeof uploadTournamentStats>[1]> = {}
) {
  return uploadTournamentStats(
    leagueId,
    { fileName: "stats.xlsx", mimeType: "application/xlsx", fileBytes: bytes("original-bytes"), sheets: [CAREER, LEADERS], ...overrides },
    actorId
  );
}

describe("uploadTournamentStats", () => {
  it("stores the chosen sheets in order, the original bytes untouched, and audits it", async () => {
    const { league, admin } = await fixture();
    const original = bytes("PK-not-really-a-zip");
    const { id, sheetCount } = await upload(league.id, admin.id, { fileBytes: original, label: "  2022–2026 stats  " });
    expect(sheetCount).toBe(2);

    const row = await prisma.tournamentStatsUpload.findUniqueOrThrow({
      where: { id },
      include: { sheets: { orderBy: { position: "asc" } } },
    });
    expect(row.label).toBe("2022–2026 stats");
    expect(row.uploadedById).toBe(admin.id);
    expect(Buffer.from(row.fileData).equals(Buffer.from(original))).toBe(true);
    expect(row.sheets.map((s) => [s.position, s.name, s.rowCount, s.columnCount])).toEqual([
      [0, "Career", 3, 2],
      [1, "Leaders", 2, 2],
    ]);
    expect(row.sheets[0].display).toEqual([["Player", "Runs"], ["Hashim", "174"], ["Saifee", "90"]]);
    expect(row.sheets[0].values).toEqual([["Player", "Runs"], ["Hashim", 174], ["Saifee", 90]]);

    const log = await expectAuditLog({ entityType: "TournamentStatsUpload", entityId: id, action: "STATS_UPLOADED", actorUserId: admin.id });
    expect(log.after).toEqual({ fileName: "stats.xlsx", label: "2022–2026 stats", sheets: ["Career", "Leaders"], inheritedSetup: false });
  });

  it("caps the label at 80 characters and treats a blank one as none", async () => {
    const { league, admin } = await fixture();
    const long = await upload(league.id, admin.id, { label: "x".repeat(200) });
    const blank = await upload(league.id, admin.id, { label: "   " });
    const rows = await prisma.tournamentStatsUpload.findMany({ where: { id: { in: [long.id, blank.id] } } });
    expect(rows.find((r) => r.id === long.id)!.label).toHaveLength(STATS_LIMITS.maxLabelChars);
    expect(rows.find((r) => r.id === blank.id)!.label).toBeNull();
  });

  it("rejects bad input and writes nothing", async () => {
    const { league, admin } = await fixture();
    await expect(upload(league.id, admin.id, { sheets: [] })).rejects.toThrow(/at least one sheet/i);
    await expect(upload(league.id, admin.id, { sheets: [CAREER, sheet("career", [["a"]])] })).rejects.toThrow(/both named/i);
    await expect(upload(league.id, admin.id, { sheets: [{ name: "R", display: [["a", "b"], ["c"]], values: [["a", "b"], ["c"]] }] })).rejects.toThrow(/not 2 cells wide/);
    await expect(upload(league.id, admin.id, { fileBytes: new Uint8Array(0) })).rejects.toThrow(/empty/i);
    await expect(upload(league.id, admin.id, { fileBytes: new Uint8Array(STATS_LIMITS.maxFileBytes + 1) })).rejects.toThrow(/10MB/);
    await expect(upload(league.id, admin.id, { fileName: "   " })).rejects.toThrow(/no name/i);
    await expect(upload("no-such-league", admin.id)).rejects.toThrow(/league not found/i);

    const tall = sheet("Tall", Array.from({ length: STATS_LIMITS.maxRowsPerSheet + 1 }, () => ["x"]));
    await expect(upload(league.id, admin.id, { sheets: [tall] })).rejects.toThrow(/2,000/);

    expect(await prisma.tournamentStatsUpload.count()).toBe(0);
    expect(await prisma.tournamentStatsSheet.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "STATS_UPLOADED" } })).toBe(0);
  });

  it("is not blocked by a read-only (ended) league", async () => {
    const league = await createFixtureLeague({ endDate: new Date("2020-01-01") });
    const admin = await createFixtureAdmin();
    await expect(upload(league.id, admin.id)).resolves.toBeDefined();
    const { id } = await upload(league.id, admin.id);
    await expect(publishStatsUpload(league.id, id, admin.id)).resolves.toBeDefined();
  });
});

describe("listing and reading uploads", () => {
  it("lists newest first with sheet names, the uploader and the published flag — never the file or grids", async () => {
    const { league, admin } = await fixture();
    const first = await upload(league.id, admin.id, { label: "first" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await upload(league.id, admin.id, { label: "second" });
    await publishStatsUpload(league.id, first.id, admin.id);

    const list = await listStatsUploads(league.id);
    expect(list.map((u) => [u.label, u.isPublished])).toEqual([["second", false], ["first", true]]);
    expect(list[0].sheets).toEqual([{ name: "Career", rowCount: 3 }, { name: "Leaders", rowCount: 2 }]);
    expect(list[0].uploadedBy).toEqual({ name: "Test Admin" });
    expect(list[0].id).toBe(second.id);
    expect(Object.keys(list[0]).sort()).toEqual(["fileName", "id", "isPublished", "label", "sheets", "uploadedAt", "uploadedBy"]);
  });

  it("only lists a league's own uploads", async () => {
    const { league, admin } = await fixture();
    const other = await createFixtureLeague();
    await upload(league.id, admin.id);
    expect(await listStatsUploads(other.id)).toEqual([]);
  });

  it("returns the exact original file, and null for another league's upload", async () => {
    const { league, admin } = await fixture();
    const other = await createFixtureLeague();
    const original = bytes("exact-original");
    const { id } = await upload(league.id, admin.id, { fileBytes: original, fileName: "My Stats.xlsx", mimeType: "application/vnd.ms-excel" });

    const file = await getStatsUploadFile(league.id, id);
    expect(file).toMatchObject({ fileName: "My Stats.xlsx", mimeType: "application/vnd.ms-excel" });
    expect(Buffer.from(file!.data).equals(Buffer.from(original))).toBe(true);
    expect(await getStatsUploadFile(other.id, id)).toBeNull();
    expect(await getStatsUploadFile(league.id, "nope")).toBeNull();
  });

  it("loads an upload's sheets in tab order for the admin view, and null across leagues", async () => {
    const { league, admin } = await fixture();
    const other = await createFixtureLeague();
    const { id } = await upload(league.id, admin.id, { sheets: [LEADERS, CAREER] });

    const view = await getStatsUploadForAdmin(league.id, id);
    expect(view!.sheets.map((s) => s.name)).toEqual(["Leaders", "Career"]);
    // each sheet arrives already split into its tables: a header and its rows
    expect(view!.sheets[1].sections[0]).toMatchObject({ kind: "table", header: ["Player", "Runs"] });
    expect(view!.sheets[1].sections[0].kind === "table" && view!.sheets[1].sections[0].rows[0]).toEqual(["Hashim", "174"]);
    expect(view!.sheets[1].headings).toEqual(["Player", "Runs"]);
    expect(await getStatsUploadForAdmin(other.id, id)).toBeNull();
  });
});

describe("publishing and the public link", () => {
  it("mints an unguessable token on first publish and keeps it when another upload is published", async () => {
    const { league, admin } = await fixture();
    const a = await upload(league.id, admin.id, { label: "A" });
    const b = await upload(league.id, admin.id, { label: "B", sheets: [LEADERS] });

    const { token } = await publishStatsUpload(league.id, a.id, admin.id);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect((await getPublicTournamentStats(token))!.sheets.map((s) => s.name)).toEqual(["Career", "Leaders"]);

    const again = await publishStatsUpload(league.id, b.id, admin.id);
    expect(again.token).toBe(token);
    expect((await getPublicTournamentStats(token))!.sheets.map((s) => s.name)).toEqual(["Leaders"]);
    expect((await getStatsShare(league.id))!.uploadId).toBe(b.id);
    expect((await listStatsUploads(league.id)).filter((u) => u.isPublished).map((u) => u.label)).toEqual(["B"]);
  });

  it("audits publishing, and never puts the token in any audit row", async () => {
    const { league, admin } = await fixture();
    const a = await upload(league.id, admin.id);
    const { token } = await publishStatsUpload(league.id, a.id, admin.id);
    const share = await prisma.tournamentStatsShare.findUniqueOrThrow({ where: { leagueId: league.id } });

    const log = await expectAuditLog({ entityType: "TournamentStatsShare", entityId: share.id, action: "STATS_PUBLISHED", actorUserId: admin.id });
    expect(log.after).toMatchObject({ uploadId: a.id, sheets: ["Career", "Leaders"] });
    await rotateStatsLink(league.id, admin.id);
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(token);
  });

  it("refuses to publish another league's upload", async () => {
    const { league, admin } = await fixture();
    const other = await createFixtureLeague();
    const foreign = await upload(other.id, admin.id);
    await expect(publishStatsUpload(league.id, foreign.id, admin.id)).rejects.toThrow(/upload not found/i);
    expect(await getStatsShare(league.id)).toBeNull();
  });

  it("serves only what the page shows: no file, raw values, uploader or file name", async () => {
    const { league, admin } = await fixture();
    const { id } = await upload(league.id, admin.id, { fileName: "secret-name.xlsx", label: "Public label" });
    const { token } = await publishStatsUpload(league.id, id, admin.id);

    const pub = await getPublicTournamentStats(token);
    expect(Object.keys(pub!).sort()).toEqual(["hasLeagueLogo", "label", "landingTab", "leagueId", "leagueName", "publishedAt", "sheets"]);
    expect(Object.keys(pub!.sheets[0]).sort()).toEqual(["name", "sections"]);
    expect(pub!.label).toBe("Public label");
    expect(pub!.leagueName).toBe(league.name);
    expect(pub!.hasLeagueLogo).toBe(false);
    const json = JSON.stringify(pub);
    expect(json).not.toContain("secret-name");
    expect(json).not.toContain("Test Admin");
    expect(json).not.toContain("original-bytes");
  });

  it("returns null for an unknown token and for a link with nothing published", async () => {
    const { league, admin } = await fixture();
    expect(await getPublicTournamentStats("not-a-real-token")).toBeNull();
    expect(await getPublicTournamentStats("")).toBeNull();

    const { id } = await upload(league.id, admin.id);
    const { token } = await publishStatsUpload(league.id, id, admin.id);
    await deleteStatsUpload(league.id, id, admin.id);
    expect(await getPublicTournamentStats(token)).toBeNull();
  });

  it("stopping sharing kills the link, is idempotent, and is audited once", async () => {
    const { league, admin } = await fixture();
    const { id } = await upload(league.id, admin.id);
    const { token } = await publishStatsUpload(league.id, id, admin.id);
    const share = await prisma.tournamentStatsShare.findUniqueOrThrow({ where: { leagueId: league.id } });

    await stopSharingStats(league.id, admin.id);
    expect(await getPublicTournamentStats(token)).toBeNull();
    expect(await getStatsShare(league.id)).toBeNull();
    await expectAuditLog({ entityType: "TournamentStatsShare", entityId: share.id, action: "STATS_SHARING_STOPPED", actorUserId: admin.id });

    await expect(stopSharingStats(league.id, admin.id)).resolves.toBeUndefined();
    expect(await prisma.auditLog.count({ where: { action: "STATS_SHARING_STOPPED" } })).toBe(1);
    // the upload itself is untouched
    expect(await prisma.tournamentStatsUpload.count()).toBe(1);
  });

  it("rotating replaces the token, keeps what is published, and needs an existing link", async () => {
    const { league, admin } = await fixture();
    await expect(rotateStatsLink(league.id, admin.id)).rejects.toThrow(/no public link/i);

    const { id } = await upload(league.id, admin.id);
    const { token: oldToken } = await publishStatsUpload(league.id, id, admin.id);
    const { token: newToken } = await rotateStatsLink(league.id, admin.id);

    expect(newToken).not.toBe(oldToken);
    expect(await getPublicTournamentStats(oldToken)).toBeNull();
    expect((await getPublicTournamentStats(newToken))!.sheets).toHaveLength(2);
    expect((await getStatsShare(league.id))!.uploadId).toBe(id);
  });
});

describe("deleting uploads", () => {
  it("removes the upload and its sheets, and empties the link if it was the published one", async () => {
    const { league, admin } = await fixture();
    const a = await upload(league.id, admin.id, { label: "A" });
    const b = await upload(league.id, admin.id, { label: "B" });
    const { token } = await publishStatsUpload(league.id, a.id, admin.id);

    await deleteStatsUpload(league.id, a.id, admin.id);

    expect(await prisma.tournamentStatsUpload.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await prisma.tournamentStatsSheet.count({ where: { uploadId: a.id } })).toBe(0);
    expect(await prisma.tournamentStatsUpload.findUnique({ where: { id: b.id } })).not.toBeNull();
    // the link survives but shows nothing until something is published again
    expect(await getStatsShare(league.id)).toMatchObject({ token, uploadId: null });
    expect(await getPublicTournamentStats(token)).toBeNull();
    await publishStatsUpload(league.id, b.id, admin.id);
    expect((await getPublicTournamentStats(token))!.label).toBe("B");

    const log = await expectAuditLog({ entityType: "TournamentStatsUpload", entityId: a.id, action: "STATS_UPLOAD_DELETED", actorUserId: admin.id });
    expect(log.before).toMatchObject({ label: "A", wasPublished: true });
  });

  it("refuses to delete another league's upload", async () => {
    const { league, admin } = await fixture();
    const other = await createFixtureLeague();
    const foreign = await upload(other.id, admin.id);
    await expect(deleteStatsUpload(league.id, foreign.id, admin.id)).rejects.toThrow(/upload not found/i);
    expect(await prisma.tournamentStatsUpload.count()).toBe(1);
  });

  it("is removed with its league", async () => {
    const { league, admin } = await fixture();
    const { id } = await upload(league.id, admin.id);
    await publishStatsUpload(league.id, id, admin.id);
    await prisma.league.delete({ where: { id: league.id } });
    expect(await prisma.tournamentStatsUpload.count()).toBe(0);
    expect(await prisma.tournamentStatsSheet.count()).toBe(0);
    expect(await prisma.tournamentStatsShare.count()).toBe(0);
  });

  it("keeps the upload when the uploader's account is deleted", async () => {
    const league = await createFixtureLeague();
    const { user } = await createFixtureUserWithMembership(league.id, "LEAGUE_ADMIN");
    const { id } = await upload(league.id, user.id);
    await prisma.$transaction([
      prisma.leagueMembership.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.deleteMany({ where: { actorUserId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);
    expect((await prisma.tournamentStatsUpload.findUniqueOrThrow({ where: { id } })).uploadedById).toBeNull();
  });
});

describe("league scoping (what the routes and actions rely on)", () => {
  it("a League Admin's scope covers their own league and not another", async () => {
    const { league } = await fixture();
    const other = await createFixtureLeague();
    expect(() => assertInScope([league.id], league.id)).not.toThrow();
    expect(() => assertInScope([league.id], other.id)).toThrow(AuthError);
    expect(() => assertInScope(null, other.id)).not.toThrow(); // site admin: unrestricted
  });
});

describe("presentation settings", () => {
  async function published() {
    const { league, admin } = await fixture();
    const up = await upload(league.id, admin.id, {
      sheets: [CAREER, LEADERS, sheet("Notes", [["Player", "Runs", "Wickets"], ["Zed", "1", "2"], ["Amy", "3", "4"]])],
    });
    const { token } = await publishStatsUpload(league.id, up.id, admin.id);
    return { league, admin, up, token };
  }
  const settings = (over: Partial<Parameters<typeof updateStatsSettings>[2]> = {}) => ({
    sheets: [
      { name: "Notes", label: null as string | null, hiddenColumns: [] as string[] },
      { name: "Career", label: null as string | null, hiddenColumns: [] as string[] },
      { name: "Leaders", label: null as string | null, hiddenColumns: [] as string[] },
    ],
    landingTab: null as string | null,
    ...over,
  });

  it("reorders the tabs, renames them and picks the opening tab, for the admin view and the public page alike", async () => {
    const { league, admin, up, token } = await published();
    await updateStatsSettings(
      league.id,
      up.id,
      settings({
        sheets: [
          { name: "Notes", label: "Everyone", hiddenColumns: [] },
          { name: "Career", label: null, hiddenColumns: [] },
          { name: "Leaders", label: "Top lists", hiddenColumns: [] },
        ],
        landingTab: "Career",
      }),
      admin.id
    );

    const pub = (await getPublicTournamentStats(token))!;
    expect(pub.sheets.map((s) => s.name)).toEqual(["Everyone", "Career", "Top lists"]);
    expect(pub.landingTab).toBe("Career");

    const forAdmin = (await getStatsUploadForAdmin(league.id, up.id))!;
    expect(forAdmin.sheets.map((s) => [s.name, s.label])).toEqual([["Notes", "Everyone"], ["Career", null], ["Leaders", "Top lists"]]);
    expect(forAdmin.landingTab).toBe("Career");
    // the history and publish prompts name the tabs as visitors see them
    expect((await listStatsUploads(league.id))[0].sheets.map((s) => s.name)).toEqual(["Everyone", "Career", "Top lists"]);

    const log = await expectAuditLog({ entityType: "TournamentStatsUpload", entityId: up.id, action: "STATS_SETTINGS_UPDATED", actorUserId: admin.id });
    expect(log.after).toMatchObject({ landingTab: "Career" });
  });

  it("names My stats as the opening tab, and reports no opening tab when none is chosen", async () => {
    const { league, admin, up, token } = await published();
    await updateStatsSettings(league.id, up.id, settings({ landingTab: "@my-stats" }), admin.id);
    expect((await getPublicTournamentStats(token))!.landingTab).toBe("My stats");
    await updateStatsSettings(league.id, up.id, settings({ landingTab: null }), admin.id);
    expect((await getPublicTournamentStats(token))!.landingTab).toBeNull();
  });

  it("removes hidden columns on the server, so the public payload never contains them", async () => {
    const { league, admin, up, token } = await published();
    await updateStatsSettings(
      league.id,
      up.id,
      settings({
        sheets: [
          { name: "Notes", label: null, hiddenColumns: ["Wickets"] },
          { name: "Career", label: null, hiddenColumns: ["runs"] },
          { name: "Leaders", label: null, hiddenColumns: [] },
        ],
      }),
      admin.id
    );

    const pub = (await getPublicTournamentStats(token))!;
    const notes = pub.sheets.find((s) => s.name === "Notes")!.sections[0];
    expect(notes.kind === "table" && notes.header).toEqual(["Player", "Runs"]);
    const career = pub.sheets.find((s) => s.name === "Career")!.sections[0];
    expect(career.kind === "table" && career.header).toEqual(["Player"]);
    // nothing of a hidden column is in what the page is sent (Leaders has a 174 of its own, so look at the sheets concerned)
    expect(JSON.stringify(pub.sheets.find((s) => s.name === "Career"))).not.toContain("174");
    expect(JSON.stringify(pub.sheets.find((s) => s.name === "Notes"))).not.toContain("Wickets");

    // the admin still sees every heading, to be able to unhide them, and the stored grids are untouched
    const forAdmin = (await getStatsUploadForAdmin(league.id, up.id))!;
    expect(forAdmin.sheets.find((s) => s.name === "Career")!.headings).toEqual(["Player", "Runs"]);
    expect(forAdmin.sheets.find((s) => s.name === "Career")!.hiddenColumns).toEqual(["runs"]);
    const stored = await prisma.tournamentStatsSheet.findFirstOrThrow({ where: { uploadId: up.id, name: "Career" } });
    expect(stored.display).toEqual([["Player", "Runs"], ["Hashim", "174"], ["Saifee", "90"]]);
  });

  it("rejects settings that do not fit the upload, and saves nothing", async () => {
    const { league, admin, up } = await published();
    const other = await createFixtureLeague();
    const expectRejected = async (input: ReturnType<typeof settings>, message: RegExp) => {
      await expect(updateStatsSettings(league.id, up.id, input, admin.id)).rejects.toThrow(message);
    };

    await expectRejected(settings({ sheets: settings().sheets.slice(1) }), /does not match this upload|doesn.t match this upload/);
    await expectRejected(settings({ sheets: [...settings().sheets.slice(0, 2), { name: "Career", label: null, hiddenColumns: [] }] }), /match this upload/);
    await expectRejected(settings({ sheets: [...settings().sheets.slice(0, 2), { name: "Nope", label: null, hiddenColumns: [] }] }), /match this upload/);
    await expectRejected(settings({ sheets: settings().sheets.map((s) => ({ ...s, label: s.name === "Notes" ? "career" : s.label })) }), /Two tabs are both called/);
    await expectRejected(settings({ sheets: settings().sheets.map((s) => ({ ...s, label: s.name === "Notes" ? "my STATS" : s.label })) }), /player-search tab/);
    await expectRejected(settings({ landingTab: "Missing" }), /open first/);
    await expect(updateStatsSettings(other.id, up.id, settings(), admin.id)).rejects.toThrow(/upload not found/i);

    const view = (await getStatsUploadForAdmin(league.id, up.id))!;
    expect(view.sheets.map((s) => s.name)).toEqual(["Career", "Leaders", "Notes"]); // still the workbook's order
    expect(await prisma.auditLog.count({ where: { action: "STATS_SETTINGS_UPDATED" } })).toBe(0);
  });

  it("trims and caps a tab name, and treats a blank one as the sheet's own name", async () => {
    const { league, admin, up } = await published();
    await updateStatsSettings(
      league.id,
      up.id,
      settings({ sheets: settings().sheets.map((s) => ({ ...s, label: s.name === "Notes" ? "  " : s.name === "Career" ? "x".repeat(100) : null })) }),
      admin.id
    );
    const view = (await getStatsUploadForAdmin(league.id, up.id))!;
    expect(view.sheets.find((s) => s.name === "Notes")!.label).toBeNull();
    expect(view.sheets.find((s) => s.name === "Career")!.label).toHaveLength(60);
  });

  it("carries the setup onto a corrected upload of the same workbook", async () => {
    const { league, admin, up, token } = await published();
    await updateStatsSettings(
      league.id,
      up.id,
      settings({
        sheets: [
          { name: "Notes", label: "Everyone", hiddenColumns: ["Wickets"] },
          { name: "Career", label: null, hiddenColumns: [] },
          { name: "Leaders", label: null, hiddenColumns: [] },
        ],
        landingTab: "Notes",
      }),
      admin.id
    );

    const next = await upload(league.id, admin.id, {
      sheets: [CAREER, LEADERS, sheet("Notes", [["Player", "Runs", "Wickets"], ["Zed", "9", "9"]])],
    });
    await publishStatsUpload(league.id, next.id, admin.id);

    const pub = (await getPublicTournamentStats(token))!;
    expect(pub.sheets.map((s) => s.name)).toEqual(["Everyone", "Career", "Leaders"]); // order, label and all
    const notes = pub.sheets[0].sections[0];
    expect(notes.kind === "table" && notes.header).toEqual(["Player", "Runs"]); // Wickets still hidden
    expect(pub.landingTab).toBe("Everyone");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: next.id, action: "STATS_UPLOADED" } });
    expect(log.after).toMatchObject({ inheritedSetup: true });
  });

  it("inherits from the published upload rather than a newer one that is not published", async () => {
    const { league, admin, up } = await published();
    await updateStatsSettings(league.id, up.id, settings({ sheets: settings().sheets.map((s) => ({ ...s, label: s.name === "Career" ? "Published name" : null })) }), admin.id);
    const draft = await upload(league.id, admin.id, { sheets: [CAREER, LEADERS] });
    await updateStatsSettings(
      league.id,
      draft.id,
      { sheets: [{ name: "Leaders", label: null, hiddenColumns: [] }, { name: "Career", label: "Draft name", hiddenColumns: [] }], landingTab: null },
      admin.id
    );

    const third = await upload(league.id, admin.id, { sheets: [CAREER, LEADERS] });
    const view = (await getStatsUploadForAdmin(league.id, third.id))!;
    expect(view.sheets.find((s) => s.name === "Career")!.label).toBe("Published name");
  });

  it("starts a first upload with the workbook's own order and no settings", async () => {
    const { league, admin } = await fixture();
    const { id } = await upload(league.id, admin.id);
    const view = (await getStatsUploadForAdmin(league.id, id))!;
    expect(view.sheets.map((s) => [s.name, s.label, s.hiddenColumns])).toEqual([["Career", null, []], ["Leaders", null, []]]);
    expect(view.landingTab).toBeNull();
  });
});
