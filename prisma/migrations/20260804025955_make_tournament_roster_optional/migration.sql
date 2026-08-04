-- DropForeignKey
ALTER TABLE "tournaments" DROP CONSTRAINT "tournaments_rosterId_fkey";

-- AlterTable
ALTER TABLE "tournaments" ALTER COLUMN "rosterId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "player_rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
