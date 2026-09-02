import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureLeague } from "../helpers/fixtures";
import {
  getLeagueRosterFieldConfig,
  updateLeagueRosterFieldConfig,
} from "@/lib/services/league.service";
import { ROSTER_TEMPLATES } from "@/lib/rosterTemplates";

beforeEach(resetDb);

describe("league roster field config", () => {
  it("defaults to the email/phone baseline (Generic) for a brand-new league", async () => {
    const league = await createFixtureLeague();
    expect(await getLeagueRosterFieldConfig(league.id)).toEqual(["email", "phone"]);
  });

  it("round-trips a preset's field set", async () => {
    const league = await createFixtureLeague();
    await updateLeagueRosterFieldConfig(league.id, ROSTER_TEMPLATES.CRICKET.mandatoryFields);
    expect(await getLeagueRosterFieldConfig(league.id)).toEqual(
      ROSTER_TEMPLATES.CRICKET.mandatoryFields
    );
  });

  it("stores a fully custom field set, deduped and in canonical order regardless of submission order", async () => {
    const league = await createFixtureLeague();
    await updateLeagueRosterFieldConfig(league.id, ["loginId", "position", "loginId"]);
    expect(await getLeagueRosterFieldConfig(league.id)).toEqual(["position", "loginId"]);
  });

  it("rejects an unknown field key", async () => {
    const league = await createFixtureLeague();
    await expect(
      updateLeagueRosterFieldConfig(league.id, ["not-a-real-field"])
    ).rejects.toThrow(/Unknown roster field/);
  });
});
