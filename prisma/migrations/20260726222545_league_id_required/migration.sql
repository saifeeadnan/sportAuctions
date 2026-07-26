/*
  Warnings:

  - Made the column `leagueId` on table `player_rosters` required. This step will fail if there are existing NULL values in that column.
  - Made the column `leagueId` on table `tournaments` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "player_rosters" DROP CONSTRAINT "player_rosters_leagueId_fkey";

-- DropForeignKey
ALTER TABLE "tournaments" DROP CONSTRAINT "tournaments_leagueId_fkey";

-- AlterTable
ALTER TABLE "player_rosters" ALTER COLUMN "leagueId" SET NOT NULL;

-- AlterTable
ALTER TABLE "tournaments" ALTER COLUMN "leagueId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "player_rosters" ADD CONSTRAINT "player_rosters_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
