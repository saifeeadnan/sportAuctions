-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "maxSponsorsPerTournament" INTEGER,
ADD COLUMN     "maxTeamsPerTournament" INTEGER,
ADD COLUMN     "maxTournaments" INTEGER,
ADD COLUMN     "startDate" TIMESTAMP(3);
