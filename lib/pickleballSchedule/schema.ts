import { ValidationError } from "@/lib/errors";

// Pure and browser-safe (mirrors lib/statsUpload/schema.ts's posture, not
// zod): the upload form runs this for instant feedback and the service
// re-runs it, since the server must never trust what a client says it parsed.

export type ProposedPickleballTeam = { teamId: string; group: string };
export type ProposedPickleballMatch = {
  matchNumber: number;
  round: string;
  court: string | null;
  group: string;
  team1Id: string;
  team2Id: string;
  gamesToPlay: number;
};
export type ValidatedPickleballSchedule = {
  teams: ProposedPickleballTeam[];
  matches: ProposedPickleballMatch[];
};

export const PICKLEBALL_SCHEDULE_LIMITS = {
  maxGamesPerMatch: 15,
} as const;

function cleanGroup(where: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(`${where} has no group`);
  return value.trim();
}

/**
 * Validates the teams/matches an admin's schedule upload proposes, once the
 * review screen has resolved every team name to a real Team id. `validTeamIds`
 * is the tournament's actual teams — a v1 round-robin-only rule: both of a
 * match's teams must share one group, and that group must equal the match's
 * own group (a future cross-pool/playoff match would need this relaxed, but
 * nothing uploads one today). Returns the schedule with trimmed strings;
 * throws ValidationError otherwise, naming the row at fault.
 */
export function validatePickleballSchedule(
  input: unknown,
  context: { validTeamIds: Set<string> }
): ValidatedPickleballSchedule {
  const raw = input as { teams?: unknown; matches?: unknown } | null;
  if (!raw || typeof raw !== "object") throw new ValidationError("Malformed schedule payload");

  if (!Array.isArray(raw.teams) || raw.teams.length === 0) {
    throw new ValidationError("The schedule needs at least one team");
  }
  const teams: ProposedPickleballTeam[] = [];
  const seenTeamIds = new Set<string>();
  const groupOfTeam = new Map<string, string>();
  raw.teams.forEach((entry, i) => {
    const where = `Team row ${i + 1}`;
    const teamId = (entry as { teamId?: unknown } | null)?.teamId;
    if (typeof teamId !== "string" || teamId === "") throw new ValidationError(`${where} has no team selected`);
    if (!context.validTeamIds.has(teamId)) throw new ValidationError(`${where}: team is not part of this tournament`);
    if (seenTeamIds.has(teamId)) throw new ValidationError(`${where}: this team is listed twice`);
    seenTeamIds.add(teamId);
    const group = cleanGroup(where, (entry as { group?: unknown }).group);
    groupOfTeam.set(teamId, group);
    teams.push({ teamId, group });
  });

  if (!Array.isArray(raw.matches) || raw.matches.length === 0) {
    throw new ValidationError("The schedule needs at least one match");
  }
  const matches: ProposedPickleballMatch[] = [];
  const seenMatchNumbers = new Set<number>();
  raw.matches.forEach((entry, i) => {
    const where = `Match row ${i + 1}`;
    const m = entry as {
      matchNumber?: unknown;
      round?: unknown;
      court?: unknown;
      group?: unknown;
      team1Id?: unknown;
      team2Id?: unknown;
      gamesToPlay?: unknown;
    } | null;
    if (!m || typeof m !== "object") throw new ValidationError(`${where} is malformed`);

    if (typeof m.matchNumber !== "number" || !Number.isInteger(m.matchNumber) || m.matchNumber <= 0) {
      throw new ValidationError(`${where}: match # must be a positive whole number`);
    }
    if (seenMatchNumbers.has(m.matchNumber)) throw new ValidationError(`${where}: match # ${m.matchNumber} is used twice`);
    seenMatchNumbers.add(m.matchNumber);

    if (typeof m.round !== "string" || m.round.trim() === "") throw new ValidationError(`${where} has no round`);
    const round = m.round.trim();

    let court: string | null = null;
    if (typeof m.court === "string" && m.court.trim() !== "") court = m.court.trim();
    else if (m.court != null && m.court !== "") throw new ValidationError(`${where}: court must be text or blank`);

    const group = cleanGroup(where, m.group);

    if (typeof m.team1Id !== "string" || m.team1Id === "") throw new ValidationError(`${where} has no Team 1 selected`);
    if (typeof m.team2Id !== "string" || m.team2Id === "") throw new ValidationError(`${where} has no Team 2 selected`);
    if (m.team1Id === m.team2Id) throw new ValidationError(`${where}: a team can't play itself`);
    if (!groupOfTeam.has(m.team1Id)) throw new ValidationError(`${where}: Team 1 isn't in this schedule's team list`);
    if (!groupOfTeam.has(m.team2Id)) throw new ValidationError(`${where}: Team 2 isn't in this schedule's team list`);
    if (groupOfTeam.get(m.team1Id) !== group || groupOfTeam.get(m.team2Id) !== group) {
      throw new ValidationError(`${where}: both teams must be in group ${group} to play in it`);
    }

    if (
      typeof m.gamesToPlay !== "number" ||
      !Number.isInteger(m.gamesToPlay) ||
      m.gamesToPlay <= 0 ||
      m.gamesToPlay > PICKLEBALL_SCHEDULE_LIMITS.maxGamesPerMatch
    ) {
      throw new ValidationError(`${where}: games per match must be between 1 and ${PICKLEBALL_SCHEDULE_LIMITS.maxGamesPerMatch}`);
    }

    matches.push({
      matchNumber: m.matchNumber,
      round,
      court,
      group,
      team1Id: m.team1Id,
      team2Id: m.team2Id,
      gamesToPlay: m.gamesToPlay,
    });
  });

  return { teams, matches };
}
