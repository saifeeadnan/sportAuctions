-- Migration B of the multi-league-users plan: drops the flat role/leagueId/
-- managerBasePrice columns from User now that every call site reads from
-- LeagueMembership instead (backfilled in
-- 20260814201214_add_league_membership's follow-up script,
-- scripts/backfill-league-memberships.ts).

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_leagueId_fkey";

-- DropIndex
DROP INDEX "users_leagueId_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "role",
DROP COLUMN "managerBasePrice",
DROP COLUMN "leagueId";
