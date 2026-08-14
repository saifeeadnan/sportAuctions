import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureLeague, createFixtureAdmin, createFixtureRoster, createFixtureTournament } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  addTournamentSponsor,
  addExistingTournamentSponsor,
} from "@/lib/services/tournamentSponsor.service";

beforeEach(resetDb);

async function buildTournamentFixture() {
  const league = await createFixtureLeague();
  const admin = await createFixtureAdmin();
  const { roster } = await createFixtureRoster(league.id, admin.id, ["Player A"]);
  const tournament = await createFixtureTournament({
    leagueId: league.id,
    rosterId: roster.id,
    createdById: admin.id,
    numTeams: 2,
    squadSize: 5,
  });
  return { league, admin, tournament };
}

describe("addTournamentSponsor with a logo URL", () => {
  it("stores logoUrl and leaves mimeType/data null", async () => {
    const { tournament } = await buildTournamentFixture();

    const sponsor = await addTournamentSponsor({
      tournamentId: tournament.id,
      name: "Acme Corp",
      logoUrl: "https://example.com/logo.png",
    });

    expect(sponsor.logoUrl).toBe("https://example.com/logo.png");
    expect(sponsor.mimeType).toBeNull();
    expect(sponsor.data).toBeNull();
  });

  it("rejects when both a file and a logo URL are given", async () => {
    const { tournament } = await buildTournamentFixture();
    await expect(
      addTournamentSponsor({
        tournamentId: tournament.id,
        name: "Acme Corp",
        logoUrl: "https://example.com/logo.png",
        file: { type: "image/png", data: Buffer.from([1, 2, 3]) },
      })
    ).rejects.toThrow(/not both/);
  });

  it("rejects when neither a file nor a logo URL is given", async () => {
    const { tournament } = await buildTournamentFixture();
    await expect(
      addTournamentSponsor({ tournamentId: tournament.id, name: "Acme Corp" })
    ).rejects.toThrow(/Provide a logo file or a logo URL/);
  });

  it("rejects an unparseable logo URL", async () => {
    const { tournament } = await buildTournamentFixture();
    await expect(
      addTournamentSponsor({
        tournamentId: tournament.id,
        name: "Acme Corp",
        logoUrl: "not a url",
      })
    ).rejects.toThrow(/valid URL/);
  });

  it("still accepts a plain file upload as before", async () => {
    const { tournament } = await buildTournamentFixture();
    const sponsor = await addTournamentSponsor({
      tournamentId: tournament.id,
      name: "Acme Corp",
      file: { type: "image/png", data: Buffer.from([1, 2, 3]) },
    });
    expect(sponsor.logoUrl).toBeNull();
    expect(sponsor.mimeType).toBe("image/png");
  });
});

describe("addExistingTournamentSponsor copying a URL-backed sponsor", () => {
  it("copies logoUrl without touching mimeType/data", async () => {
    const { tournament, league, admin } = await buildTournamentFixture();
    const source = await addTournamentSponsor({
      tournamentId: tournament.id,
      name: "Acme Corp",
      logoUrl: "https://example.com/logo.png",
    });

    const { roster: roster2 } = await createFixtureRoster(league.id, admin.id, ["Player B"]);
    const tournament2 = await createFixtureTournament({
      leagueId: league.id,
      rosterId: roster2.id,
      createdById: admin.id,
      numTeams: 2,
      squadSize: 5,
    });

    const copy = await addExistingTournamentSponsor(tournament2.id, source.id);

    expect(copy.logoUrl).toBe("https://example.com/logo.png");
    expect(copy.mimeType).toBeNull();
    expect(copy.data).toBeNull();

    const fromDb = await prisma.tournamentSponsor.findUniqueOrThrow({ where: { id: copy.id } });
    expect(fromDb.logoUrl).toBe("https://example.com/logo.png");
  });
});
