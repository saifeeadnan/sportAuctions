-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LEAGUE_ADMIN';

-- AlterTable
ALTER TABLE "player_rosters" ADD COLUMN     "leagueId" TEXT;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "leagueId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "leagueId" TEXT;

-- CreateTable
CREATE TABLE "leagues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leagues_name_key" ON "leagues"("name");

-- CreateIndex
CREATE INDEX "player_rosters_leagueId_idx" ON "player_rosters"("leagueId");

-- CreateIndex
CREATE INDEX "tournaments_leagueId_idx" ON "tournaments"("leagueId");

-- CreateIndex
CREATE INDEX "users_leagueId_idx" ON "users"("leagueId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_rosters" ADD CONSTRAINT "player_rosters_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
