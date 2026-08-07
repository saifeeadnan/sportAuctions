import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureLeague, createFixtureAdmin, createFixtureRoster, createFixtureTournament } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { deleteRoster } from "@/lib/services/roster.service";

beforeEach(resetDb);

describe("deleteRoster", () => {
  it("deletes cleanly and cascades to its players when unused by any tournament", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster } = await createFixtureRoster(league.id, admin.id, ["Player A", "Player B"]);

    expect(await prisma.player.count({ where: { rosterId: roster.id } })).toBe(2);

    await deleteRoster(roster.id);

    expect(await prisma.playerRoster.findUnique({ where: { id: roster.id } })).toBeNull();
    expect(await prisma.player.count({ where: { rosterId: roster.id } })).toBe(0);
  });

  it("is blocked with a clear message when a tournament is still using it", async () => {
    const league = await createFixtureLeague();
    const admin = await createFixtureAdmin();
    const { roster } = await createFixtureRoster(league.id, admin.id, ["Player A"]);
    await createFixtureTournament({
      leagueId: league.id,
      rosterId: roster.id,
      createdById: admin.id,
      numTeams: 2,
      squadSize: 5,
    });

    await expect(deleteRoster(roster.id)).rejects.toThrow(/tournament/);

    expect(await prisma.playerRoster.findUnique({ where: { id: roster.id } })).not.toBeNull();
  });
});
