// Shared helpers for the mock-ipl-auction-{mega,mini}.ts scripts: a small
// deterministic PRNG (so re-runs produce the same "random" fill) and a
// generic "sell some AVAILABLE players to this team at a realistic price"
// helper built on adminAssignPlayer — which already enforces base-price and
// budget-reserve rules, so bulk filler sales are safe by construction even
// though prices aren't individually hand-verified.
import type { PrismaClient } from "../app/generated/prisma/client";
import { adminAssignPlayer } from "../lib/services/bidding.service";

/** mulberry32 — same tiny deterministic PRNG as lib/random.ts, duplicated
 * here rather than imported since this script runs outside the app's own
 * module graph (plain tsx, no path aliases needed for a one-off script). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits the roster's remaining players into mega/mini pools,
 * deterministically (sorted by name) so both auction scripts agree without
 * needing to recompute mock-ipl-data.ts's internal pool-building order.
 * `guaranteedMegaNames` (named anchors + every real retained player + any
 * other name a script references by name, e.g. Glenn Maxwell) always goes
 * to mega. `guaranteedBothNames` (every real retained player — a subset of
 * guaranteedMegaNames) ALSO goes to mini: a team's retained core doesn't
 * change between auctions in the same season, so mini replays the same
 * retention. The rest of guaranteedMegaNames (the live-contest anchors,
 * e.g. Pant/Starc/Kohli) stays mega-only — mini's scripted scenario never
 * needs a specific non-retained star. At SQUAD_SIZE=20 x 10 teams = 200
 * needed per auction, both pools need real slack: mega = ~66 guaranteed +
 * 284 fillers (350 total); mini = 46 retained + 150 of those same 284
 * fillers (overlap, realistic — real mini auctions re-list much of the
 * same shortlisted pool) + the ~140 never used in mega. */
export function splitPoolForAuctions<T extends { id: string; name: string }>(
  allPlayers: T[],
  guaranteedMegaNames: ReadonlySet<string>,
  guaranteedBothNames: ReadonlySet<string>
): { megaPool: T[]; miniPool: T[] } {
  const guaranteed = allPlayers.filter((p) => guaranteedMegaNames.has(p.name));
  const retained = allPlayers.filter((p) => guaranteedBothNames.has(p.name));
  const fillers = allPlayers.filter((p) => !guaranteedMegaNames.has(p.name)).sort((a, b) => a.name.localeCompare(b.name));

  const megaFillers = fillers.slice(0, 284);
  const miniOverlap = megaFillers.slice(0, 150);
  const miniNew = fillers.slice(284); // everything not in mega's 284

  return {
    megaPool: [...guaranteed, ...megaFillers],
    miniPool: [...retained, ...miniOverlap, ...miniNew],
  };
}

/** Sells up to `count` random still-AVAILABLE players in this auction to
 * `entryId`, at a price between 1.0x and `maxMultiplier`x their category's
 * base price (snapped to a whole number) — skips a pick (and tries another)
 * if adminAssignPlayer rejects it (e.g. too close to that team's reserve
 * floor near the end of its budget), so this never throws on a tight team. */
export async function randomlySellPlayers(
  prisma: PrismaClient,
  auctionId: string,
  entryId: string,
  actorUserId: string,
  count: number,
  rng: () => number,
  opts: { maxMultiplier?: number; excludeNames?: ReadonlySet<string> } = {}
): Promise<number> {
  const { maxMultiplier = 1.6, excludeNames } = opts;
  let sold = 0;
  let attempts = 0;
  while (sold < count && attempts < count * 6) {
    attempts += 1;
    const candidate = await prisma.auctionPlayer.findFirst({
      where: {
        auctionId,
        status: "AVAILABLE",
        ...(excludeNames && excludeNames.size > 0
          ? { player: { name: { notIn: Array.from(excludeNames) } } }
          : {}),
      },
      include: { category: true },
      // Deterministic-ish "random" pick: skip a seed-derived offset into
      // the still-available pool rather than always taking the first row.
      skip: Math.floor(rng() * 20),
    });
    if (!candidate) break;

    const basePrice = Number(candidate.category.basePrice);
    const price = Math.round(basePrice * (1 + rng() * (maxMultiplier - 1)));
    try {
      await adminAssignPlayer(auctionId, candidate.id, entryId, price, actorUserId);
      sold += 1;
    } catch {
      // Reserve/budget rejected this one (team's getting tight) — try a
      // cheaper candidate on the next loop iteration instead of failing.
      continue;
    }
  }
  return sold;
}
